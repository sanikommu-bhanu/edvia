// ==========================================================================
// POST /api/onboarding/redeem-invite
// --------------------------------------------------------------------------
// Signup only creates an auth account + a bare users/{uid} profile. It does
// NOT know which student a new "student" account belongs to, which child a
// "parent" belongs to, or which class a "teacher" teaches — that linkage is
// exactly the data EDVIA's AI tools need (see api/_lib/userContext.ts:
// studentId / linkedStudentIds / teacherClassIds) to answer "how is my
// child doing" or "mark my class present" at all.
//
// This route is the ONLY place that linkage gets set, deliberately. It is
// NOT done via a direct client Firestore write to users/{uid} — even though
// firestore.rules lets a user update their own profile document, the rules
// explicitly forbid the client from ever touching studentId, linkedStudentIds,
// or teacherId itself (see firestore.rules). If it didn't, a signed-in
// student could simply set studentId to a classmate's id and read that
// classmate's grades/attendance through the AI tools, which trust the
// profile field completely. So: invite codes are opaque, single-use,
// looked up with the Admin SDK (clients can never read the inviteCodes
// collection either), and consumed inside a transaction to close the
// double-redemption race.
// ==========================================================================
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { resolveUserContext } from "../_lib/userContext.js";
import { adminDb, AuthError } from "../_lib/firebaseAdmin.js";
import { consumeRateLimit, rateLimitMessage } from "../_lib/rateLimit.js";
import { writeAuditLog } from "../_lib/audit.js";

const bodySchema = z.object({
  code: z.string().trim().min(4).max(32),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let ctx;
  try {
    ctx = await resolveUserContext(
      req.headers.authorization as string | undefined,
    );

    // Abuse protection — see api/_lib/rateLimit.ts. Checked after
    // authentication so limits are per real account, not per IP.
    const limit = await consumeRateLimit(ctx.uid, "redeem_invite");
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfterSeconds));
      res.status(429).json({ error: rateLimitMessage("redeem_invite") });
      return;
    }
  } catch (err) {
    res
      .status(401)
      .json({ error: err instanceof AuthError ? err.message : "Unauthorized" });
    return;
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Please enter the invite code your school gave you." });
    return;
  }
  const code = parsed.data.code.toUpperCase();

  if (!ctx.schoolId) {
    res
      .status(400)
      .json({ error: "Select your school before entering an invite code." });
    return;
  }

  const db = adminDb();
  const inviteRef = db.collection("inviteCodes").doc(code);
  const userRef = db.collection("users").doc(ctx.uid);

  try {
    const result = await db.runTransaction(async (tx) => {
      const inviteSnap = await tx.get(inviteRef);
      if (!inviteSnap.exists) {
        throw new UserFacingError(
          "That code doesn't look right. Double-check it and try again.",
        );
      }
      const invite = inviteSnap.data()!;

      if (invite.used) {
        throw new UserFacingError("That code has already been used.");
      }
      if (invite.schoolId !== ctx.schoolId) {
        throw new UserFacingError("That code belongs to a different school.");
      }
      if (invite.role !== ctx.role) {
        throw new UserFacingError(
          `That code is for a ${invite.role} account, not a ${ctx.role} account.`,
        );
      }

      const userPatch: Record<string, unknown> = {};
      const classRefsToClaim: FirebaseFirestore.DocumentReference[] = [];

      // `classIds` is written for EVERY role that has one. firestore.rules
      // reads it to decide which class's assignments, exams, timetable and
      // attendance this account may see directly (see canReadClassContent
      // and myClassIds there). It is derived here, server-side, from records
      // this transaction has actually verified — never supplied by a client.
      const existingClassIds: string[] = ctx.classIds ?? [];

      if (ctx.role === "student") {
        const studentSnap = await tx.get(
          db.collection("students").doc(invite.studentId),
        );
        if (!studentSnap.exists)
          throw new UserFacingError(
            "This code's student record couldn't be found. Contact your school.",
          );
        const student = studentSnap.data()!;
        if (student.schoolId !== ctx.schoolId) {
          throw new UserFacingError("That code belongs to a different school.");
        }
        userPatch.studentId = invite.studentId;
        userPatch.classIds = unique([
          ...existingClassIds,
          student.classId as string,
        ]);
      } else if (ctx.role === "parent") {
        const studentSnap = await tx.get(
          db.collection("students").doc(invite.studentId),
        );
        if (!studentSnap.exists)
          throw new UserFacingError(
            "This code's student record couldn't be found. Contact your school.",
          );
        const student = studentSnap.data()!;
        if (student.schoolId !== ctx.schoolId) {
          throw new UserFacingError("That code belongs to a different school.");
        }
        const existing: string[] = ctx.linkedStudentIds ?? [];
        if (!existing.includes(invite.studentId)) {
          userPatch.linkedStudentIds = [...existing, invite.studentId];
        }
        // A parent linking a second child gains that child's class too.
        userPatch.classIds = unique([
          ...existingClassIds,
          student.classId as string,
        ]);
      } else if (ctx.role === "teacher") {
        const classIds: string[] =
          invite.classIds ?? (invite.classId ? [invite.classId] : []);
        if (classIds.length === 0)
          throw new UserFacingError(
            "This code isn't linked to any class. Contact your school.",
          );
        for (const classId of classIds) {
          const classRef = db.collection("classes").doc(classId);
          const classSnap = await tx.get(classRef);
          if (!classSnap.exists)
            throw new UserFacingError(
              "This code's class record couldn't be found. Contact your school.",
            );
          if (classSnap.data()?.schoolId !== ctx.schoolId) {
            throw new UserFacingError(
              "That code belongs to a different school.",
            );
          }
          classRefsToClaim.push(classRef);
        }
        userPatch.teacherId = ctx.uid;
        userPatch.classIds = unique([...existingClassIds, ...classIds]);
      } else if (ctx.role === "principal") {
        // The GRANT for school-wide access. Until this line runs against a
        // valid, unused, school-matched principal code, `role: "principal"`
        // on the profile confers nothing: resolveUserContext refuses to issue
        // a context, the principal tools check principalOfSchoolId, and
        // firestore.rules' isPrincipalOf() reads this field rather than role.
        userPatch.principalOfSchoolId = ctx.schoolId;
      }

      tx.update(inviteRef, {
        used: true,
        usedBy: ctx.uid,
        usedAt: new Date().toISOString(),
      });
      if (Object.keys(userPatch).length > 0) tx.update(userRef, userPatch);
      for (const classRef of classRefsToClaim)
        tx.update(classRef, { teacherId: ctx.uid });

      return { userPatch };
    });

    await writeAuditLog(ctx, {
      action: "write:redeem_invite",
      result: "success",
      args: { role: ctx.role },
    });
    res.status(200).json({ success: true, linked: result.userPatch });
  } catch (err) {
    if (err instanceof UserFacingError) {
      await writeAuditLog(ctx, {
        action: "write:redeem_invite",
        result: "denied",
        reason: err.message,
      });
      res.status(400).json({ error: err.message });
      return;
    }
    console.error("redeem-invite failed", err);
    await writeAuditLog(ctx, {
      action: "write:redeem_invite",
      result: "error",
    });
    res
      .status(500)
      .json({
        error: "Something went wrong linking your account. Please try again.",
      });
  }
}

class UserFacingError extends Error {}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
