// ==========================================================================
// GET /api/support/inbox?status=pending
// --------------------------------------------------------------------------
// The staff Support Inbox — the other end of the escalation flow that
// api/support/create.ts starts. It returns the SAME records EDVIA's
// getSupportInbox tool returns, from the same School Service, so a teacher
// asking the assistant "what's waiting for me?" and a teacher opening the
// inbox screen see one queue, not two.
//
// A server route rather than a client Firestore query because the queue is a
// UNION of two relationships (routed-to-me, plus the school's management
// queue for verified management). Expressing that in security rules alone
// would mean a client query broad enough to be filtered afterwards — and a
// query that has to be filtered afterwards has already read the rows.
// ==========================================================================
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { resolveUserContext, isVerifiedManagement } from "../userContext.js";
import { AuthError } from "../firebaseAdmin.js";
import { writeAuditLog } from "../audit.js";
import { listRoutedSupportRequests } from "../school/support.js";

const querySchema = z.object({
  status: z.enum(["pending", "acknowledged", "resolved", "cancelled"]).optional(),
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

  // The staff inbox is staff-only. Students and parents track their OWN
  // requests through getSupportRequests / the Support screen; letting them
  // reach this route would expose other families' messages routed to the
  // same teacher.
  if (ctx.role !== "teacher" && ctx.role !== "principal") {
    await writeAuditLog(ctx, {
      action: "read:support_inbox",
      result: "denied",
      reason: "role_not_allowed",
    });
    res.status(403).json({ error: "The support inbox is for teachers and school management." });
    return;
  }

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Unrecognised status filter." });
    return;
  }

  try {
    const requests = await listRoutedSupportRequests(
      {
        uid: ctx.uid,
        schoolId: ctx.schoolId,
        // isVerifiedManagement, never `role === "principal"` — a self-declared
        // principal gets only the requests routed to them personally, which
        // for a fresh account is none.
        isManagement: isVerifiedManagement(ctx),
      },
      { status: parsed.data.status }
    );

    await writeAuditLog(ctx, {
      action: "read:support_inbox",
      result: "success",
      args: { status: parsed.data.status ?? "all" },
      details: { count: requests.length },
    });
    res.status(200).json({
      count: requests.length,
      requests,
      counts: {
        pending: requests.filter((r) => r.status === "pending").length,
        acknowledged: requests.filter((r) => r.status === "acknowledged").length,
        resolved: requests.filter((r) => r.status === "resolved").length,
      },
    });
  } catch (err) {
    console.error("support/inbox failed", err);
    await writeAuditLog(ctx, { action: "read:support_inbox", result: "error" });
    res.status(500).json({ error: "We couldn't load your support inbox. Please try again." });
  }
}
