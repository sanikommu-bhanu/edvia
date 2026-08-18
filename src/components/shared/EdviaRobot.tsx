import { cn } from "@/lib/utils";
import type { AIAgentState } from "@/types";

// A single consistent SVG character used intentionally across onboarding,
// AI empty states, and AI screens — not scattered throughout the whole app.
export function EdviaRobot({
  size = 120,
  state = "idle",
  className,
}: {
  size?: number;
  state?: AIAgentState;
  className?: string;
}) {
  const pulse = state === "listening" || state === "thinking" || state === "processing" || state === "speaking" || state === "tool_execution";
  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      {pulse && (
        <span className="absolute inset-0 animate-pulse-soft rounded-full bg-edvia-300/40 blur-xl" aria-hidden />
      )}
      <svg viewBox="0 0 120 120" width={size} height={size} className="relative drop-shadow-[0_8px_20px_rgba(130,87,211,0.25)]">
        <defs>
          <linearGradient id="edviaBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F4F0FC" />
            <stop offset="100%" stopColor="#E4DAF7" />
          </linearGradient>
          <linearGradient id="edviaAccent" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8257D3" />
            <stop offset="100%" stopColor="#6B3FBE" />
          </linearGradient>
        </defs>
        {/* antenna */}
        <circle cx="60" cy="14" r="5" fill="url(#edviaAccent)" />
        <line x1="60" y1="19" x2="60" y2="30" stroke="#C4AEEC" strokeWidth="3" strokeLinecap="round" />
        {/* head */}
        <rect x="28" y="28" width="64" height="52" rx="22" fill="url(#edviaBody)" stroke="#C4AEEC" strokeWidth="1.5" />
        {/* face screen */}
        <rect x="38" y="42" width="44" height="26" rx="13" fill="url(#edviaAccent)" />
        <circle cx="53" cy="55" r={state === "listening" ? 4.5 : 3.5} fill="#fff" />
        <circle cx="67" cy="55" r={state === "listening" ? 4.5 : 3.5} fill="#fff" />
        {/* ears */}
        <rect x="20" y="46" width="8" height="16" rx="4" fill="#C4AEEC" />
        <rect x="92" y="46" width="8" height="16" rx="4" fill="#C4AEEC" />
        {/* body */}
        <rect x="36" y="82" width="48" height="30" rx="14" fill="url(#edviaBody)" stroke="#C4AEEC" strokeWidth="1.5" />
        <circle cx="60" cy="97" r="6" fill="url(#edviaAccent)" />
      </svg>
    </div>
  );
}

export function stateLabel(state: AIAgentState): string {
  switch (state) {
    case "idle": return "Ready to help";
    case "listening": return "Listening…";
    case "thinking": return "Thinking…";
    case "processing": return "Processing…";
    case "tool_execution": return "Checking school data…";
    case "speaking": return "Speaking…";
    case "interrupted": return "Go ahead…";
    case "connected": return "Connecting…";
    case "disconnected": return "Voice mode ended";
    case "success": return "Done";
    case "error": return "Something went wrong";
  }
}
