// ==========================================================================
// TrustedUserContext — the only identity the server ever believes
// --------------------------------------------------------------------------
// Everything downstream (tools, authorization, audit) reads identity from
// here and from nowhere else. In particular:
//
//   * role, schoolId, studentId, linkedStudentIds come from the users/{uid}
//     Firestore document, keyed by a VERIFIED Firebase ID token — never
//     from a request body field, a header, or anything the model produced.
//   * "I am the principal" in a chat message reaches the model as ordinary
//     text and changes nothing here.
//   * firestore.rules forbids the client from writing studentId /
//     linkedStudentIds / teacherId on its own profile, so a user cannot
//     re-link themselves to another child. Those are set server-side only,
//     by api/onboarding/redeem-invite.ts, against a single-use invite code.
// ==========================================================================
import { adminDb, verifyIdToken, AuthError } from "./firebaseAdmin";
import { listClassesForTeacher } from "./school/people";
import type { Role, LanguageCode } from "../../src/types";

export interface TrustedUserContext {
  uid: string;
  role: Role;
  schoolId: string;
  /** Set for role === "student". */
  studentId?: string;
  /** Set for role === "parent". */
  linkedStudentIds?: string[];
  /** Set for role === "teacher". */
  teacherId?: string;
  /**
   * Classes whose shared content this account may read directly from the
   * browser. Written server-side during invite redemption and mirrored by
   * firestore.rules (myClassIds). Server-side tools do NOT rely on this —
   * they use teacherClassIds, re-derived per request — so a stale value can
   * never widen what the AI is allowed to return.
   */
  classIds?: string[];
  /** Classes this teacher is actually assigned to, resolved per request. */
  teacherClassIds?: string[];
  language: LanguageCode;
  /**
   * Student established earlier in the current conversation. Populated by
   * the orchestrator from conversation memory, NOT from the token. It is
   * always intersected with linkedStudentIds/class scope before use, so it
   * can only narrow a result — never widen one. See memory.ts.
   */
  conversationStudentId?: string;
}

const VALID_ROLES: Role[] = ["student", "parent", "teacher", "principal"];

export async function resolveUserContext(
  authorizationHeader: string | undefined
): Promise<TrustedUserContext> {
  const decoded = await verifyIdToken(authorizationHeader);
  const uid = decoded.uid;

  const snap = await adminDb().collection("users").doc(uid).get();
  if (!snap.exists) throw new AuthError("No EDVIA profile found for this account.");
  const data = snap.data()!;

  const role = data.role as Role;
  if (!VALID_ROLES.includes(role)) {
    // A profile with a missing or unrecognised role must fail closed rather
    // than defaulting to anything.
    throw new AuthError("This account doesn't have a valid role assigned. Please contact your school.");
  }
  const schoolId = (data.schoolId as string) ?? "";
  if (!schoolId) {
    throw new AuthError("Finish choosing your school before using EDVIA.");
  }

  const context: TrustedUserContext = {
    uid,
    role,
    schoolId,
    studentId: role === "student" ? (data.studentId as string | undefined) : undefined,
    linkedStudentIds: role === "parent" ? ((data.linkedStudentIds as string[] | undefined) ?? []) : undefined,
    teacherId: role === "teacher" ? (data.teacherId as string | undefined) : undefined,
    classIds: (data.classIds as string[] | undefined) ?? [],
    language: (data.language as LanguageCode) ?? "en",
  };

  if (role === "teacher") {
    // Derived from the classes collection each request rather than cached on
    // the profile, so revoking a class assignment takes effect immediately.
    const classes = await listClassesForTeacher(uid);
    context.teacherClassIds = classes.filter((c) => c.schoolId === schoolId).map((c) => c.id);
  }

  return context;
}
