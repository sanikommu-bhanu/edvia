// ==========================================================================
// Grade math — ONE canonical formula, shared by client and server
// --------------------------------------------------------------------------
// Imported by BOTH the browser (src/services/grades.service.ts, the Grades
// screens) and the Node serverless API (api/_lib/school/grades.ts). Like
// attendanceMath.ts it has zero imports and no browser/Node-specific APIs,
// so the percentage a parent reads on the dashboard, the percentage the
// principal's analytics rolls up, and the percentage EDVIA speaks in chat
// are computed by the same lines of code.
//
// The failure this file exists to prevent is subtle and fatal for trust: a
// UI that averages per-subject percentages while the server averages raw
// marks. Both are "the average"; they differ whenever subjects carry
// different maximum marks, and the assistant then contradicts the screen
// the user is looking at.
// ==========================================================================

/** A single recorded result. The shape both layers aggregate over. */
export interface ScoreLike {
  score: number;
  maxScore: number;
}

/**
 * Percentage for one result, rounded to one decimal place.
 *
 * A maxScore of 0 yields 0 rather than NaN/Infinity — an ungraded paper is
 * "no information", and propagating NaN into a chart is how a dashboard
 * ends up rendering an empty bar that looks like a real zero.
 */
export function percentageFor(score: number, maxScore: number): number {
  if (!isFinite(score) || !isFinite(maxScore) || maxScore <= 0) return 0;
  return roundTo1((score / maxScore) * 100);
}

/**
 * Weighted aggregate across several results.
 *
 * Sums the marks and sums the maxima, rather than averaging the individual
 * percentages. A 100-mark term paper therefore counts for more than a
 * 10-mark class test, which is how schools actually compute an aggregate —
 * and it is the difference between an "average" that matches the report
 * card and one that quietly doesn't.
 */
export function weightedAggregate(results: ScoreLike[]): {
  totalScore: number;
  totalMax: number;
  percentage: number;
  count: number;
} {
  const valid = results.filter((r) => isFinite(r.score) && isFinite(r.maxScore) && r.maxScore > 0);
  const totalScore = valid.reduce((sum, r) => sum + r.score, 0);
  const totalMax = valid.reduce((sum, r) => sum + r.maxScore, 0);
  return {
    totalScore: roundTo1(totalScore),
    totalMax: roundTo1(totalMax),
    percentage: totalMax > 0 ? roundTo1((totalScore / totalMax) * 100) : 0,
    count: valid.length,
  };
}

/**
 * Unweighted mean of already-computed percentages.
 *
 * Exported separately and named for what it is, so a caller that genuinely
 * wants "the average of these class averages" has to say so rather than
 * reaching for weightedAggregate and getting a different number by accident.
 */
export function meanPercentage(percentages: number[]): number {
  if (percentages.length === 0) return 0;
  return roundTo1(percentages.reduce((s, p) => s + p, 0) / percentages.length);
}

/** Groups results by an arbitrary key and aggregates each group. */
export function aggregateBy<T extends ScoreLike>(
  results: T[],
  keyOf: (r: T) => string
): { key: string; percentage: number; totalScore: number; totalMax: number; count: number }[] {
  const buckets = new Map<string, T[]>();
  for (const r of results) {
    const key = keyOf(r);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(r);
    else buckets.set(key, [r]);
  }
  return Array.from(buckets.entries()).map(([key, group]) => ({
    key,
    ...weightedAggregate(group),
  }));
}

// --------------------------------------------------------------------------
// Performance banding
// --------------------------------------------------------------------------
// Lives beside the formula for the same reason attendance banding does: the
// thresholds are an academic convention the assistant may be asked to
// explain ("is 62% a pass?"), not a designer's colour preference. One
// definition means the badge on the screen and the words EDVIA speaks
// cannot disagree.

export type PerformanceBand = "excellent" | "good" | "satisfactory" | "needs_support";

export interface PerformanceBandMeta {
  band: PerformanceBand;
  /** Short human label, shown on the grade card and spoken by the assistant. */
  label: string;
  /** Inclusive lower bound of the band, as a percentage. */
  min: number;
}

/** Minimum percentage to pass a paper under the seeded school handbook. */
export const PASS_PERCENT = 35;

export const PERFORMANCE_BANDS: PerformanceBandMeta[] = [
  { band: "excellent", label: "Excellent", min: 85 },
  { band: "good", label: "Good", min: 70 },
  { band: "satisfactory", label: "Satisfactory", min: 50 },
  { band: "needs_support", label: "Needs support", min: 0 },
];

export function bandFor(percentage: number): PerformanceBand {
  return (PERFORMANCE_BANDS.find((b) => percentage >= b.min) ?? PERFORMANCE_BANDS[PERFORMANCE_BANDS.length - 1]).band;
}

export function bandLabel(percentage: number): string {
  const band = bandFor(percentage);
  return PERFORMANCE_BANDS.find((b) => b.band === band)?.label ?? "Needs support";
}

export function isPass(percentage: number): boolean {
  return percentage >= PASS_PERCENT;
}

// --------------------------------------------------------------------------
// Validation
// --------------------------------------------------------------------------

export interface ScoreValidation {
  valid: boolean;
  /** User-safe explanation; safe to speak verbatim. */
  reason?: string;
}

/**
 * The single definition of "is this a recordable mark".
 *
 * Enforced by the Zod schema on the AI tool, by the non-AI API route, and
 * by the School Service itself — three layers, one rule, so a future caller
 * cannot write a 110/100 by taking a different path in.
 */
export function validateScore(score: number, maxScore: number): ScoreValidation {
  if (!isFinite(score) || !isFinite(maxScore)) {
    return { valid: false, reason: "A mark and a maximum mark are both needed." };
  }
  if (maxScore <= 0) return { valid: false, reason: "The maximum mark must be greater than zero." };
  if (score < 0) return { valid: false, reason: "A mark can't be negative." };
  if (score > maxScore) {
    return { valid: false, reason: `A mark of ${score} is higher than the maximum of ${maxScore}.` };
  }
  return { valid: true };
}

export function roundTo1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * The idempotent document id for one student's result in one exam.
 *
 * Mirrors attendance's `${studentId}_${date}`: recording the same student's
 * mark for the same paper twice AMENDS the record rather than appending a
 * second one. Without this, a teacher correcting a typo would double-count
 * that paper in every average the school computes.
 */
export function examResultId(examId: string, studentId: string): string {
  return `${examId}_${studentId}`;
}
