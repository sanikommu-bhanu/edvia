// ==========================================================================
// Action: create-class
// --------------------------------------------------------------------------
// A verified teacher creates a class and becomes its teacher in the same
// batch. Server-side because `classes/{id}.teacherId` is read by
// firestore.rules (myClassIds), by the AI tool layer (teacherClassIds), and
// by createInvite to decide who may add students to it — so a client that
// could write it could write itself onto an existing class and inherit that
// class's roster.
//
// The class is created only for the caller's OWN school, taken from their
// profile. There is no schoolId input.
// ==========================================================================
import { z } from "zod";
import { adminDb, AuthError } from "../firebaseAdmin.js";
import { requireTeacher, type Identity } from "../identity.js";
import { writeMembershipLog } from "../audit.js";
import { ActionError, ok, type ActionResult } from "./result.js";

export const createClassSchema = z.object({
  className: z.string().trim().min(1).max(60),
  section: z.string().trim().max(20).optional().default(""),
  academicYear: z.string().trim().max(20).optional(),
  subjects: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
});

export async function createClass(
  identity: Identity,
  input: z.infer<typeof createClassSchema>
): Promise<ActionResult> {
  const schoolId = identity.profile?.schoolId ?? "";
  try {
    if (!schoolId) throw new AuthError("Join your school before creating a class.");
    // Administrators pass this too — requireTeacher accepts a verified
    // administrator of the same school, which is what lets a one-person
    // school set itself up without inviting a second account first.
    requireTeacher(identity, schoolId);
  } catch (err) {
    throw new ActionError(403, err instanceof AuthError ? err.message : "Not allowed.");
  }

  // "Class 10" + "A" → "Class 10 - A", the shape the rest of the app and the
  // AI tools already format and match on.
  const displayName = input.section ? `${input.className} - ${input.section}` : input.className;

  const db = adminDb();
  const classRef = db.collection("classes").doc();

  try {
    const batch = db.batch();
    batch.set(classRef, {
      className: displayName,
      section: input.section,
      schoolId,
      teacherId: identity.uid,
      ...(input.academicYear ? { academicYear: input.academicYear } : {}),
      createdBy: identity.uid,
      createdAt: new Date().toISOString(),
    });

    if (input.subjects?.length) {
      for (const subject of input.subjects) {
        batch.set(db.collection("classSubjects").doc(), {
          classId: classRef.id,
          schoolId,
          subject,
          teacherName: identity.displayName,
          teacherId: identity.uid,
          room: "",
          schedule: "",
          iconKey: "math",
        });
      }
    }

    // The creator gains read access to their new class through the same
    // classIds field every other membership uses — one authorization system,
    // not a special case for "classes you made".
    batch.set(
      db.collection("users").doc(identity.uid),
      { classIds: [...new Set([...(identity.profile?.classIds ?? []), classRef.id])] },
      { merge: true }
    );

    await batch.commit();
  } catch (err) {
    console.error("create-class failed", err);
    throw new ActionError(500, "We couldn't create that class. Please try again.");
  }

  await writeMembershipLog(identity.uid, {
    action: "class:created",
    schoolId,
    result: "success",
    details: { classId: classRef.id, className: displayName },
  });

  return ok(
    {
      class: {
        id: classRef.id,
        className: displayName,
        section: input.section,
        schoolId,
        teacherId: identity.uid,
      },
    },
    201
  );
}
