import type { AIAgentState } from "@/types";

/**
 * Safe, user-facing description of each state. Deliberately says what EDVIA
 * is doing, never how it is reasoning — no chain-of-thought is exposed.
 */
export function stateLabel(state: AIAgentState): string {
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
