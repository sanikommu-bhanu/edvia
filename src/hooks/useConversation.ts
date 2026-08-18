import { useCallback, useEffect, useRef, useState } from "react";
import { streamMessage, startNewConversation, AIUnavailableError } from "@/services/ai/ai.service";
import { useAuth } from "@/app/AuthContext";
import type { ChatMessage, AIAgentState, PendingConfirmation } from "@/types";

export interface ConversationApi {
  messages: ChatMessage[];
  state: AIAgentState;
  /** Safe description of work in flight, e.g. "Checking attendance records…". */
  activity: string | null;
  pendingConfirmation: PendingConfirmation | null;
  /** True while a turn is in flight and can be stopped. */
  busy: boolean;
  send: (text: string) => Promise<void>;
  confirm: () => Promise<void>;
  decline: () => Promise<void>;
  /** Re-runs the last user message, replacing the previous answer. */
  regenerate: () => Promise<void>;
  /** Re-sends a message that failed to send. */
  retry: () => Promise<void>;
  stop: () => void;
  startFresh: () => Promise<void>;
}

/**
 * Owns one chat thread. Every assistant message is built incrementally from
 * the SSE stream, so the bubble fills in as the answer is generated and the
 * avatar/activity line reflect work that is genuinely happening.
 */
export function useConversation(): ConversationApi {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<AIAgentState>("idle");
  const [activity, setActivity] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [busy, setBusy] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const lastUserMessageRef = useRef<string | null>(null);

  const runTurn = useCallback(
    async (text: string, options: { recordUserMessage?: boolean } = {}) => {
      if (!user || !text.trim()) return;
      const { recordUserMessage = true } = options;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      lastUserMessageRef.current = text;
      setBusy(true);
      setPendingConfirmation(null);
      setState("thinking");
      setActivity("Understanding your request…");

      const assistantId = `msg_a_${Date.now()}`;
      if (recordUserMessage) {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg_u_${Date.now()}`,
            role: "user",
            content: text,
            timestamp: new Date().toISOString(),
            status: "sent",
          },
        ]);
      }
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "", timestamp: new Date().toISOString(), status: "sending" },
      ]);

      const patch = (updater: (m: ChatMessage) => ChatMessage) =>
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? updater(m) : m)));

      try {
        for await (const event of streamMessage(
          { uid: user.uid, role: user.role, schoolId: user.schoolId, studentId: user.studentId, language: user.language },
          text,
          { signal: controller.signal }
        )) {
          switch (event.type) {
            case "activity":
              setState(event.state);
              setActivity(event.label);
              break;
            case "delta":
              patch((m) => ({ ...m, content: m.content + event.text }));
              break;
            case "reset":
              patch((m) => ({ ...m, content: "" }));
              break;
            case "final":
              patch((m) => ({
                ...m,
                content: event.result.message,
                status: "sent",
                sources: event.result.sources.length ? event.result.sources : undefined,
                suggestedFollowUps: event.result.suggestedActions.length ? event.result.suggestedActions : undefined,
                toolUsed: event.result.toolUsed ?? undefined,
                requiresConfirmation: event.result.requiresConfirmation ?? undefined,
              }));
              setPendingConfirmation(event.result.requiresConfirmation);
              setState(event.result.requiresConfirmation ? "idle" : "success");
              break;
            case "error":
              patch((m) => ({ ...m, content: event.message, status: "error" }));
              setState("error");
              break;
          }
        }
      } catch (err) {
        if (controller.signal.aborted) {
          patch((m) => ({ ...m, content: m.content || "Stopped.", status: "sent" }));
          setState("idle");
        } else {
          const message =
            err instanceof AIUnavailableError
              ? err.message
              : "EDVIA AI is temporarily unavailable. You can continue using your school dashboard.";
          patch((m) => ({ ...m, content: message, status: "error" }));
          setState("error");
        }
      } finally {
        setActivity(null);
        setBusy(false);
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [user]
  );

  const send = useCallback((text: string) => runTurn(text), [runTurn]);

  // Confirm/decline are ordinary turns: the server holds the pending action
  // and decides what "yes" means, so the client never executes anything.
  const confirm = useCallback(() => runTurn("Yes"), [runTurn]);
  const decline = useCallback(() => runTurn("No"), [runTurn]);

  const regenerate = useCallback(async () => {
    const last = lastUserMessageRef.current;
    if (!last) return;
    // Drop the previous answer so the thread doesn't show two replies.
    setMessages((prev) => {
      const lastAssistant = [...prev].reverse().find((m) => m.role === "assistant");
      return lastAssistant ? prev.filter((m) => m.id !== lastAssistant.id) : prev;
    });
    await runTurn(last, { recordUserMessage: false });
  }, [runTurn]);

  const retry = useCallback(async () => {
    const last = lastUserMessageRef.current;
    if (!last) return;
    setMessages((prev) => prev.filter((m) => m.status !== "error"));
    await runTurn(last, { recordUserMessage: false });
  }, [runTurn]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setBusy(false);
    setState("idle");
    setActivity(null);
  }, []);

  const startFresh = useCallback(async () => {
    if (!user) return;
    abortRef.current?.abort();
    await startNewConversation(user.uid);
    setMessages([]);
    setPendingConfirmation(null);
    setState("idle");
    setActivity(null);
    lastUserMessageRef.current = null;
  }, [user]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { messages, state, activity, pendingConfirmation, busy, send, confirm, decline, regenerate, retry, stop, startFresh };
}
