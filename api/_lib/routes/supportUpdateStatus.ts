// ==========================================================================
// POST /api/support/update-status
// --------------------------------------------------------------------------
// Acknowledging and resolving a support request — the direct UI path, as
// distinct from EDVIA's conversational updateSupportRequestStatus tool.
// Both call advanceSupportRequestStatus(), which does the authorization,
// the legality check and the write inside ONE Firestore transaction.
//
// That transaction is what makes the endpoint replay-safe. Two taps on
// "Resolve", a retried request, or a confirmation replayed from a stale
// conversation all converge on the same outcome: the first one transitions
// the request, the rest see `resolved` on the live document and are refused
// with 409 rather than silently rewriting who closed it and when.
// ==========================================================================
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { resolveUserContext, isVerifiedManagement } from "../userContext.js";
import { AuthError } from "../firebaseAdmin.js";
import { writeAuditLog } from "../audit.js";
import { advanceSupportRequestStatus } from "../school/support.js";

const bodySchema = z.object({
  requestId: z.string().min(1).max(128),
  // `cancelled` is included because a requester may withdraw their own
  // pending request; the service refuses it for anyone else.
  status: z.enum(["acknowledged", "resolved", "cancelled"]),
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
    res.status(400).json({ error: "Invalid status update." });
    return;
  }
  const { requestId, status } = parsed.data;

  // Staff transitions are staff-only. Cancellation is the one move a
  // requester may make on their own request, so students and parents are
  // allowed through to the service ONLY for that — where ownership of the
  // request is then proven against the live document.
  if (status !== "cancelled" && ctx.role !== "teacher" && ctx.role !== "principal") {
    await writeAuditLog(ctx, {
      action: "write:support_request_status",
      result: "denied",
      reason: "role_not_allowed",
      args: { requestId, status },
    });
    res.status(403).json({ error: "Only teachers and school management can update a request's status." });
    return;
  }

  try {
    const outcome = await advanceSupportRequestStatus({
      requestId,
      to: status,
      actor: { uid: ctx.uid, schoolId: ctx.schoolId, isManagement: isVerifiedManagement(ctx) },
      actorRole: ctx.role,
    });

    if (!outcome.ok) {
      await writeAuditLog(ctx, {
        action: "write:support_request_status",
        result: "denied",
        reason: outcome.refusal,
        args: { requestId, status },
      });
      // 404 for "not yours / not there" — identical responses for both, so
      // request ids can't be enumerated. 409 for a legality conflict, which
      // is a real, reportable state the UI should re-sync from.
      const code =
        outcome.refusal === "not_found" || outcome.refusal === "not_authorized" ? 404 : 409;
      res.status(code).json({ error: outcome.message ?? "We couldn't update that request." });
      return;
    }

    await writeAuditLog(ctx, {
      action: "write:support_request_status",
      result: "success",
      args: { requestId, status },
      details: { from: outcome.request?.previousStatus ?? null, to: status },
    });
    res.status(200).json({ success: true, request: outcome.request });
  } catch (err) {
    console.error("support/update-status failed", err);
    await writeAuditLog(ctx, { action: "write:support_request_status", result: "error" });
    res.status(500).json({ error: "We couldn't update that request right now. Please try again." });
  }
}
