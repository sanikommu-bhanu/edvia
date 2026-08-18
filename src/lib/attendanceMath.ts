// ==========================================================================
// Attendance math — ONE canonical formula, shared by client and server
// --------------------------------------------------------------------------
// This file is imported by BOTH the browser (src/services/attendance) and
// the Node serverless API (api/_lib/school/attendance.ts). It deliberately
// has zero imports and no browser/Node-specific APIs so the number a parent
// sees on the dashboard and the number EDVIA speaks in chat can never drift
// apart — a mismatch there is the single most visible way an "AI school
// assistant" loses trust.
// ==========================================================================

export type AttendanceStatusValue = "present" | "absent" | "leave";

/**
 * Weighted credit each status contributes toward the attendance percentage.
 * Approved leave counts half — this mirrors the seeded school policy
 * ("Medical leave with a certificate is counted at 50% weight"), so the
 * number EDVIA quotes is consistent with the policy text it can retrieve.
 */
export const ATTENDANCE_WEIGHTS: Record<AttendanceStatusValue, number> = {
  present: 1,
  leave: 0.5,
  absent: 0,
};

export interface AttendanceTally {
  present: number;
  absent: number;
  leave: number;
  total: number;
  /** 0–100, rounded to one decimal place. 0 when there are no records. */
  percentage: number;
}

export function tallyAttendance(statuses: AttendanceStatusValue[]): AttendanceTally {
  const present = statuses.filter((s) => s === "present").length;
  const absent = statuses.filter((s) => s === "absent").length;
  const leave = statuses.filter((s) => s === "leave").length;
  const total = statuses.length;
  return { present, absent, leave, total, percentage: attendancePercentage(statuses) };
}

/** 0 for an empty set — never divide by a fabricated denominator of 1. */
export function attendancePercentage(statuses: AttendanceStatusValue[]): number {
  if (statuses.length === 0) return 0;
  const credit = statuses.reduce((sum, s) => sum + ATTENDANCE_WEIGHTS[s], 0);
  return roundTo1((credit / statuses.length) * 100);
}

/**
 * Weighted roll-up across groups (e.g. school-wide from per-class tallies).
 * Averaging percentages directly would over-weight small classes, so this
 * re-derives from the underlying record counts.
 */
export function rollUpPercentage(groups: { present: number; leave: number; total: number }[]): number {
  const total = groups.reduce((s, g) => s + g.total, 0);
  if (total === 0) return 0;
  const credit = groups.reduce(
    (s, g) => s + g.present * ATTENDANCE_WEIGHTS.present + g.leave * ATTENDANCE_WEIGHTS.leave,
    0
  );
  return roundTo1((credit / total) * 100);
}

export function roundTo1(value: number): number {
  return Math.round(value * 10) / 10;
}
