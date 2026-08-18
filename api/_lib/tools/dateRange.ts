// Small shared helper: turns natural period phrases resolved by the model
// (e.g. "last month", "this week") into concrete ISO date bounds. The model
// is asked to resolve the phrase into one of these enum values itself via
// the tool's input schema — we never parse free text here.
export type Period = "today" | "this_week" | "last_week" | "this_month" | "last_month" | "this_term" | "all_time";

export function resolvePeriod(period: Period): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);

  switch (period) {
    case "today":
      return { start: end, end };
    case "this_week": {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      return { start: start.toISOString().slice(0, 10), end };
    }
    case "last_week": {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay() - 7);
      const weekEnd = new Date(start);
      weekEnd.setDate(start.getDate() + 6);
      return { start: start.toISOString().slice(0, 10), end: weekEnd.toISOString().slice(0, 10) };
    }
    case "this_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: start.toISOString().slice(0, 10), end };
    }
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: start.toISOString().slice(0, 10), end: monthEnd.toISOString().slice(0, 10) };
    }
    case "this_term":
      // Terms vary by school calendar; default to a trailing 4-month window
      // until a school-configured academic calendar is wired in.
      return { start: new Date(now.getFullYear(), now.getMonth() - 4, 1).toISOString().slice(0, 10), end };
    case "all_time":
      return { start: "2000-01-01", end };
  }
}
