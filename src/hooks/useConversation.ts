import { useCallback, useRef, useState } from "react";
import { sendMessage, startNewConversation } from "@/services/ai/ai.service";
import { useAuth } from "@/app/AuthContext";
import type { ChatMessage, AIAgentState, PendingConfirmation } from "@/types";

export function useConversation() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<AIAgentState>("idle");
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const sending = useRef(false);

  const send = useCallback(
    async (text: string) => {
      if (!user || sending.current || !text.trim()) return;
      sending.current = true;

      const userMsg: ChatMessage = { id: `msg_${Date.now()}`, role: "user", content: text, timestamp: new Date().toISOString(), status: "sent" };
      setMessages((prev) => [...prev, userMsg]);
      setState("thinking");

      const result = await sendMessage({ uid: user.uid, role: user.role, schoolId: user.schoolId, studentId: user.studentId, language: user.language }, text);

      setMessages((prev) => [...prev, result.message]);
      setPendingConfirmation(result.message.requiresConfirmation ?? null);
      setState(result.nextState);
      sending.current = false;
    },
    [user]
  );

  const confirm = useCallback(() => send("Yes, go ahead."), [send]);
  const decline = useCallback(() => send("No, cancel that."), [send]);

  const startFresh = useCallback(async () => {
    if (!user) return;
    await startNewConversation(user.uid);
    setMessages([]);
    setPendingConfirmation(null);
    setState("idle");
  }, [user]);

  return { messages, state, pendingConfirmation, send, confirm, decline, startFresh };
}
