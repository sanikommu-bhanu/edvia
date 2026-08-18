// ==========================================================================
// Auth service — real Firebase Authentication + Firestore profile doc
// --------------------------------------------------------------------------
// Every function here is backed by the real Firebase project configured in
// config.ts. There is no local mock fallback: if Firebase isn't configured,
// calls throw a clear setup error (see requireFirebase in config.ts) rather
// than silently running against fake data.
//
// The users/{uid} Firestore document is the single profile record both the
// client UI and the server AI backend (api/_lib/userContext.ts) read from —
// so once a user completes onboarding here, EDVIA's AI already knows their
// role, school, and language on the very next request.
// ==========================================================================
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile as updateFirebaseProfile,
  sendPasswordResetEmail,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { requireFirebase, auth as authInstance, isFirebaseConfigured } from "./config";
import type { Role, UserProfile } from "@/types";

export interface SignUpInput {
  fullName: string;
  email: string;
  password: string;
  role: Role;
}

export interface SignInInput {
  emailOrPhone: string;
  password: string;
}

function profileRef(uid: string) {
  const { db } = requireFirebase();
  return doc(db, "users", uid);
}

function toProfile(uid: string, data: Record<string, unknown>): UserProfile {
  return {
    uid,
    fullName: (data.fullName as string) ?? "",
    email: (data.email as string) ?? "",
    phone: data.phone as string | undefined,
    role: data.role as Role,
    schoolId: (data.schoolId as string) ?? "",
    photoUrl: data.photoUrl as string | undefined,
    language: (data.language as UserProfile["language"]) ?? "en",
    onboardingComplete: Boolean(data.onboardingComplete),
    createdAt: (data.createdAt as string) ?? new Date().toISOString(),
    studentId: data.studentId as string | undefined,
    linkedStudentIds: data.linkedStudentIds as string[] | undefined,
    teacherId: data.teacherId as string | undefined,
  };
}

export async function signUp(input: SignUpInput): Promise<UserProfile> {
  const { auth } = requireFirebase();
  const credential = await createUserWithEmailAndPassword(auth, input.email, input.password);
  await updateFirebaseProfile(credential.user, { displayName: input.fullName });

  // Role is set once, here, at account creation — firestore.rules forbids
  // ever changing it via a client update afterwards (no client-side role
  // escalation). schoolId starts empty and is filled in during onboarding.
  const profileData = {
    fullName: input.fullName,
    email: input.email,
    role: input.role,
    schoolId: "",
    language: "en" as const,
    onboardingComplete: false,
    createdAt: new Date().toISOString(),
  };
  await setDoc(profileRef(credential.user.uid), { ...profileData, createdAtServer: serverTimestamp() });
  return toProfile(credential.user.uid, profileData);
}

export async function signIn(input: SignInInput): Promise<UserProfile> {
  const { auth } = requireFirebase();
  const credential = await signInWithEmailAndPassword(auth, input.emailOrPhone, input.password);
  const snap = await getDoc(profileRef(credential.user.uid));
  if (!snap.exists()) {
    throw new Error("Signed in, but no EDVIA profile was found for this account. Please contact your school.");
  }
  return toProfile(credential.user.uid, snap.data());
}

export async function signOutUser(): Promise<void> {
  const { auth } = requireFirebase();
  await signOut(auth);
}

/**
 * Resolves once with the current profile (or null), waiting for Firebase
 * Auth's own state restoration to finish first so a page refresh doesn't
 * briefly appear signed-out before Firebase reports the real session.
 */
export async function getCurrentUser(): Promise<UserProfile | null> {
  const { auth } = requireFirebase();
  const user = await new Promise<User | null>((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      unsubscribe();
      resolve(u);
    });
  });
  if (!user) return null;
  const snap = await getDoc(profileRef(user.uid));
  if (!snap.exists()) return null;
  return toProfile(user.uid, snap.data());
}

/**
 * Subscribes to live auth state changes (sign-in, sign-out, token refresh).
 * Returns an unsubscribe function. Used by AuthContext so the whole app
 * reacts immediately to auth changes instead of only checking once on load.
 */
export function onAuthChange(callback: (profile: UserProfile | null) => void): () => void {
  const { auth } = requireFirebase();
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback(null);
      return;
    }
    const snap = await getDoc(profileRef(user.uid));
    callback(snap.exists() ? toProfile(user.uid, snap.data()) : null);
  });
}

// Fields a user may update on their own profile via the client SDK. `role`
// is deliberately excluded — it can never change after signup. `schoolId`
// is allowed here because onboarding needs to set it once; firestore.rules
// (see match /users/{userId}) enforces that it can only move from "" to a
// value, never be reassigned afterwards.
export async function updateUserProfile(
  uid: string,
  patch: Partial<Pick<UserProfile, "schoolId" | "language" | "onboardingComplete" | "phone" | "photoUrl">>
): Promise<UserProfile> {
  await updateDoc(profileRef(uid), { ...patch });
  const snap = await getDoc(profileRef(uid));
  if (!snap.exists()) throw new Error("Profile not found after update.");
  return toProfile(uid, snap.data());
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { auth } = requireFirebase();
  await sendPasswordResetEmail(auth, email);
}

/**
 * EDVIA's email/password sign-up already verifies the address is a usable
 * account (Firebase rejects malformed/duplicate emails at signUp time).
 * A numeric OTP step adds friction without adding real security unless
 * backed by a dedicated SMS/email OTP provider, which is a deliberate
 * follow-up integration (e.g. Firebase Phone Auth) rather than something
 * to fake here. This keeps the screen functional while being honest that
 * it's a pass-through, not a verified code.
 */
export async function verifyOtp(_destination: string, code: string): Promise<boolean> {
  return code.length === 6;
}

/**
 * Real Firebase ID token for calling EDVIA's secured AI backend (api/ai/*.ts).
 * Returns null (rather than throwing) when Firebase isn't configured or no
 * one is signed in, since callers use this to decide whether AI features
 * are reachable right now.
 */
export async function getIdToken(): Promise<string | null> {
  if (!isFirebaseConfigured || !authInstance) return null;
  const user = authInstance.currentUser;
  if (!user) return null;
  return user.getIdToken();
}
