// ==========================================================================
// POST /api/attendance/mark
// --------------------------------------------------------------------------
// Backs the Teacher "Mark Attendance" screen's Save button — the direct UI
// path, as distinct from EDVIA's conversational markAttendance AI tool
// (api/_lib/tools/actionTools.ts). Both write to the SAME `attendance`
// collection with the same shape, so a class marked here shows up
// immediately to a parent asking EDVIA about their child, and vice versa.
//
// firestore.rules deny all client writes to `attendance`, so this is the
// only path (besides the AI tool) that can create attendance records —
// every write is re-verified against the teacher's actual assigned classes
// here, never trusted from the request body alone.
// ==========================================================================
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { resolveUserContext } from "../_lib/userContext";
import { adminDb, AuthError } from "../_lib/firebaseAdmin";
import { writeAuditLog } from "../_lib/audit";

const bodySchema = z.object({
  classId: z.string(),
  date: z.string(), // ISO date
  entries: z.array(z.object({
    studentId: z.string(),
    status: z.enum(["present", "absent", "leave"]),
  })).min(1).max(200),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
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

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid attendance payload." });
    return;
  }
  const { classId, date, entries } = parsed.data;

  if (ctx.role !== "teacher") {
    await writeAuditLog(ctx, { action: "write:attendance_bulk", result: "denied", reason: "Only teachers can mark attendance." });
    res.status(403).json({ error: "Only teachers can mark attendance." });
    return;
  }
  if (!(ctx.teacherClassIds ?? []).includes(classId)) {
    await writeAuditLog(ctx, { action: "write:attendance_bulk", result: "denied", reason: "Not assigned to this class.", args: { classId } });
    res.status(403).json({ error: "You're not assigned to that class." });
    return;
  }

  // Confirm every studentId actually belongs to this class/school before
  // writing anything — never trust ids the client sent without checking.
  const studentsSnap = await adminDb().collection("students").where("schoolId", "==", ctx.schoolId).where("classId", "==", classId).get();
  const validStudentIds = new Set(studentsSnap.docs.map((d) => d.id));
  const invalid = entries.filter((e) => !validStudentIds.has(e.studentId));
  if (invalid.length) {
    res.status(400).json({ error: "One or more students aren't in this class." });
    return;
  }

  const batch = adminDb().batch();
  for (const entry of entries) {
    const docRef = adminDb().collection("attendance").doc();
    batch.set(docRef, {
      studentId: entry.studentId,
      classId,
      schoolId: ctx.schoolId,
      status: entry.status,
      date,
      markedBy: ctx.uid,
      markedAt: new Date().toISOString(),
    });
  }
  await batch.commit();

  await writeAuditLog(ctx, { action: "write:attendance_bulk", result: "success", args: { classId, date, count: entries.length } });
  res.status(200).json({ success: true, count: entries.length });
}
