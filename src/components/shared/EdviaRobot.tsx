import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { stateLabel } from "@/components/shared/agentState";
import { useTranslation } from "@/i18n";
import type { AIAgentState } from "@/types";

// ==========================================================================
// The EDVIA robot — the product's face
// --------------------------------------------------------------------------
// Every visual difference below is driven by `state`, and `state` comes from
// work that is genuinely happening: the orchestrator emits an activity event
// when it starts verifying access, when a tool is actually executing, and
// when it begins composing the answer. Nothing here runs on a timer
// pretending to be busy.
//
// The one exception is IDLE ambient motion — breathing, floating, blinking,
// the occasional glance. That is not simulating work; it is the difference
// between a character and a picture of a character. It stops the moment a
// real state arrives.
//
// PERFORMANCE
// This is on screen constantly on a phone, so everything animates via CSS
// transform/opacity only — no layout, no paint-heavy filters in loops, no
// canvas, no rAF except the blink scheduler (a single setTimeout chain).
// Particles are six absolutely-positioned spans, not a particle engine.
//
// REDUCED MOTION
// globals.css neutralises CSS animation, but SVG SMIL <animate> ignores
// `animation-duration` entirely, so those elements are conditionally NOT
// RENDERED via useReducedMotion(). The robot still changes colour,
// expression and glow per state — it simply stops moving.
// ==========================================================================

type Expression = "neutral" | "attentive" | "focused" | "happy" | "concerned";

interface StateVisuals {
  expression: Expression;
  /** Ambient energy field behind the robot. */
  aura: "none" | "soft" | "pulse" | "active";
  /** Antenna light. */
  beacon: "off" | "steady" | "blink";
  /** Slow orbital ring — reads as "processing" without a spinner. */
  orbit: boolean;
  /** Rising particles — thinking / working. */
  particles: boolean;
  /** One-shot body motion on entering the state. */
  entrance: "none" | "bounce" | "shake";
  /** Leans very slightly forward while listening. */
  lean: boolean;
  accent: string;
}

const STATE_VISUALS: Record<AIAgentState, StateVisuals> = {
  idle:      { expression: "neutral",   aura: "soft",   beacon: "steady", orbit: false, particles: false, entrance: "none",   lean: false, accent: "#8257D3" },
  listening: { expression: "attentive", aura: "pulse",  beacon: "blink",  orbit: false, particles: false, entrance: "none",   lean: true,  accent: "#4F8DF7" },
  thinking:  { expression: "focused",   aura: "active", beacon: "blink",  orbit: true,  particles: true,  entrance: "none",   lean: false, accent: "#8257D3" },
  verifying: { expression: "focused",   aura: "active", beacon: "blink",  orbit: true,  particles: true,  entrance: "none",   lean: false, accent: "#6B3FBE" },
  processing:{ expression: "focused",   aura: "active", beacon: "blink",  orbit: true,  particles: true,  entrance: "none",   lean: false, accent: "#6B3FBE" },
  tool_execution: { expression: "focused", aura: "active", beacon: "blink", orbit: true, particles: true, entrance: "none",  lean: false, accent: "#6B3FBE" },
  speaking:  { expression: "happy",     aura: "pulse",  beacon: "steady", orbit: false, particles: false, entrance: "none",   lean: false, accent: "#4F8DF7" },
  interrupted:{ expression: "attentive",aura: "soft",   beacon: "blink",  orbit: false, particles: false, entrance: "none",   lean: true,  accent: "#4F8DF7" },
  connected: { expression: "neutral",   aura: "soft",   beacon: "blink",  orbit: false, particles: false, entrance: "none",   lean: false, accent: "#8257D3" },
  disconnected:{ expression: "neutral", aura: "none",   beacon: "off",    orbit: false, particles: false, entrance: "none",   lean: false, accent: "#9A8FB5" },
  success:   { expression: "happy",     aura: "pulse",  beacon: "steady", orbit: false, particles: false, entrance: "bounce", lean: false, accent: "#22A06B" },
  error:     { expression: "concerned", aura: "none",   beacon: "steady", orbit: false, particles: false, entrance: "shake",  lean: false, accent: "#E5484D" },
};

const AURA_CLASS: Record<StateVisuals["aura"], string> = {
  none: "opacity-0",
  soft: "opacity-45 animate-glow-pulse",
  pulse: "opacity-70 animate-glow-pulse",
  active: "opacity-80 animate-glow-pulse",
};

/** Same opacities, no motion — used when reduced motion is requested. */
const STATIC_AURA_CLASS: Record<StateVisuals["aura"], string> = {
  none: "opacity-0",
  soft: "opacity-45",
  pulse: "opacity-70",
  active: "opacity-80",
};

/**
 * Blink scheduler.
 *
 * Blinks arrive at an irregular interval (2.4–6.2 s) rather than on a fixed
 * beat. A perfectly periodic blink is one of the strongest "this is a loop"
 * tells, and irregularity is most of what makes the face read as alive.
 * Paused entirely when the robot is speaking — a talking face blinking on
 * its own schedule looks wrong — and when reduced motion is set.
 */
