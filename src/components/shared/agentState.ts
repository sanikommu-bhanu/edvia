import { translate } from "@/i18n";
import type { AIAgentState, LanguageCode } from "@/types";

/**
 * Safe, user-facing description of each state. Deliberately says what EDVIA
 * is doing, never how it is reasoning — no chain-of-thought is exposed.
 *
 * The states a user actually watches during a turn — listening, thinking,
 * speaking, verifying, checking records — are translated. The connection
 * lifecycle states stay English: they are brief, rarely seen, and inventing
 * ten translations for "Voice mode ended" adds review burden for no gain.
 */
export function stateLabel(state: AIAgentState, language: LanguageCode = "en"): string {
  switch (state) {
    case "idle":
      return translate(language, "ai.ready");
    case "listening":
      return translate(language, "ai.listening");
    case "thinking":
      return translate(language, "ai.thinking");
    case "verifying":
      return translate(language, "ai.verifying");
    case "tool_execution":
      return translate(language, "ai.checkingRecords");
    case "speaking":
      return translate(language, "ai.speaking");
    default:
      return englishStateLabel(state);
  }
}

/** The remaining lifecycle states, English-only by design (see above). */
function englishStateLabel(state: AIAgentState): string {
  switch (state) {
    case "idle":
      return "Ready to help";
    case "listening":
      return "Listening…";
    case "thinking":
      return "Thinking…";
    case "verifying":
      return "Verifying access…";
    case "processing":
      return "Processing…";
    case "tool_execution":
      return "Checking school records…";
    case "speaking":
      return "Speaking…";
    case "interrupted":
      return "Go ahead…";
    case "connected":
      return "Connecting…";
    case "disconnected":
      return "Voice mode ended";
    case "success":
      return "Done";
    case "error":
      return "Something went wrong";
  }
}
