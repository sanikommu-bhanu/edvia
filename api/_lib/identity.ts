// ==========================================================================
// Identity, without a grant
// --------------------------------------------------------------------------
// resolveUserContext() (userContext.ts) answers "what is this account
// allowed to do at its school?" and deliberately REFUSES to issue a context
// for an account with no school or no staff grant. That is correct for every
// route that reads school data — and useless for the routes that exist to
// CREATE the grant in the first place.
//
// A person arriving from a QR code has a verified Google identity and
// nothing else: no school, no role that means anything, no membership. The
// onboarding routes need to authenticate them without pretending that
// authentication is authorization. That is exactly what this module is.
//
// The distinction is the whole security model in one sentence:
//   resolveIdentity  — "who owns this Google account?"      (authentication)
//   resolveUserContext — "what has the school granted them?" (authorization)
// Never use this module to decide what someone may READ.
// ==========================================================================
import { adminDb, verifyIdToken, AuthError } from "./firebaseAdmin.js";
import type { Role } from "../../src/types/index.js";

export interface Identity {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  photoUrl?: string;
  /** The users/{uid} document, or null if this account has never had one. */
  profile: ProfileSnapshot | null;
}

export interface ProfileSnapshot {
  role: Role;
  schoolId: string;
  fullName: string;
  studentId?: string;
  linkedStudentIds?: string[];
  teacherId?: string;
  principalOfSchoolId?: string;
  classIds?: string[];
}

export async function resolveIdentity(authorizationHeader: string | undefined): Promise<Identity> {
  const decoded = await verifyIdToken(authorizationHeader);

  const snap = await adminDb().collection("users").doc(decoded.uid).get();
  const data = snap.exists ? snap.data()! : null;

  return {
    uid: decoded.uid,
    email: (decoded.email as string | undefined) ?? (data?.email as string | undefined) ?? "",
    emailVerified: Boolean(decoded.email_verified),
    displayName:
      (data?.fullName as string | undefined) ||
      (decoded.name as string | undefined) ||
      (decoded.email as string | undefined)?.split("@")[0] ||
      "",
    photoUrl: (decoded.picture as string | undefined) ?? (data?.photoUrl as string | undefined),
    profile: data
      ? {
          role: data.role as Role,
          schoolId: (data.schoolId as string) ?? "",
          fullName: (data.fullName as string) ?? "",
          studentId: data.studentId as string | undefined,
          linkedStudentIds: data.linkedStudentIds as string[] | undefined,
          teacherId: data.teacherId as string | undefined,
          principalOfSchoolId: data.principalOfSchoolId as string | undefined,
          classIds: (data.classIds as string[] | undefined) ?? [],
        }
      : null,
  };
}

/**
 * Creates the users/{uid} document if this account has never had one.
 *
 * A Google sign-in that happens *inside* a join flow can land here before
 * the client has written a profile, and the join must not fail because of
 * an ordering accident. The document created here is deliberately inert:
 *
 *   role: "student"  — the lowest-privilege value in the union. It is not a
 *     claim about this person; it is a placeholder that grants NOTHING,
 *     because every student capability additionally requires studentId or
 *     classIds, which are absent. Redemption overwrites it with the role the
 *     INVITE specifies.
 *   schoolId: ""     — the signal the client uses to show "Create or join a
 *     school" instead of a dashboard.
 *
 * @returns the profile as it now stands
 */
export async function ensureProfile(identity: Identity): Promise<ProfileSnapshot> {
  if (identity.profile) return identity.profile;

  const profile: ProfileSnapshot = {
    role: "student",
    schoolId: "",
    fullName: identity.displayName,
  };

  await adminDb()
    .collection("users")
    .doc(identity.uid)
    .set(
      {
        fullName: identity.displayName,
        email: identity.email,
        role: profile.role,
        schoolId: "",
        language: "en",
        onboardingComplete: false,
        createdAt: new Date().toISOString(),
        ...(identity.photoUrl ? { photoUrl: identity.photoUrl } : {}),
      },
      { merge: true }
    );

  return profile;
}

/** Throws unless the caller is the VERIFIED administrator of `schoolId`. */
export function requireSchoolAdmin(identity: Identity, schoolId: string): void {
  const profile = identity.profile;
  // Reads principalOfSchoolId — the server-written grant — and never `role`.
  // This is the same predicate as isVerifiedManagement() in userContext.ts
  // and isPrincipalOf() in firestore.rules; all three must stay in step.
  if (!profile || profile.principalOfSchoolId !== schoolId || profile.schoolId !== schoolId) {
    throw new AuthError(
      "Only a verified administrator of this school can do that."
    );
  }
}

/** Throws unless the caller is a VERIFIED teacher at `schoolId`. */
export function requireTeacher(identity: Identity, schoolId: string): void {
  const profile = identity.profile;
  const isTeacher = profile?.teacherId === identity.uid && profile?.schoolId === schoolId;
  const isAdmin = profile?.principalOfSchoolId === schoolId;
  if (!profile || (!isTeacher && !isAdmin)) {
    throw new AuthError("Only a verified teacher at this school can do that.");
  }
}
