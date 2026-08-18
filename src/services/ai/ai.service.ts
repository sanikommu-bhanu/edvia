// ==========================================================================
// EDVIA AI service — client-side
// --------------------------------------------------------------------------
// The ONLY module UI components talk to for text conversation. It never
// calls Gemini directly and never holds a Gemini API key: it calls EDVIA's
// own secured backend (api/ai/chat.ts), which verifies identity, authorizes
// tools, and invokes Gemini server-side.
//
// The response is a Server-Sent Event stream, so callers receive real
// activity updates and partial text instead of waiting for a whole answer.
// ==========================================================================
import { getIdToken } from "@/services/firebase/auth.service";
import type { AIAgentState, AISource, PendingConfirmation, Role, LanguageCode } from "@/types";

export interface AIRequestContext {
  uid: string;
  role: Role;
  schoolId: string;
  studentId?: string;
  language: string;
}

export interface AITurnResult {
  message: string;
  intent: string | null;
  toolUsed: string | null;
  sources: AISource[];
  suggestedActions: string[];
  requiresConfirmation: PendingConfirmation | null;
  language: LanguageCode;
}

export type AIStreamEvent =
  | { type: "activity"; state: AIAgentState; label: string }
  | { type: "delta"; text: string }
  | { type: "reset" }
  | { type: "final"; result: AITurnResult }
  | { type: "error"; message: string };

export class AIUnavailableError extends Error {}

/** One conversation thread per signed-in user per browser session. */
function conversationIdFor(uid: string): string {
  const key = `edvia.conversationId.${uid}`;
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = `conv_${uid}_${Date.now()}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

export interface SendMessageOptions {
  /** Aborts the in-flight turn (user pressed stop, or navigated away). */
  signal?: AbortSignal;
}

/**
 * Streams one conversational turn. Yields every event the orchestrator
 * emits, ending with exactly one `final` or one `error`.
 */
export async function* streamMessage(
  context: AIRequestContext,
  userText: string,
  options: SendMessageOptions = {}
): AsyncGenerator<AIStreamEvent> {
  const token = await getIdToken();
  if (!token) {
    yield {
      type: "error",
      message:
        "EDVIA needs a signed-in school account to look up real records. Please sign in again, or continue browsing your dashboard.",
    };
    return;
  }

  let response: Response;
  try {
    response = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ conversationId: conversationIdFor(context.uid), message: userText }),
      signal: options.signal,
    });
  } catch {
    yield {
      type: "error",
      message: "I couldn't reach EDVIA just now. Check your connection and try again.",
    };
    return;
  }

  if (!response.ok || !response.body) {
    const detail = await response.json().catch(() => ({}) as { error?: string });
    yield {
      type: "error",
      message: detail.error ?? "EDVIA ran into a problem answering that. Please try again.",
    };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line.
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");

        const line = frame.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        const payload = line.slice(6);
        if (payload === "[DONE]") return;
        try {
          yield JSON.parse(payload) as AIStreamEvent;
        } catch {
          // A truncated frame is not worth failing the whole turn over.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Non-streaming convenience wrapper — collects the stream into one result. */
export async function sendMessage(
  context: AIRequestContext,
  userText: string,
  options: SendMessageOptions = {}
): Promise<AITurnResult> {
  let text = "";
  for await (const event of streamMessage(context, userText, options)) {
    if (event.type === "delta") text += event.text;
    if (event.type === "reset") text = "";
    if (event.type === "final") return event.result;
    if (event.type === "error") throw new AIUnavailableError(event.message);
  }
  return {
    message: text || "I wasn't able to answer that — could you try asking a different way?",
    intent: null,
    toolUsed: null,
    sources: [],
    suggestedActions: [],
    requiresConfirmation: null,
    language: "en",
  };
}

export async function startNewConversation(uid: string): Promise<void> {
  const token = await getIdToken();
  const conversationId = conversationIdFor(uid);
  sessionStorage.removeItem(`edvia.conversationId.${uid}`);
  if (!token) return;
  try {
    await fetch(`/api/ai/conversation?conversationId=${encodeURIComponent(conversationId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Best-effort: a fresh local conversationId already starts a clean thread.
  }
}

/** Quick-start prompts on the assistant home screen, tailored per role. */
export function suggestedStartersFor(role: Role): string[] {
  switch (role) {
    case "student":
      return ["What is my attendance?", "What's due this week?", "Explain Newton's laws", "When is my next exam?"];
    case "parent":
      return [
        "How much attendance does my child have?",
        "Any notices from school?",
        "What's the attendance policy?",
        "I'd like to talk to the teacher",
      ];
    case "teacher":
      return ["Show my class attendance", "Mark Rahul absent today", "What's due for my class?", "Any school notices?"];
    case "principal":
      return [
        "What is the overall attendance?",
        "Which class needs attention?",
        "Show school analytics",
        "Any notices this week?",
      ];
  }
}

/** Human label for an evidence chip. Names the system of record, not a table. */
export const SOURCE_LABELS: Record<AISource["kind"], string> = {
  policy: "School Policy",
  educational: "Educational Reference",
  resource: "School Resource",
  document: "Uploaded Document",
  attendance: "Attendance Records",
  academic: "Academic Records",
  school: "School Records",
};
