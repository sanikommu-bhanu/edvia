import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { bandFor, POLICY_MINIMUM_PERCENT, type AttendanceBand } from "@/lib/attendanceMath";

// ==========================================================================
// AttendanceRing — the app's headline number
// --------------------------------------------------------------------------
// Attendance is the figure a parent opens EDVIA to see, so it gets the
// largest, most confident treatment in the product: one big number, one
// ring, one line of context. Everything else about attendance is secondary
// to reading this in under a second.
//
// The value passed in comes from src/lib/attendanceMath.ts — the SAME
// formula the server uses — so this ring and EDVIA's spoken answer cannot
// disagree.
//
// Implementation notes:
//   * SVG stroke-dashoffset rather than conic-gradient: it animates
//     smoothly, works to one decimal, and takes a rounded linecap.
//   * The sweep animates from 0 on mount via a transition, which is a
//     presentation flourish on data that has ALREADY loaded — not a fake
//     progress indicator. `noRecords` renders a dash instead, because "no
//     records" and "0%" are different statements.
//   * Colour is banded against the seeded 75% policy threshold, so the
//     visual and the school's actual rule agree.
// ==========================================================================

const BAND_STYLE: Record<AttendanceBand, { stroke: string; text: string; label: string }> = {
  strong: { stroke: "#22A06B", text: "text-success", label: "Excellent" },
  fine: { stroke: "#8257D3", text: "text-edvia-600", label: "On track" },
  watch: { stroke: "#F5A524", text: "text-warning", label: "Keep an eye on this" },
  risk: { stroke: "#E5484D", text: "text-danger", label: `Below the ${POLICY_MINIMUM_PERCENT}% requirement` },
};

export function AttendanceRing({
  percentage,
  noRecords = false,
  size = 168,
  caption,
  className,
}: {
  percentage: number;
  /** True when the period contains no records at all — shows "—", not 0%. */
  noRecords?: boolean;
  size?: number;
  caption?: string;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  const [sweep, setSweep] = useState(reducedMotion ? percentage : 0);

  useEffect(() => {
    if (reducedMotion || noRecords) {
      setSweep(percentage);
      return;
    }
    // One frame's delay so the browser paints the empty ring first and the
    // transition has something to animate from.
    const id = requestAnimationFrame(() => setSweep(percentage));
    return () => cancelAnimationFrame(id);
  }, [percentage, reducedMotion, noRecords]);

  // Stroke scales with the ring so a small one doesn't look like a thick
  // donut with no room inside it.
  const stroke = Math.max(6, Math.round(size * 0.072));
  const radius = (size - stroke) / 2;
  /**
   * Below this the caption cannot fit inside the circle: "Below the 75%
   * requirement" wrapped to two lines and spilled over the stroke. Small
   * rings show the number only — the colour already carries the band, and a
   * caption that overflows its own container is worse than no caption.
   */
  const showCaption = size >= 120;
  const circumference = 2 * Math.PI * radius;
  const band = BAND_STYLE[bandFor(percentage)];
  const offset = circumference * (1 - Math.min(100, Math.max(0, sweep)) / 100);

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={
        noRecords
          ? "No attendance records for this period"
          : `Attendance ${percentage.toFixed(1)} percent — ${band.label}`
      }
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-muted"
          strokeWidth={stroke}
        />
        {!noRecords && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={band.stroke}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition: reducedMotion ? undefined : "stroke-dashoffset 1s var(--ease-out-soft)",
            }}
          />
        )}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {noRecords ? (
          <>
            <span className="stat-number text-muted-foreground" style={{ fontSize: size * 0.24 }}>
              —
            </span>
            {showCaption && (
              <span className="mt-1 max-w-[70%] text-center text-[11px] leading-tight text-muted-foreground">
                No records yet
              </span>
            )}
          </>
        ) : (
          <>
            <span className={cn("stat-number", band.text)} style={{ fontSize: size * 0.23 }}>
              {percentage.toFixed(1)}
              <span style={{ fontSize: size * 0.115 }}>%</span>
            </span>
            {showCaption && (
              // Constrained to the ring's inner width and clamped to two
              // lines so a long band label can never breach the stroke.
              <span className="mt-0.5 line-clamp-2 max-w-[68%] text-center text-[11px] font-medium leading-tight text-muted-foreground">
                {caption ?? band.label}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Present / absent / leave counts beneath the ring.
 *
 * Leave is labelled "half credit" because that is what the seeded policy
 * says and it is the detail that otherwise makes the percentage look wrong
 * to anyone who tries to recompute it by hand.
 */
export function AttendanceBreakdown({
  present,
  absent,
  leave,
  className,
}: {
  present: number;
  absent: number;
  leave: number;
  className?: string;
}) {
  const items = [
    { label: "Present", value: present, dot: "bg-success" },
    { label: "Absent", value: absent, dot: "bg-danger" },
    { label: "Leave", value: leave, dot: "bg-warning", hint: "half credit" },
  ];

  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-border bg-surface px-2 py-3 text-center">
          <span className="stat-number block text-xl text-slate-800">{item.value}</span>
          <span className="mt-1 flex items-center justify-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <span className={cn("h-1.5 w-1.5 rounded-full", item.dot)} aria-hidden />
            {item.label}
          </span>
          {item.hint && <span className="mt-0.5 block text-[10px] text-muted-foreground/70">{item.hint}</span>}
        </div>
      ))}
    </div>
  );
}
