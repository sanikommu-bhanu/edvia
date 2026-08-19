// ==========================================================================
// Principal analytics — client side
// --------------------------------------------------------------------------
// A thin wrapper over /api/analytics/school. The numbers are computed by the
// same server function EDVIA's getSchoolAttendance tool uses, so the
// dashboard and the assistant cannot report different figures for the same
// period. Nothing is recomputed here.
// ==========================================================================
import { apiGet } from "@/services/apiClient";

export type AnalyticsPeriod =
  | "today"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_term"
  | "all_time";

export const PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  today: "Today",
  this_week: "This week",
  last_week: "Last week",
  this_month: "This month",
  last_month: "Last month",
  this_term: "This term",
  all_time: "All time",
};

export interface ClassAttendanceRow {
  classId: string;
  className: string;
  percentage: number;
  total: number;
}

export interface SchoolAnalytics {
  period: AnalyticsPeriod;
  bounds: { start: string; end: string };
  attendance: {
    overallPercentage: number;
    totalRecords: number;
    perClass: ClassAttendanceRow[];
    classesNeedingAttention: { classId: string; className: string; percentage: number }[];
    noRecords: boolean;
  };
  counts: {
    totalStudents: number;
    totalTeachers: number;
    totalClasses: number;
    averagePerformancePercent: number | null;
    engagementPercent: number | null;
    updatedAt: string | null;
  } | null;
}

export async function getSchoolAnalytics(period: AnalyticsPeriod = "this_month"): Promise<SchoolAnalytics> {
  return apiGet<SchoolAnalytics>(`/api/analytics/school?period=${encodeURIComponent(period)}`);
}

/**
 * Builds a CSV of exactly what the Reports screen is showing.
 *
 * Generated in the browser from data already fetched, so the file can never
 * contain figures the user wasn't shown — and there is no server-side report
 * pipeline pretending to exist.
 */
export function attendanceCsv(analytics: SchoolAnalytics, schoolName: string): string {
  const rows: string[][] = [
    ["School", schoolName],
    ["Period", PERIOD_LABELS[analytics.period]],
    ["From", analytics.bounds.start],
    ["To", analytics.bounds.end],
    ["Overall attendance %", String(analytics.attendance.overallPercentage)],
    ["Records counted", String(analytics.attendance.totalRecords)],
    [],
    ["Class", "Attendance %", "Records"],
    ...analytics.attendance.perClass.map((c) => [c.className, String(c.percentage), String(c.total)]),
  ];
  return rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n");
}

function escapeCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function downloadCsv(filename: string, csv: string): void {
  // BOM so Excel opens UTF-8 class names (e.g. Tamil section labels) correctly.
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