function useBlink(enabled: boolean): boolean {
  const [closed, setClosed] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setClosed(false);
      return;
    }
    let cancelled = false;

    const schedule = () => {
      const delay = 2400 + Math.random() * 3800;
      timer.current = window.setTimeout(() => {
        if (cancelled) return;
        setClosed(true);
        timer.current = window.setTimeout(() => {
          if (cancelled) return;
          setClosed(false);
          schedule();
        }, 130);
      }, delay);
    };
    schedule();

    return () => {
      cancelled = true;
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [enabled]);

  return closed;
}

/**
 * Idle glance.
 *
 * Every so often the eyes drift a couple of pixels and come back. Tiny —
 * ±1.6px — but it is the difference between "waiting" and "switched off".
 */
function useGlance(enabled: boolean): number {
  const [offset, setOffset] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setOffset(0);
      return;
    }
    let cancelled = false;

    const schedule = () => {
      timer.current = window.setTimeout(
        () => {
          if (cancelled) return;
          setOffset(Math.random() < 0.5 ? -1.6 : 1.6);
          timer.current = window.setTimeout(() => {
            if (cancelled) return;
            setOffset(0);
            schedule();
          }, 900);
        },
        3200 + Math.random() * 4200
      );
    };
    schedule();

    return () => {
      cancelled = true;
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [enabled]);

  return offset;
}

