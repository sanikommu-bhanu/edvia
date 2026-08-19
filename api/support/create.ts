// ==========================================================================
// POST /api/support/create
// --------------------------------------------------------------------------
// The Support screen's direct "contact teacher / management" form — the
// non-AI path, as distinct from EDVIA's conversational
// createTeacherCallRequest / createManagementSupportRequest tools.
//
// Both call the SAME School Service (api/_lib/school/support.ts), so a
// request raised here and one raised in conversation are routed the same
// way, carry the same fields, and show up identically in
// getSupportRequests. That equivalence is the point: the assistant is a
// second front door onto the product, not a parallel implementation of it.
// ==========================================================================
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { resolveUserContext } from "../_lib/userContext.js";
import { AuthError } from "../_lib/firebaseAdmin.js";
import { writeAuditLog } from "../_lib/audit.js";
import { createTeacherCallRequest, createManagementSupportRequest } from "../_lib/school/support.js";
import { getStudent } from "../_lib/school/people.js";

const bodySchema = z.object({
  recipientType: z.enum(["teacher", "management"]),
  message: z.string().min(1).max(1000),
  studentContext: z.string().max(200).optional(),
  studentId: z.string().max(128).optional(),
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
    res.status(400).json({ error: "Please include a message for your support request." });
    return;
  }
  const { recipientType, message, studentContext, studentId } = parsed.data;

  if (recipientType === "teacher" && !["student", "parent"].includes(ctx.role)) {
    res.status(403).json({ error: "Only students and parents can request a call from a teacher." });
    return;
  }

  // A client-supplied studentId is only honoured if the caller genuinely owns
  // that student — otherwise the request would be routed to a stranger's
  // class teacher, and the studentContext string would leak into their inbox.
  let verifiedStudentId: string | undefined;
  if (studentId) {
    const owns =
      (ctx.role === "student" && ctx.studentId === studentId) ||
      (ctx.role === "parent" && (ctx.linkedStudentIds ?? []).includes(studentId));
    if (!owns) {
      await writeAuditLog(ctx, {
        action: `write:support_request_${recipientType}`,
        result: "denied",
        reason: "student_not_owned",
      });
      res.status(403).json({ error: "You can only raise a request about your own child." });
      return;
    }
    const student = await getStudent(studentId);
    if (!student || student.schoolId !== ctx.schoolId) {
      res.status(403).json({ error: "You can only raise a request about your own child." });
      return;
    }
    verifiedStudentId = studentId;
  }

  try {
    const input = {
      requestedBy: ctx.uid,
      requestedByRole: ctx.role,
      schoolId: ctx.schoolId,
      recipientType,
      message,
      studentContext,
      studentId: verifiedStudentId,
    } as const;

    const created =
      recipientType === "teacher"
        ? await createTeacherCallRequest(input)
        : await createManagementSupportRequest(input);

    await writeAuditLog(ctx, {
      action: `write:support_request_${recipientType}`,
      result: "success",
      details: { requestId: created.id, routedTo: created.routedToLabel },
    });
    res.status(200).json(created);
  } catch (err) {
    console.error("support/create failed", err);
    await writeAuditLog(ctx, { action: `write:support_request_${recipientType}`, result: "error" });
    res.status(500).json({ error: "I couldn't submit the request right now. Please try again." });
  }
}
