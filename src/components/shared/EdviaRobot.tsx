import { cn } from "@/lib/utils";
import { stateLabel } from "@/components/shared/agentState";
import type { AIAgentState } from "@/types";

// ==========================================================================
// The EDVIA robot — EDVIA's AI identity across onboarding, the assistant
// home, chat and voice mode.
//
// Every visual difference below is driven by `state`, and `state` is set
// from work that is actually happening: the orchestrator emits an activity
// event when it starts verifying access, when a tool is genuinely
// executing, and when it begins composing the answer. Nothing here is on a
// timer pretending to be busy.
// ==========================================================================

type Expression = "neutral" | "attentive" | "focused" | "happy" | "concerned";

interface StateVisuals {
  expression: Expression;
  /** Halo behind the robot. */
  halo: "none" | "soft" | "pulse" | "fast";
  /** Antenna light. */
  beacon: "off" | "steady" | "blink";
  accent: string;
}

const STATE_VISUALS: Record<AIAgentState, StateVisuals> = {
  idle: { expression: "neutral", halo: "none", beacon: "steady", accent: "#8257D3" },
  listening: { expression: "attentive", halo: "pulse", beacon: "blink", accent: "#4F8DF7" },
  thinking: { expression: "focused", halo: "soft", beacon: "blink", accent: "#8257D3" },
  verifying: { expression: "focused", halo: "soft", beacon: "blink", accent: "#8257D3" },
  processing: { expression: "focused", halo: "soft", beacon: "blink", accent: "#8257D3" },
  tool_execution: { expression: "focused", halo: "fast", beacon: "blink", accent: "#6B3FBE" },
  speaking: { expression: "happy", halo: "pulse", beacon: "steady", accent: "#4F8DF7" },
  interrupted: { expression: "attentive", halo: "soft", beacon: "blink", accent: "#4F8DF7" },
  connected: { expression: "neutral", halo: "soft", beacon: "blink", accent: "#8257D3" },
  disconnected: { expression: "neutral", halo: "none", beacon: "off", accent: "#9A8FB5" },
  success: { expression: "happy", halo: "soft", beacon: "steady", accent: "#22A06B" },
  error: { expression: "concerned", halo: "none", beacon: "steady", accent: "#E5484D" },
};

const HALO_CLASS: Record<StateVisuals["halo"], string> = {
  none: "opacity-0",
  soft: "opacity-60 animate-pulse-soft",
  pulse: "opacity-80 animate-pulse-soft",
  fast: "opacity-90 animate-ping",
};

export function EdviaRobot({
  size = 120,
  state = "idle",
  className,
  /** 0–1 audio level; makes the mouth react to real speech in voice mode. */
  amplitude = 0,
}: {
  size?: number;
  state?: AIAgentState;
  className?: string;
  amplitude?: number;
}) {
  const visuals = STATE_VISUALS[state] ?? STATE_VISUALS.idle;
  const eye = eyeGeometry(visuals.expression);
  const mouth = mouthGeometry(visuals.expression, state === "speaking" ? amplitude : 0);
  const gradientId = `edviaAccent-${state}`;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`EDVIA assistant — ${stateLabel(state)}`}
    >
      <span
        className={cn("absolute inset-2 rounded-full blur-xl transition-opacity duration-300", HALO_CLASS[visuals.halo])}
        style={{ backgroundColor: `${visuals.accent}55` }}
        aria-hidden
      />
      <svg
        viewBox="0 0 120 120"
        width={size}
        height={size}
        className="relative drop-shadow-[0_8px_20px_rgba(130,87,211,0.25)]"
        aria-hidden
      >
        <defs>
          <linearGradient id="edviaBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F4F0FC" />
            <stop offset="100%" stopColor="#E4DAF7" />
          </linearGradient>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={visuals.accent} />
            <stop offset="100%" stopColor={shade(visuals.accent)} />
          </linearGradient>
        </defs>

        {/* antenna */}
        <circle cx="60" cy="14" r="5" fill={`url(#${gradientId})`} opacity={visuals.beacon === "off" ? 0.3 : 1}>
          {visuals.beacon === "blink" && (
            <animate attributeName="opacity" values="1;0.25;1" dur="1.1s" repeatCount="indefinite" />
          )}
        </circle>
        <line x1="60" y1="19" x2="60" y2="30" stroke="#C4AEEC" strokeWidth="3" strokeLinecap="round" />

        {/* head */}
        <rect x="28" y="28" width="64" height="52" rx="22" fill="url(#edviaBody)" stroke="#C4AEEC" strokeWidth="1.5" />

        {/* face screen */}
        <rect x="38" y="42" width="44" height="26" rx="13" fill={`url(#${gradientId})`} />

        {/* eyes */}
        <ellipse cx="53" cy={eye.cy} rx={eye.rx} ry={eye.ry} fill="#fff">
          {visuals.expression === "focused" && (
            <animate attributeName="ry" values={`${eye.ry};${eye.ry * 0.35};${eye.ry}`} dur="2.2s" repeatCount="indefinite" />
          )}
        </ellipse>
        <ellipse cx="67" cy={eye.cy} rx={eye.rx} ry={eye.ry} fill="#fff">
          {visuals.expression === "focused" && (
            <animate attributeName="ry" values={`${eye.ry};${eye.ry * 0.35};${eye.ry}`} dur="2.2s" repeatCount="indefinite" />
          )}
        </ellipse>

        {/* mouth — only drawn where the expression calls for one */}
        {mouth && <path d={mouth} stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" />}

        {/* ears */}
        <rect x="20" y="46" width="8" height="16" rx="4" fill="#C4AEEC" />
        <rect x="92" y="46" width="8" height="16" rx="4" fill="#C4AEEC" />

        {/* body */}
        <rect x="36" y="82" width="48" height="30" rx="14" fill="url(#edviaBody)" stroke="#C4AEEC" strokeWidth="1.5" />
        <circle cx="60" cy="97" r="6" fill={`url(#${gradientId})`}>
          {(state === "tool_execution" || state === "verifying") && (
            <animate attributeName="r" values="6;4;6" dur="0.9s" repeatCount="indefinite" />
          )}
        </circle>
      </svg>
    </div>
  );
}

function eyeGeometry(expression: Expression) {
  switch (expression) {
    case "attentive":
      return { cy: 55, rx: 4.6, ry: 4.6 };
    case "focused":
      return { cy: 55, rx: 4, ry: 3.2 };
    case "happy":
      return { cy: 54, rx: 4, ry: 4.4 };
    case "concerned":
      return { cy: 56, rx: 3.6, ry: 3.6 };
    default:
      return { cy: 55, rx: 3.6, ry: 3.6 };
  }
}

/** Speaking opens the mouth in proportion to real audio energy. */
function mouthGeometry(expression: Expression, amplitude: number): string | null {
  if (expression === "happy") {
    const open = 1 + Math.min(1, amplitude) * 4;
    return `M 54 62 Q 60 ${62 + open} 66 62`;
  }
  if (expression === "concerned") return "M 54 63 Q 60 60 66 63";
  return null;
}

/** Slightly darker companion colour for the gradient's far stop. */
function shade(hex: string): string {
  const value = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((value >> 16) & 255) - 30);
  const g = Math.max(0, ((value >> 8) & 255) - 30);
  const b = Math.max(0, (value & 255) - 30);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
