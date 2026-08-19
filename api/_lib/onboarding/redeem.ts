// ==========================================================================
// POST /api/invites/redeem   —  where privilege is created
// --------------------------------------------------------------------------
// Every membership in EDVIA comes into existence here, and nowhere else.
// The transaction below is therefore the single most security-critical block
// in the codebase, so it is worth being explicit about what it does and does
// not trust.
//
// TRUSTED:  the Firebase ID token (verified signature → uid)
//           the invite document read inside this transaction
// NOT TRUSTED (and not even accepted as input):
//           role, schoolId, classId, studentId, targetRole
//
// The request body has exactly two optional fields — a token and a code —
// and every fact about what is being granted is read from the server's own
// invite document. That is what makes the attack list in the brief
// structurally impossible rather than merely defended against:
//
//   "change ?role=principal"   there is no role field to change
//   "change ?schoolId=..."     there is no schoolId field to change
//   "change ?classId=..."      there is no classId field to change
//   "use a student token as a teacher"  the token IS the role; a class
//                                       invite writes classIds, never
//                                       teacherId or principalOfSchoolId
//   "modify the token"         the token is 160 random bits; modifying it
//                                       yields a hash that matches nothing
//   "replay a used token"      usedCount/usageLimit are checked and
//                                       incremented in the SAME transaction
//   "cross-school token"       the school comes from the invite, so a token
//                                       always lands its holder in the school
//                                       that issued it, by construction
//
// The one grant this route can produce that is genuinely dangerous —
// principal — requires an invite of kind "school_admin", which only an
// already-verified administrator of that same school can mint.
// ==========================================================================
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { adminDb, AuthError } from "../firebaseAdmin.js";
import { resolveIdentity, ensureProfile } from "../identity.js";
import { consumeRateLimit, rateLimitMessage } from "../rateLimit.js";
import { writeMembershipLog } from "../audit.js";
import { checkInvite, hashSecret, normalizeHumanCode, rejectionMessage, type InviteDoc } from "../invites.js";

