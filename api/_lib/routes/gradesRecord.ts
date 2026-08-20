// ==========================================================================
// POST /api/grades/record
// --------------------------------------------------------------------------
// Backs the Teacher "Enter Marks" screen's Save button — the direct UI path,
// as distinct from EDVIA's conversational recordExamResult AI tool
// (api/_lib/tools/gradeTools.ts). Both write to the SAME `examResults`
// collection through the SAME School Service, so a mark typed on the screen
// and one dictated to the assistant are byte-identical records.
//
// firestore.rules deny all client writes to `examResults`, so this route and
// the AI tool are the only two ways a mark can be created — and both
// re-verify, server-side, that:
//
//   * the caller is a teacher,
//   * the exam belongs to a class they are actually assigned to,
//   * every studentId in the payload is on that class's roster,
//   * every mark is within 0..maxScore.
//
// None of those facts are taken from the request body. The body carries
// intent; the server supplies the truth.
// ==========================================================================
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { resolveUserContext } from "../userContext.js";
import { AuthError } from "../firebaseAdmin.js";
import { writeAuditLog } from "../audit.js";
import { getExam, recordClassExamResults, InvalidScoreError } from "../school/grades.js";
import { listStudents } from "../school/people.js";
import { validateScore } from "../../../src/lib/gradeMath.js";

const bodySchema = z.object({
  examId: z.string().min(1).max(128),
  maxScore: z.number().gt(0).max(1000),
  entries: z
    .array(
      z.object({
        studentId: z.string().min(1).max(128),
        score: z.number().min(0).max(1000),
      })
    )
    .min(1)
    .max(200),
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
    res.status(400).json({ error: "Invalid marks payload." });
    return;
  }
  const { examId, maxScore, entries } = parsed.data;

  if (ctx.role !== "teacher") {
    await writeAuditLog(ctx, {
      action: "write:exam_results_bulk",
      result: "denied",
      reason: "Only teachers can record marks.",
    });
    res.status(403).json({ error: "Only teachers can record exam marks." });
    return;
  }

  // The exam decides the class — not the client. A teacher may only record
  // marks for a paper belonging to a class they are assigned to, which is
  // re-derived per request in resolveUserContext.
  const exam = await getExam(examId);
  if (!exam || exam.schoolId !== ctx.schoolId || !(ctx.teacherClassIds ?? []).includes(exam.classId)) {
    await writeAuditLog(ctx, {
      action: "write:exam_results_bulk",
      result: "denied",
      reason: "exam_not_in_scope",
      args: { examId },
    });
    // Same message whether the exam is missing or simply not theirs, so this
    // cannot be used to probe for other classes' exam ids.
    res.status(403).json({ error: "That exam isn't one of your classes' papers." });
    return;
  }

  const invalidScore = entries.find((e) => !validateScore(e.score, maxScore).valid);
  if (invalidScore) {
    res.status(400).json({
      error: validateScore(invalidScore.score, maxScore).reason ?? "One or more marks are out of range.",
    });
    return;
  }

  // Every studentId is checked against the exam's own class roster before
  // anything is written — ids from the client are never trusted.
  const roster = await listStudents(ctx.schoolId, [exam.classId]);
  const byId = new Map(roster.map((s) => [s.id, s]));
  const invalid = entries.filter((e) => !byId.has(e.studentId));
  if (invalid.length) {
    await writeAuditLog(ctx, {
      action: "write:exam_results_bulk",
      result: "denied",
      reason: "student_not_in_class",
      args: { examId, invalidCount: invalid.length },
    });
    res.status(400).json({ error: "One or more students aren't in this class." });
    return;
  }

  try {
    // The same idempotent writer the recordExamResult AI tool uses: saving
    // twice amends each student's mark rather than duplicating the paper.
    const result = await recordClassExamResults(
      entries.map((entry) => ({
        examId: exam.id,
        examTitle: exam.title,
        examDate: exam.date,
        subject: exam.subject,
        studentId: entry.studentId,
        studentName: byId.get(entry.studentId)!.fullName,
        classId: exam.classId,
        schoolId: ctx.schoolId,
        score: entry.score,
        maxScore,
        recordedBy: ctx.uid,
      }))
    );

    await writeAuditLog(ctx, {
      action: "write:exam_results_bulk",
      result: "success",
      args: { examId, classId: exam.classId },
      details: { count: result.written, amended: result.amended },
    });
    res.status(200).json({ success: true, count: result.written, amended: result.amended });
  } catch (err) {
    if (err instanceof InvalidScoreError) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error("grades/record failed", err);
    await writeAuditLog(ctx, { action: "write:exam_results_bulk", result: "error" });
    res.status(500).json({ error: "We couldn't save those marks. Please try again." });
  }
}
