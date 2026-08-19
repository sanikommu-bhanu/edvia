// ==========================================================================
// POST /api/invites/create
// --------------------------------------------------------------------------
// Mints a join token. This is the only place invites come into existence,
// and the authorization here is the entire reason the QR system is safe:
//
//   school_teacher / school_admin  → school administrator only
//   class_student                  → the teacher OF THAT CLASS (or an admin)
//   parent_link                    → the teacher of that student's class
//                                    (or an admin), and the student must
//                                    actually be in that school
//
// Note what the caller does NOT supply: the role. `kind` is looked up in
// ROLE_FOR_KIND, a constant. A request asking for `targetRole: "principal"`
// has nowhere to put it — the field does not exist in the schema, and the
// only kind that yields "principal" requires the caller to already be a
// verified administrator of that same school.
//
// The response is the ONLY time the raw secret and human code are ever
// returned. They are stored hashed; if the issuer loses them, they issue a
// new invite. That is deliberate: an invite list that could re-display live
// secrets is an invite list worth stealing.
// ==========================================================================
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { adminDb, AuthError } from "../firebaseAdmin.js";
import { resolveIdentity, requireSchoolAdmin, requireTeacher } from "../identity.js";
import { consumeRateLimit, rateLimitMessage } from "../rateLimit.js";
import { writeMembershipLog } from "../audit.js";
import {
  ROLE_FOR_KIND,
  generateHumanCode,
  generateInviteSecret,
  hashSecret,
  type InviteDoc,
  type InviteKind,
} from "../invites.js";

const bodySchema = z.object({
  kind: z.enum(["school_teacher", "school_admin", "class_student", "parent_link"]),
  classId: z.string().trim().min(1).max(128).optional(),
  studentId: z.string().trim().min(1).max(128).optional(),
  label: z.string().trim().max(80).optional(),
  /** Days until expiry. Omit for a standing invite (a noticeboard QR). */
  expiresInDays: z.number().int().min(1).max(365).optional(),
  usageLimit: z.number().int().min(1).max(500).optional(),
});

/**
 * Defaults chosen from how each invite is actually used, not from a rule.
 *
 * A teacher QR goes on a staff-room wall and should keep working for a term.
 * A class QR is shown to a room of students once. A parent link identifies
 * ONE child and must therefore be single-use — a reusable parent invite is
 * an invite to give a stranger access to a specific child's attendance.
 */
const DEFAULTS: Record<InviteKind, { usageLimit: number | null; expiresInDays: number | null }> = {
  school_teacher: { usageLimit: null, expiresInDays: 90 },
  school_admin: { usageLimit: 1, expiresInDays: 7 },
  class_student: { usageLimit: null, expiresInDays: 90 },
  parent_link: { usageLimit: 1, expiresInDays: 30 },
};

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
  if (!schoolId) {
    res.status(403).json({ error: "Join your school before creating invitations." });
    return;
  }

  const limit = await consumeRateLimit(identity.uid, "create_invite");
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSeconds));
    res.status(429).json({ error: rateLimitMessage("create_invite") });
    return;
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please check the invitation details and try again." });
    return;
  }
  const input = parsed.data;
  const db = adminDb();

  // ---- authorization, per kind ------------------------------------------
  try {
    if (input.kind === "school_teacher" || input.kind === "school_admin") {
      requireSchoolAdmin(identity, schoolId);
    } else if (input.kind === "class_student") {
      if (!input.classId) throw new AuthError("A class is required for a student invitation.");
      await requireOwnershipOfClass(identity, schoolId, input.classId);
    } else {
      // parent_link
      if (!input.studentId) throw new AuthError("A student is required for a parent invitation.");
      const studentSnap = await db.collection("students").doc(input.studentId).get();
      if (!studentSnap.exists || studentSnap.data()?.schoolId !== schoolId) {
        // Same message for "no such student" and "student at another school":
        // distinguishing them turns this endpoint into a way to probe which
        // student ids exist.
        throw new AuthError("That student isn't at this school.");
      }
      const studentClassId = studentSnap.data()?.classId as string | undefined;
      if (!studentClassId) throw new AuthError("That student isn't assigned to a class yet.");
      await requireOwnershipOfClass(identity, schoolId, studentClassId);
      input.classId = studentClassId;
    }
  } catch (err) {
    await writeMembershipLog(identity.uid, {
      action: "invite:created",
      schoolId,
      result: "denied",
      reason: err instanceof Error ? err.message : "denied",
    });
    res.status(403).json({ error: err instanceof AuthError ? err.message : "Not allowed." });
    return;
  }

  // ---- mint --------------------------------------------------------------
  const secret = generateInviteSecret();
  const tokenHash = hashSecret(secret);
  const humanCode = generateHumanCode();
  const defaults = DEFAULTS[input.kind];
  const expiresInDays = input.expiresInDays ?? defaults.expiresInDays;

  const invite: InviteDoc = {
    tokenHash,
    kind: input.kind,
    targetRole: ROLE_FOR_KIND[input.kind],
    schoolId,
    ...(input.classId ? { classId: input.classId } : {}),
    ...(input.studentId ? { studentId: input.studentId } : {}),
    humanCode,
    createdBy: identity.uid,
    createdAt: new Date().toISOString(),
    expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString() : null,
    usageLimit: input.usageLimit ?? defaults.usageLimit,
    usedCount: 0,
    status: "active",
    usedBy: [],
    label: input.label ?? "",
  };

  try {
    const batch = db.batch();
    batch.set(db.collection("invites").doc(tokenHash), invite);
    // A second document keyed by the human code, so typing a code is a point
    // read rather than a collection scan — and so a code can be revoked
    // without invalidating the QR, and vice versa.
    batch.set(db.collection("inviteCodeIndex").doc(humanCode), {
      tokenHash,
      schoolId,
      createdAt: invite.createdAt,
    });
    await batch.commit();
  } catch (err) {
    console.error("invites/create failed", err);
    res.status(500).json({ error: "We couldn't create that invitation. Please try again." });
    return;
  }

  await writeMembershipLog(identity.uid, {
    action: "invite:created",
    schoolId,
    result: "success",
    // inviteId is the HASH — safe to log, and useless to a thief.
    details: { inviteId: tokenHash, kind: input.kind, classId: input.classId },
  });

  res.status(201).json({
    invite: {
      id: tokenHash,
      kind: invite.kind,
      label: invite.label,
      classId: invite.classId ?? null,
      studentId: invite.studentId ?? null,
      expiresAt: invite.expiresAt,
      usageLimit: invite.usageLimit,
      usedCount: 0,
      status: invite.status,
      createdAt: invite.createdAt,
    },
    // Shown once. See the header note.
    secret,
    humanCode,
  });
}

/**
 * The caller must actually be responsible for this class.
 *
 * A school administrator may act for any class in their own school; a
 * teacher only for classes whose `teacherId` is them. Notably a teacher at
 * the school who does NOT teach 10-A cannot mint invites into 10-A, which is
 * what stops "any teacher can add anyone to any class".
 */
async function requireOwnershipOfClass(
  identity: Awaited<ReturnType<typeof resolveIdentity>>,
  schoolId: string,
  classId: string
): Promise<void> {
  const snap = await adminDb().collection("classes").doc(classId).get();
  if (!snap.exists || snap.data()?.schoolId !== schoolId) {
    throw new AuthError("That class isn't at this school.");
  }
  if (identity.profile?.principalOfSchoolId === schoolId) return;
  requireTeacher(identity, schoolId);
  if (snap.data()?.teacherId !== identity.uid) {
    throw new AuthError("You can only create invitations for classes you teach.");
  }
}
