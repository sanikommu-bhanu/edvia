import { adminDb, verifyIdToken, AuthError } from "./firebaseAdmin";
import type { Role, LanguageCode } from "../../src/types";

export interface TrustedUserContext {
  uid: string;
  role: Role;
  schoolId: string;
  studentId?: string;
  linkedStudentIds?: string[];
  teacherId?: string;
  teacherClassIds?: string[];
  language: LanguageCode;
}

/**
 * The single entry point every API route uses to establish who the caller
 * actually is. Verifies the Firebase ID token, then reads the user's
 * profile document from Firestore — role/school/child-links come ONLY from
 * here, never from request body fields the client could tamper with.
 */
export async function resolveUserContext(authorizationHeader: string | undefined): Promise<TrustedUserContext> {
  const decoded = await verifyIdToken(authorizationHeader);
  const uid = decoded.uid;

  const snap = await adminDb().collection("users").doc(uid).get();
  if (!snap.exists) throw new AuthError("No profile found for this account.");
  const data = snap.data()!;

  const context: TrustedUserContext = {
    uid,
    role: data.role,
    schoolId: data.schoolId,
    studentId: data.studentId,
    linkedStudentIds: data.linkedStudentIds,
    teacherId: data.teacherId,
    language: data.language ?? "en",
  };

  if (context.role === "teacher") {
    const classesSnap = await adminDb().collection("classes").where("teacherId", "==", uid).get();
    context.teacherClassIds = classesSnap.docs.map((d) => d.id);
  }

  return context;
}
