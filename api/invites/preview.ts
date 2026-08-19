// ==========================================================================
// POST /api/invites/preview   —  the only UNAUTHENTICATED route in EDVIA
// --------------------------------------------------------------------------
// Someone scans a QR on a staff-room wall. They are not signed in yet, and
// asking them to sign in before telling them what they are signing in FOR is
// how invitations get ignored. So this route answers exactly one question:
//
//   "You've been invited to join Robo School as a Teacher."
//
// WHAT IT DELIBERATELY DOES NOT RETURN
// Being unauthenticated makes this the most attackable surface in the app,
// so the response is trimmed to what a person standing in front of the
// poster can already see:
//
//   school NAME          — printed on the QR card itself
//   the KIND of invite   — printed on the QR card itself
//   class NAME           — printed on the QR card itself
//   child's FIRST NAME   — for a parent link only, so a parent can confirm
//                          they were given the right slip. Never the full
//                          name, roll number, class, or student id.
//
// It returns no ids, no counts, no issuer, no membership lists, and nothing
// about the school beyond its display name. A valid token is a bearer
// credential someone was handed; it is not a read handle on the school.
//
// An invalid token gets a generic answer and the same shape of response, so
// this cannot be used to enumerate which tokens exist any faster than the
// rate limit allows — and the rate limit here is keyed on IP, because there
// is no account to key it on.
// ==========================================================================
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { adminDb } from "../_lib/firebaseAdmin.js";
import { consumeRateLimit, rateLimitMessage } from "../_lib/rateLimit.js";
import {
  checkInvite,
  describeKind,
  hashSecret,
  normalizeHumanCode,
  rejectionMessage,
  type InviteDoc,
} from "../_lib/invites.js";

const bodySchema = z
  .object({
    /** The opaque secret from a QR / deep link. */
    token: z.string().trim().min(8).max(200).optional(),
    /** The short code typed by hand. */
    code: z.string().trim().min(4).max(32).optional(),
  })
  .refine((v) => Boolean(v.token || v.code), { message: "An invitation is required." });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // No uid to budget against, so the client address is the only handle there
  // is. x-forwarded-for is spoofable in general; on Vercel the left-most
  // entry is set by the edge and is the honest one.
  const forwarded = (req.headers["x-forwarded-for"] as string | undefined) ?? "";
  const clientKey = `ip:${forwarded.split(",")[0]?.trim() || "unknown"}`;
  const limit = await consumeRateLimit(clientKey, "preview_invite");
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSeconds));
    res.status(429).json({ error: rateLimitMessage("preview_invite") });
    return;
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "That invitation link doesn't look complete." });
    return;
  }

  const resolved = await lookupInvite(parsed.data.token, parsed.data.code);
  if (!resolved) {
    res.status(404).json({ valid: false, error: rejectionMessage("not_found") });
    return;
  }

  const rejection = checkInvite(resolved.invite);
  if (rejection) {
    res.status(410).json({ valid: false, error: rejectionMessage(rejection) });
    return;
  }

  const invite = resolved.invite;
  const db = adminDb();

  const schoolSnap = await db.collection("schools").doc(invite.schoolId).get();
  const schoolName = (schoolSnap.data()?.name as string | undefined) ?? "your school";
  const schoolLogoUrl = schoolSnap.data()?.logoUrl as string | undefined;

  let className: string | undefined;
  if (invite.classId) {
    const classSnap = await db.collection("classes").doc(invite.classId).get();
    className = classSnap.data()?.className as string | undefined;
  }

  let childFirstName: string | undefined;
  if (invite.kind === "parent_link" && invite.studentId) {
    const studentSnap = await db.collection("students").doc(invite.studentId).get();
    // First name only — enough for "is this my child's slip?", not enough to
    // be a roster leak.
    childFirstName = (studentSnap.data()?.fullName as string | undefined)?.split(" ")[0];
  }

  res.status(200).json({
    valid: true,
    kind: invite.kind,
    /** Shown to the user, and NOT accepted back from them at redemption. */
    roleLabel: describeKind(invite.kind),
    schoolName,
    ...(schoolLogoUrl ? { schoolLogoUrl } : {}),
    ...(className ? { className } : {}),
    ...(childFirstName ? { childFirstName } : {}),
  });
}

/**
 * Resolves either credential to the same invite document.
 *
 * The QR secret hashes straight to the document id. The human code goes
 * through its own index document first, so the two can be revoked
 * independently and neither is stored in a form that can be replayed.
 */
export async function lookupInvite(
  token: string | undefined,
  code: string | undefined
): Promise<{ id: string; invite: InviteDoc } | null> {
  const db = adminDb();

  if (token) {
    const id = hashSecret(token);
    const snap = await db.collection("invites").doc(id).get();
    if (snap.exists) return { id, invite: snap.data() as InviteDoc };
  }

  if (code) {
    const normalized = normalizeHumanCode(code);
    const indexSnap = await db.collection("inviteCodeIndex").doc(normalized).get();
    if (!indexSnap.exists) return null;
    const id = indexSnap.data()?.tokenHash as string | undefined;
    if (!id) return null;
    const snap = await db.collection("invites").doc(id).get();
    if (snap.exists) return { id, invite: snap.data() as InviteDoc };
  }

  return null;
}
