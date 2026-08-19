// ==========================================================================
// TrustedUserContext — the only identity the server ever believes
// --------------------------------------------------------------------------
// Everything downstream (tools, authorization, audit) reads identity from
// here and from nowhere else. In particular:
//
//   * role, schoolId, studentId, linkedStudentIds come from the users/{uid}
//     Firestore document, keyed by a VERIFIED Firebase ID token — never
//     from a request body field, a header, or anything the model produced.
//   * `role` alone is a REQUEST, not a grant. The client picks it on the
//     role-selection screen, so a staff role must additionally be PROVEN by
//     a server-written field before this function will issue a context:
//         principal → principalOfSchoolId must equal schoolId
//         teacher   → teacherId must equal the caller's own uid
//     Both are written only by api/onboarding/redeem-invite.ts against a
//     single-use school-issued code, and firestore.rules rejects every
//     client write to them. Signing up as "Principal" and skipping the code
//     therefore yields an account that cannot read anything school-wide.
//   * "I am the principal" in a chat message reaches the model as ordinary
//     text and changes nothing here.
//   * firestore.rules forbids the client from writing studentId /
//     linkedStudentIds / teacherId on its own profile, so a user cannot
//     re-link themselves to another child. Those are set server-side only,
//     by api/onboarding/redeem-invite.ts, against a single-use invite code.
// ==========================================================================
import { adminDb, verifyIdToken, AuthError } from "./firebaseAdmin.js";
import { listClassesForTeacher } from "./school/people.js";
import type { Role, LanguageCode } from "../../src/types/index.js";

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
   * The school this account is a VERIFIED principal of. Present only when
   * redemption of a principal invite code has proven it. Every school-wide
   * capability is gated on this, never on role alone.
   */
  principalOfSchoolId?: string;
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
  authorizationHeader: string | undefined,
): Promise<TrustedUserContext> {
  const decoded = await verifyIdToken(authorizationHeader);
  const uid = decoded.uid;

  const snap = await adminDb().collection("users").doc(uid).get();
  if (!snap.exists)
    throw new AuthError("No EDVIA profile found for this account.");
  const data = snap.data()!;

  const role = data.role as Role;
  if (!VALID_ROLES.includes(role)) {
    // A profile with a missing or unrecognised role must fail closed rather
    // than defaulting to anything.
    throw new AuthError(
      "This account doesn't have a valid role assigned. Please contact your school.",
    );
  }
  const schoolId = (data.schoolId as string) ?? "";
  if (!schoolId) {
    throw new AuthError("Finish choosing your school before using EDVIA.");
  }

  // ---- staff roles must be PROVEN, not merely declared ------------------
  // A privileged role is only ever a request until a server-written grant
  // backs it. Fail closed with an actionable message rather than issuing a
  // context that later denies every individual call.
  const principalOfSchoolId = data.principalOfSchoolId as string | undefined;
  if (role === "principal" && principalOfSchoolId !== schoolId) {
    throw new AuthError(
      "This account hasn't been verified as school management yet. Enter the principal invite code your school issued to unlock school-wide access.",
    );
  }

  const teacherId = data.teacherId as string | undefined;
  if (role === "teacher" && teacherId !== uid) {
    throw new AuthError(
      "This account hasn't been verified as a teacher yet. Enter the invite code your school issued for your class.",
    );
  }

  const context: TrustedUserContext = {
    uid,
    role,
    schoolId,
    studentId:
      role === "student" ? (data.studentId as string | undefined) : undefined,
    linkedStudentIds:
      role === "parent"
        ? ((data.linkedStudentIds as string[] | undefined) ?? [])
        : undefined,
    teacherId: role === "teacher" ? teacherId : undefined,
    principalOfSchoolId: role === "principal" ? principalOfSchoolId : undefined,
    classIds: (data.classIds as string[] | undefined) ?? [],
    language: (data.language as LanguageCode) ?? "en",
  };

  if (role === "teacher") {
    // Derived from the classes collection each request rather than cached on
    // the profile, so revoking a class assignment takes effect immediately.
    const classes = await listClassesForTeacher(uid);
    context.teacherClassIds = classes
      .filter((c) => c.schoolId === schoolId)
      .map((c) => c.id);
  }

  return context;
}

/**
 * Verified school management.
 *
 * The ONLY predicate any school-wide capability may branch on. `role`
 * answers "what did this user ask to be?"; this answers "what did the school
 * actually grant?". They are different questions, and conflating them was
 * CRIT-01: a self-declared principal could read a whole school because six
 * separate call sites each checked `ctx.role === "principal"`.
 *
 * Keeping the predicate in one place means a new principal-scoped tool
 * cannot accidentally reintroduce the hole by writing the easy check.
 */
export function isVerifiedManagement(ctx: TrustedUserContext): boolean {
  return (
    ctx.role === "principal" &&
    Boolean(ctx.schoolId) &&
    ctx.principalOfSchoolId === ctx.schoolId
  );
}
