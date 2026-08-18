// ==========================================================================
// EDVIA AI service — client-side
// --------------------------------------------------------------------------
// This is the ONLY module UI components (via useConversation/useEdvia) talk
// to for AI text conversation. It never calls Gemini directly and never
// holds a Gemini API key — it calls EDVIA's own secured backend
// (api/ai/chat.ts), which is where identity is verified, tools are
// authorized, and Gemini is actually invoked.
//
// When the app is running in local mock-auth mode (no Firebase project
// configured — see services/firebase/config.ts), there is no verifiable
// identity to send the backend, so this falls back to a clearly-labeled
// placeholder rather than pretending to reason about real school data.
// ==========================================================================
import { getIdToken } from "@/services/firebase/auth.service";
import type { AIAgentState, ChatMessage, AISource, Role, PendingConfirmation } from "@/types";

export interface AIRequestContext {
  uid: string;
  role: Role;
  schoolId: string;
  studentId?: string;
  language: string;
}

export interface SendMessageResult {
  message: ChatMessage;
  nextState: AIAgentState;
}

export const isAIConfigured = true; // backend availability is checked per-call via getIdToken()

interface BackendChatResponse {
  message: string;
  intent: string | null;
  toolUsed: string | null;
  sources: AISource[];
  suggestedActions: string[];
  requiresConfirmation: PendingConfirmation | null;
  error?: string;
}

function conversationIdFor(uid: string): string {
  const key = `edvia.conversationId.${uid}`;
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = `conv_${uid}_${Date.now()}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

export async function sendMessage(context: AIRequestContext, userText: string): Promise<SendMessageResult> {
  const token = await getIdToken();

  if (!token) {
    await new Promise((r) => setTimeout(r, 600));
    return {
      nextState: "idle",
      message: {
        id: `msg_${Date.now()}`,
        role: "assistant",
        content:
          "EDVIA's full reasoning needs a connected school account (Firebase) to securely verify who's asking — this preview build is running on local demo data, so I can't look up real records here. Everything is wired and ready on the backend once Firebase Auth is connected.",
        timestamp: new Date().toISOString(),
        status: "sent",
      },
    };
  }

  try {
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ conversationId: conversationIdFor(context.uid), message: userText }),
    });

    const data = (await res.json()) as BackendChatResponse;
    if (!res.ok) throw new Error(data.error ?? "EDVIA couldn't process that.");

    return {
      nextState: "idle",
      message: {
        id: `msg_${Date.now()}`,
        role: "assistant",
        content: data.message,
        timestamp: new Date().toISOString(),
        status: "sent",
        sources: data.sources.length ? data.sources : undefined,
        suggestedFollowUps: data.suggestedActions.length ? data.suggestedActions : undefined,
        toolUsed: data.toolUsed ?? undefined,
        requiresConfirmation: data.requiresConfirmation ?? undefined,
      },
    };
  } catch (err) {
    return {
      nextState: "error",
      message: {
        id: `msg_${Date.now()}`,
        role: "assistant",
        content: err instanceof Error ? err.message : "Something went wrong. Please try again.",
        timestamp: new Date().toISOString(),
        status: "error",
      },
    };
  }
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
    // Clearing server-side memory is best-effort; a fresh conversationId
    // locally is enough to start a clean thread either way.
  }
}

export const SUGGESTED_ACTIONS = [
  "Homework Help",
  "Concept Explanation",
  "Summarize",
  "Study Tips",
  "Attendance",
  "School Information",
] as const;

export const MOCK_SOURCE_KINDS: Record<AISource["kind"], string> = {
  policy: "School Policy",
  educational: "Educational Reference",
  resource: "School Resource",
  document: "Uploaded Document",
};
