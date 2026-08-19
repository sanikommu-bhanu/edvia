// ==========================================================================
// GET /api/analytics/school?period=this_month
// --------------------------------------------------------------------------
// The principal dashboard's numbers, computed by the SAME School Service
// function EDVIA's getSchoolAttendance tool calls
// (api/_lib/school/attendance.ts#getSchoolAttendanceAnalytics).
//
// Deliberately a server route rather than a client-side Firestore query:
// the roll-up has to weight classes by record count, and having that logic
// exist twice is exactly how a dashboard ends up disagreeing with the
// assistant. One implementation, two consumers.
// ==========================================================================
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { resolveUserContext } from "../_lib/userContext";
import { AuthError } from "../_lib/firebaseAdmin";
import { getSchoolAttendanceAnalytics } from "../_lib/school/attendance";
import { getSchoolAnalytics } from "../_lib/school/academics";
import { resolvePeriod, type Period } from "../_lib/tools/dateRange";
import { writeAuditLog } from "../_lib/audit";

const querySchema = z.object({
  period: z
    .enum(["today", "this_week", "last_week", "this_month", "last_month", "this_term", "all_time"])
    .default("this_month"),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let ctx;
  try {
    ctx = await resolveUserContext(req.headers.authorization as string | undefined);
  } catch (err) {
    res.status(401).json({ error: err instanceof AuthError ? err.message : "Unauthorized" });
    return;
  }

  // School-wide analytics are a principal capability. Same rule the
  // getSchoolAttendance tool enforces, applied to the dashboard path too.
  if (ctx.role !== "principal") {
    await writeAuditLog(ctx, { action: "read:school_analytics", result: "denied", reason: "role_not_allowed" });
    res.status(403).json({ error: "School-wide analytics are available to school management only." });
    return;
  }

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Unrecognised period." });
    return;
  }

  try {
    const bounds = resolvePeriod(parsed.data.period as Period);
    const [attendance, counts] = await Promise.all([
      getSchoolAttendanceAnalytics(ctx.schoolId, bounds),
      getSchoolAnalytics(ctx.schoolId),
    ]);

    await writeAuditLog(ctx, { action: "read:school_analytics", result: "success", args: { period: parsed.data.period } });
    res.status(200).json({
      period: parsed.data.period,
      bounds,
      attendance,
      // Counts come from the maintained schoolAnalytics document. Null when
      // it hasn't been computed yet — the UI shows "—" rather than zero,
      // because "no data" and "zero students" are different statements.
      counts: counts
        ? {
            totalStudents: counts.totalStudents,
            totalTeachers: counts.totalTeachers,
            totalClasses: counts.totalClasses,
            averagePerformancePercent: counts.averagePerformancePercent ?? null,
            engagementPercent: counts.engagementPercent ?? null,
            updatedAt: counts.updatedAt ?? null,
          }
        : null,
    });
  } catch (err) {
    console.error("analytics/school failed", err);
    await writeAuditLog(ctx, { action: "read:school_analytics", result: "error" });
    res.status(500).json({ error: "We couldn't retrieve the latest school data. Please try again." });
  }
}
