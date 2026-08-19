// ==========================================================================
// POST /api/invites/manage   —  list and revoke
// --------------------------------------------------------------------------
// One route rather than two because both need the identical authorization
// check and both are staff-only administrative reads/writes over the same
// collection. Splitting them would duplicate the scoping logic, and scoping
// logic that exists twice is scoping logic that eventually disagrees.
//
// The listing NEVER includes a secret or a human code — those are shown once
// at creation and are stored hashed anyway. What it includes is what an
// administrator needs to manage invitations: what each one is for, how many
// times it has been used, when it expires, and whether it is still live.
//
// Scoping, in one sentence: an administrator sees their school's invites; a
// teacher sees only invites THEY issued. A teacher who could list the
// school's teacher invites could hand one to anybody.
// ==========================================================================
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { adminDb, AuthError } from "../firebaseAdmin.js";
import { resolveIdentity } from "../identity.js";
import { writeMembershipLog } from "../audit.js";
import type { InviteDoc } from "../invites.js";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list"), classId: z.string().trim().max(128).optional() }),
  z.object({ action: z.literal("revoke"), inviteId: z.string().trim().min(8).max(128) }),
]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let identity;
  try {
    identity = await resolveIdentity(req.headers.authorization as string | undefined);
  } catch (err) {
    res.status(401).json({ error: err instanceof AuthError ? err.message : "Unauthorized" });
    return;
  }

  const schoolId = identity.profile?.schoolId ?? "";
  const isAdmin = Boolean(schoolId) && identity.profile?.principalOfSchoolId === schoolId;
  const isTeacher = Boolean(schoolId) && identity.profile?.teacherId === identity.uid;
  if (!schoolId || (!isAdmin && !isTeacher)) {
    res.status(403).json({ error: "Only school staff can manage invitations." });
    return;
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "That request wasn't understood." });
    return;
  }

  const db = adminDb();

  if (parsed.data.action === "list") {
    // Always bounded by schoolId FIRST, so no query can reach another
    // school's invites even if the rest of the filter is wrong.
    let query = db.collection("invites").where("schoolId", "==", schoolId);
    if (!isAdmin) query = query.where("createdBy", "==", identity.uid);
    if (parsed.data.classId) query = query.where("classId", "==", parsed.data.classId);

    // Bounded read: an unbounded listing is a slow query that gets slower
    // every term. 200 is far more invites than a school will have live.
    const snap = await query.orderBy("createdAt", "desc").limit(200).get();

    res.status(200).json({
      invites: snap.docs.map((doc) => {
        const invite = doc.data() as InviteDoc;
        return {
          id: doc.id,
          kind: invite.kind,
          label: invite.label,
          classId: invite.classId ?? null,
          studentId: invite.studentId ?? null,
          createdAt: invite.createdAt,
          createdBy: invite.createdBy,
          expiresAt: invite.expiresAt,
          usageLimit: invite.usageLimit,
          usedCount: invite.usedCount ?? 0,
          status: invite.status,
          // Deliberately absent: tokenHash, humanCode, usedBy.
        };
      }),
    });
    return;
  }

  // ---- revoke -------------------------------------------------------------
  const ref = db.collection("invites").doc(parsed.data.inviteId);
  const snap = await ref.get();
  if (!snap.exists) {
    res.status(404).json({ error: "That invitation no longer exists." });
    return;
  }
  const invite = snap.data() as InviteDoc;
  if (invite.schoolId !== schoolId || (!isAdmin && invite.createdBy !== identity.uid)) {
    // Same message for "not yours" and "not found": the difference would
    // confirm that a given invite id exists.
    res.status(404).json({ error: "That invitation no longer exists." });
    return;
  }

  const batch = db.batch();
  batch.update(ref, { status: "revoked", revokedAt: new Date().toISOString(), revokedBy: identity.uid });
  // The typed code is a separate credential, so revocation must remove it
  // too — otherwise a revoked QR would still be joinable by hand.
  batch.delete(db.collection("inviteCodeIndex").doc(invite.humanCode));
  await batch.commit();

  await writeMembershipLog(identity.uid, {
    action: "invite:revoked",
    schoolId,
    result: "success",
    details: { inviteId: parsed.data.inviteId, kind: invite.kind },
  });

  res.status(200).json({ success: true });
}