export function EdviaRobot({
  size = 120,
  state = "idle",
  className,
  /** 0–1 audio level; drives the mouth and aura from REAL audio energy. */
  amplitude = 0,
}: {
  size?: number;
  state?: AIAgentState;
  className?: string;
  amplitude?: number;
}) {
  const reducedMotion = useReducedMotion();
  const { language } = useTranslation();
  const visuals = STATE_VISUALS[state] ?? STATE_VISUALS.idle;

  const animate = !reducedMotion;
  const blinking = useBlink(animate && state !== "speaking");
  const glance = useGlance(animate && (state === "idle" || state === "listening"));

  const eye = eyeGeometry(visuals.expression, blinking);
  const mouth = mouthGeometry(visuals.expression, state === "speaking" ? amplitude : 0);
  const gradientId = `edviaAccent-${state}`;

  // The aura breathes with real audio while speaking or listening, so the
  // energy field is reacting to sound rather than running a canned loop.
  const audioScale = state === "speaking" || state === "listening" ? 1 + Math.min(1, amplitude) * 0.18 : 1;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="img"
      // Screen readers get the same human phrasing sighted users see, in
      // the user's own language — not the internal state name.
      aria-label={`EDVIA — ${stateLabel(state, language)}`}
    >
      {/* ---- energy field ------------------------------------------------
          Two stacked radial glows at different scales give depth without a
          filter chain. Transform-only, so it stays cheap on a phone. */}
      <span
        className={cn(
          "pointer-events-none absolute inset-0 rounded-full blur-2xl transition-opacity duration-500",
          animate ? AURA_CLASS[visuals.aura] : STATIC_AURA_CLASS[visuals.aura]
        )}
        style={{
          background: `radial-gradient(circle, ${visuals.accent}66 0%, ${visuals.accent}00 68%)`,
          transform: `scale(${audioScale})`,
          transition: "transform 120ms linear, opacity 500ms",
        }}
        aria-hidden
      />
      <span
        className={cn(
          "pointer-events-none absolute inset-[18%] rounded-full blur-xl transition-opacity duration-500",
          visuals.aura === "none" ? "opacity-0" : "opacity-60"
        )}
        style={{ background: `radial-gradient(circle, ${visuals.accent}44 0%, ${visuals.accent}00 70%)` }}
        aria-hidden
      />

      {/* ---- orbital ring -------------------------------------------------
          Reads as "working" far better than a spinner, because it belongs
          to the character rather than being borrowed UI chrome. */}
      {visuals.orbit && animate && (
        <>
          <span className="pointer-events-none absolute inset-[-6%] animate-orbit-slow" aria-hidden>
            <span
              className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full"
              style={{ backgroundColor: visuals.accent, boxShadow: `0 0 8px ${visuals.accent}` }}
            />
          </span>
          <span className="pointer-events-none absolute inset-[2%] animate-orbit-reverse" aria-hidden>
            <span
              className="absolute bottom-0 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full opacity-70"
              style={{ backgroundColor: visuals.accent }}
            />
          </span>
        </>
      )}

      {/* ---- thinking particles -------------------------------------------
          Six spans on staggered delays. Deliberately not a particle system:
          the effect is ambient, and a phone should not run a simulation for
          it. */}
      {visuals.particles && animate && (
        <span className="pointer-events-none absolute inset-0" aria-hidden>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className="absolute h-1 w-1 rounded-full animate-particle-rise"
              style={{
                backgroundColor: visuals.accent,
                left: `${18 + i * 13}%`,
                bottom: "22%",
                animationDelay: `${i * 0.38}s`,
                opacity: 0,
              }}
            />
          ))}
        </span>
      )}

      {/* ---- the robot ----------------------------------------------------
          Breathing and floating run at different periods (4.2s / 5.5s) so
          they never sync into a single mechanical bob. */}
      <span
        className={cn(
          "relative",
          animate && "animate-float",
          visuals.entrance === "bounce" && animate && "animate-bounce-once",
          visuals.entrance === "shake" && animate && "animate-shake-soft"
        )}
      >
        <svg
          viewBox="0 0 120 120"
          width={size}
          height={size}
          className={cn("relative drop-shadow-[0_8px_22px_rgba(130,87,211,0.22)]", animate && "animate-breathe")}
          style={{
            transform: visuals.lean ? "translateY(2px) scale(1.015)" : undefined,
            transition: "transform 400ms var(--ease-out-soft)",
          }}
          aria-hidden
        >
          <defs>
            <linearGradient id="edviaBody" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FDFCFF" />
              <stop offset="100%" stopColor="#E4DAF7" />
            </linearGradient>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={visuals.accent} />
              <stop offset="100%" stopColor={shade(visuals.accent)} />
            </linearGradient>
            {/* Soft top-light on the shell, so it reads as a physical object
                rather than a flat sticker. */}
            <linearGradient id="edviaSheen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* antenna */}
          <circle cx="60" cy="14" r="5" fill={`url(#${gradientId})`} opacity={visuals.beacon === "off" ? 0.3 : 1}>
            {visuals.beacon === "blink" && animate && (
              <animate attributeName="opacity" values="1;0.25;1" dur="1.1s" repeatCount="indefinite" />
            )}
          </circle>
          <line x1="60" y1="19" x2="60" y2="30" stroke="#C4AEEC" strokeWidth="3" strokeLinecap="round" />

          {/* head */}
          <rect x="28" y="28" width="64" height="52" rx="22" fill="url(#edviaBody)" stroke="#C4AEEC" strokeWidth="1.5" />
          <rect x="32" y="31" width="56" height="18" rx="12" fill="url(#edviaSheen)" />

          {/* face screen */}
          <rect x="38" y="42" width="44" height="26" rx="13" fill={`url(#${gradientId})`} />

          {/* eyes — glance offset is applied to the group so both move together */}
          <g style={{ transform: `translateX(${glance}px)`, transition: "transform 500ms var(--ease-out-soft)" }}>
            <ellipse cx="53" cy={eye.cy} rx={eye.rx} ry={eye.ry} fill="#fff" />
            <ellipse cx="67" cy={eye.cy} rx={eye.rx} ry={eye.ry} fill="#fff" />
            {/* Catchlights. Two pixels of white that make eyes look alive. */}
            {!blinking && (
              <>
                <circle cx="54.6" cy={eye.cy - 1.4} r="1.05" fill="#ffffff" opacity="0.95" />
                <circle cx="68.6" cy={eye.cy - 1.4} r="1.05" fill="#ffffff" opacity="0.95" />
              </>
            )}
          </g>

          {/* mouth — only drawn where the expression calls for one */}
          {mouth && <path d={mouth} stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" />}

          {/* ears */}
          <rect x="20" y="46" width="8" height="16" rx="4" fill="#C4AEEC">
            {state === "listening" && animate && (
              <animate attributeName="height" values="16;22;16" dur="1.3s" repeatCount="indefinite" />
            )}
          </rect>
          <rect x="92" y="46" width="8" height="16" rx="4" fill="#C4AEEC">
            {state === "listening" && animate && (
              <animate attributeName="height" values="16;22;16" dur="1.3s" repeatCount="indefinite" />
            )}
          </rect>

          {/* body */}
          <rect x="36" y="82" width="48" height="30" rx="14" fill="url(#edviaBody)" stroke="#C4AEEC" strokeWidth="1.5" />
          <circle cx="60" cy="97" r="6" fill={`url(#${gradientId})`}>
            {(state === "tool_execution" || state === "verifying" || state === "thinking") && animate && (
              <animate attributeName="r" values="6;4;6" dur="0.9s" repeatCount="indefinite" />
            )}
          </circle>
        </svg>
      </span>
    </div>
  );
}

function eyeGeometry(expression: Expression, blinking: boolean) {
  // A blink is a squash to a slit, not a disappearance — closing to ry 0
  // makes the eyes vanish for a frame and reads as a glitch.
  if (blinking) return { cy: 55, rx: 4.2, ry: 0.55 };
  switch (expression) {
    case "attentive":
      return { cy: 55, rx: 4.8, ry: 4.8 };
    case "focused":
      return { cy: 55, rx: 4.1, ry: 3.2 };
    case "happy":
      return { cy: 54, rx: 4.1, ry: 4.5 };
    case "concerned":
      return { cy: 56, rx: 3.6, ry: 3.6 };
    default:
      return { cy: 55, rx: 3.8, ry: 3.8 };
  }
}

/** Speaking opens the mouth in proportion to REAL audio energy. */
function mouthGeometry(expression: Expression, amplitude: number): string | null {
  if (expression === "happy") {
    const open = 1 + Math.min(1, amplitude) * 4.5;
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