const bodySchema = z
  .object({
    token: z.string().trim().min(8).max(200).optional(),
    code: z.string().trim().min(4).max(32).optional(),
  })
  .refine((v) => Boolean(v.token || v.code), { message: "An invitation is required." });

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

  const limit = await consumeRateLimit(identity.uid, "redeem_invite");
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSeconds));
    res.status(429).json({ error: rateLimitMessage("redeem_invite") });
    return;
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please enter the invitation code your school gave you." });
    return;
  }

  const profile = await ensureProfile(identity);
  const db = adminDb();

  // Resolve the credential to a document ID OUTSIDE the transaction (the
  // human-code index is a second read and Firestore transactions must do all
  // reads before any write). The invite itself is re-read INSIDE.
  const inviteId = await resolveInviteId(parsed.data.token, parsed.data.code);
  if (!inviteId) {
    await writeMembershipLog(identity.uid, {
      action: "invite:rejected",
      schoolId: profile.schoolId,
      result: "denied",
      reason: "not_found",
    });
    res.status(404).json({ error: rejectionMessage("not_found") });
    return;
  }

  const inviteRef = db.collection("invites").doc(inviteId);
  const userRef = db.collection("users").doc(identity.uid);

  try {
    const outcome = await db.runTransaction(async (tx) => {
      const inviteSnap = await tx.get(inviteRef);
      if (!inviteSnap.exists) throw new RejectedError("not_found");
      const invite = inviteSnap.data() as InviteDoc;

      const userSnap = await tx.get(userRef);
      const user = userSnap.data() ?? {};
      const currentSchoolId = (user.schoolId as string) ?? "";

      // ---- idempotence, checked FIRST ------------------------------------
      // This has to come before every validity check, and the reason is a
      // real failure rather than tidiness: a single-use invite is EXHAUSTED
      // the moment its own holder redeems it, so re-scanning your own QR —
      // a double tap, a back button, a reload on a flaky connection — used
      // to come back "this invitation has already been used". Told to the
      // one person for whom it demonstrably worked.
      //
      // Returning early is safe because it grants nothing: the membership
      // this account would receive is the one it already has. Expiry and
      // revocation are checked after, for the same reason — neither
      // retroactively removes a membership, so re-scanning a since-revoked
      // invitation you already redeemed is still a no-op rather than an
      // error about something that no longer concerns you.
      if (invite.usedBy?.includes(identity.uid)) {
        return { alreadyRedeemed: true, invite };
      }

      const rejection = checkInvite(invite);
      if (rejection) throw new RejectedError(rejection);

      // A user already at ANOTHER school cannot be pulled into this one by a
      // token. Multi-school support is a deliberate feature, not something a
      // QR should trigger by accident — see docs/SECURITY.md.
      if (currentSchoolId && currentSchoolId !== invite.schoolId) {
        throw new RejectedError("wrong_school");
      }

      // ---- the grant ------------------------------------------------------
      // Built entirely from `invite`. Note that each branch writes ONLY the
      // fields its own kind justifies: a class invite can never write
      // teacherId, and a parent invite can never write principalOfSchoolId,
      // regardless of what the caller sends.
      const patch: Record<string, unknown> = {
        schoolId: invite.schoolId,
        role: invite.targetRole,
        onboardingComplete: true,
        fullName: (user.fullName as string) || identity.displayName,
        email: (user.email as string) || identity.email,
        language: user.language ?? "en",
        createdAt: user.createdAt ?? new Date().toISOString(),
      };
      const existingClassIds = ((user.classIds as string[] | undefined) ?? []).filter(Boolean);

      if (invite.kind === "school_admin") {
        patch.principalOfSchoolId = invite.schoolId;
      } else if (invite.kind === "school_teacher") {
        patch.teacherId = identity.uid;
      } else if (invite.kind === "class_student") {
        if (!invite.classId) throw new RejectedError("not_found");
        // A student record is created for this account so attendance,
        // assignments and the AI tools have something to point at. Without
        // it a "joined" student is a profile with no school presence.
        const studentRef = db.collection("students").doc();
        const classSnap = await tx.get(db.collection("classes").doc(invite.classId));
        if (!classSnap.exists || classSnap.data()?.schoolId !== invite.schoolId) {
          throw new RejectedError("not_found");
        }
        tx.set(studentRef, {
          fullName: patch.fullName,
          rollNumber: "",
          classId: invite.classId,
          className: (classSnap.data()?.className as string) ?? "",
          section: (classSnap.data()?.section as string) ?? "",
          schoolId: invite.schoolId,
          userId: identity.uid,
          ...(identity.photoUrl ? { photoUrl: identity.photoUrl } : {}),
          createdAt: new Date().toISOString(),
        });
        patch.studentId = studentRef.id;
        patch.classIds = unique([...existingClassIds, invite.classId]);
      } else {
        // parent_link
        if (!invite.studentId) throw new RejectedError("not_found");
        const studentSnap = await tx.get(db.collection("students").doc(invite.studentId));
        if (!studentSnap.exists || studentSnap.data()?.schoolId !== invite.schoolId) {
          throw new RejectedError("not_found");
        }
        const linked = ((user.linkedStudentIds as string[] | undefined) ?? []).filter(Boolean);
        patch.linkedStudentIds = unique([...linked, invite.studentId]);
        const childClassId = studentSnap.data()?.classId as string | undefined;
        if (childClassId) patch.classIds = unique([...existingClassIds, childClassId]);
      }

      tx.set(userRef, patch, { merge: true });
      tx.update(inviteRef, {
        usedCount: (invite.usedCount ?? 0) + 1,
        usedBy: [...(invite.usedBy ?? []), identity.uid],
        lastUsedAt: new Date().toISOString(),
      });

      return { alreadyRedeemed: false, invite };
    });

    await writeMembershipLog(identity.uid, {
      action: "invite:redeemed",
      schoolId: outcome.invite.schoolId,
      result: "success",
      details: {
        inviteId,
        kind: outcome.invite.kind,
        repeat: outcome.alreadyRedeemed,
      },
    });

    res.status(200).json({
      success: true,
      schoolId: outcome.invite.schoolId,
      role: outcome.invite.targetRole,
      kind: outcome.invite.kind,
      alreadyRedeemed: outcome.alreadyRedeemed,
    });
  } catch (err) {
    if (err instanceof RejectedError) {
      await writeMembershipLog(identity.uid, {
        action: "invite:rejected",
        schoolId: profile.schoolId,
        result: "denied",
        reason: err.reason,
        details: { inviteId },
      });
      // 410 Gone for a credential that was real and no longer works, 404 for
      // one that never existed — the client shows different copy for each.
      res.status(err.reason === "not_found" ? 404 : 410).json({ error: rejectionMessage(err.reason) });
      return;
    }
    console.error("invites/redeem failed", err);
    await writeMembershipLog(identity.uid, {
      action: "invite:redeemed",
      schoolId: profile.schoolId,
      result: "error",
      details: { inviteId },
    });
    res.status(500).json({ error: "Something went wrong joining. Please try again." });
  }
}

class RejectedError extends Error {
  constructor(public reason: Parameters<typeof rejectionMessage>[0]) {
    super(reason);
  }
}

async function resolveInviteId(token?: string, code?: string): Promise<string | null> {
  const db = adminDb();
  if (token) {
    const id = hashSecret(token);
    if ((await db.collection("invites").doc(id).get()).exists) return id;
  }
  if (code) {
    const snap = await db.collection("inviteCodeIndex").doc(normalizeHumanCode(code)).get();
    const id = snap.data()?.tokenHash as string | undefined;
    if (id) return id;
  }
  return null;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
