import { useAuth } from "@/app/AuthContext";
import { SUGGESTED_ACTIONS } from "@/services/ai/ai.service";

/**
 * Top-level EDVIA hook — the entry point AssistantHome and other
 * non-conversation screens use. Conversation-specific state lives in
 * useConversation(); voice-specific state lives in useVoiceAssistant().
 */
export function useEdvia() {
  const { user } = useAuth();
  return {
    user,
    suggestedActions: SUGGESTED_ACTIONS,
    firstName: user?.fullName?.split(" ")[0] ?? "there",
  };
}
