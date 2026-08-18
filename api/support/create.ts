// ==========================================================================
// POST /api/support/create
// --------------------------------------------------------------------------
// Backs the Support screen's direct "Contact teacher/management" form — the
// non-AI path, as distinct from EDVIA's conversational
// createTeacherSupportRequest / createManagementSupportRequest tools
// (api/_lib/tools/actionTools.ts). Both write to the SAME `supportRequests`
// collection, so a request submitted here shows up identically in
// getSupportRequests results whether the AI or this screen created it.
// ==========================================================================
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { resolveUserContext } from "../_lib/userContext";
import { adminDb, AuthError } from "../_lib/firebaseAdmin";
import { writeAuditLog } from "../_lib/audit";

const bodySchema = z.object({
  recipientType: z.enum(["teacher", "management"]),
  message: z.string().min(1).max(1000),
  studentContext: z.string().max(200).optional(),
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
  const { recipientType, message, studentContext } = parsed.data;

  if (recipientType === "teacher" && !["student", "parent"].includes(ctx.role)) {
    res.status(403).json({ error: "Only students and parents can contact a teacher this way." });
    return;
  }

  const docRef = adminDb().collection("supportRequests").doc();
  await docRef.set({
    recipientType,
    message,
    studentContext: studentContext ?? null,
    status: "pending",
    createdAt: new Date().toISOString(),
    requestedBy: ctx.uid,
    schoolId: ctx.schoolId,
  });

  await writeAuditLog(ctx, { action: `write:support_request_${recipientType}`, result: "success" });
  res.status(200).json({ id: docRef.id, status: "pending" });
}
