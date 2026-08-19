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
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
  updateProfile as updateFirebaseProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
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
  email: string;
  password: string;
}

function profileRef(uid: string) {
  const { db } = requireFirebase();
  return doc(db, "users", uid);
}

// --------------------------------------------------------------------------
// Network timeouts
// --------------------------------------------------------------------------
// A Firestore read that never settles is worse than one that fails: the
// button spins forever and the user is left deciding for themselves whether
// the app is broken. Every awaited network call on the sign-in and sign-up
// critical path is bounded, so a stalled connection becomes a sentence the
// user can act on instead of an indefinite spinner.
//
// 15s is deliberately generous — it is not a performance budget, it is the
// point past which waiting is no longer plausibly productive on 3G.
// --------------------------------------------------------------------------
const NETWORK_TIMEOUT_MS = 15_000;

/**
 * Every awaited call on the auth critical path names the STAGE it is in.
 *
 * This exists because of a real support dead end: the app used to answer
 * every stalled call with one sentence about the user's connection. Someone
 * on a perfectly good connection then has no way to tell apart "the Google
 * credential exchange failed" from "you are signed in and Firestore is
 * hanging" — different problems, no shared fix, identical message. The stage
 * label is what makes the difference visible, in the sentence AND in the
 * console line below it.
 */
type AuthStage =
  | "signing you in with Google"
  | "creating your account"
  | "checking your password"
  | "reading your EDVIA profile"
  | "saving your EDVIA profile";

/**
 * One tagged console line per failure, carrying the Firebase error code.
 *
 * The code is the single most useful fact about an auth failure and the one
 * the user-facing sentence must not lead with. Logging it means a report of
 * "it says check my connection" can be resolved by looking, rather than by
 * guessing between four unrelated causes.
 */
function logAuthFailure(stage: AuthStage, err: unknown): void {
  const code = (err as { code?: string })?.code;
  console.error(
    `[EDVIA auth] failed while ${stage}` + (code ? ` — ${code}` : ""),
    err
  );
}

function withTimeout<T>(promise: Promise<T>, stage: AuthStage, ms = NETWORK_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  let timedOut = false;
  return (
    Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          logAuthFailure(stage, new Error(`stalled — no response after ${ms}ms`));
          reject(new Error(timedOutMessage(stage)));
        }, ms);
      }),
    ]) as Promise<T>
  )
    // Every failure on the critical path passes through here, so this is the
    // one place that has to log — a Firestore permission-denied reaching the
    // UI as its raw SDK sentence is exactly as hard to act on as a timeout
    // blamed on the network. The flag keeps a timeout from logging twice.
    .catch((err: unknown) => {
      if (!timedOut) logAuthFailure(stage, err);
      throw err;
    })
    .finally(() => clearTimeout(timer));
}

/**
 * A stalled call is not proof of a bad network, and saying so sends people to
 * restart a router that was never the problem. The profile stages in
 * particular run AFTER the user is already authenticated: if those stall, the
 * sign-in worked and Firestore is the thing that is stuck.
 */
function timedOutMessage(stage: AuthStage): string {
  if (stage === "reading your EDVIA profile" || stage === "saving your EDVIA profile") {
    return `You're signed in, but EDVIA got stuck ${stage}. That's usually the database rather than your network — try again, and if it keeps happening the console has the details.`;
  }
  return `This is taking longer than it should — EDVIA got stuck ${stage}. Check your network, or try again.`;
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
    principalOfSchoolId: data.principalOfSchoolId as string | undefined,
    classIds: (data.classIds as string[] | undefined) ?? [],
  };
}

export async function signUp(input: SignUpInput): Promise<UserProfile> {
  const { auth } = requireFirebase();
  const credential = await withTimeout(
    createUserWithEmailAndPassword(auth, input.email, input.password),
    "creating your account"
  );

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

  // The profile document is the only write the next screen actually depends
  // on, so it is the only one awaited.
  await withTimeout(
    setDoc(profileRef(credential.user.uid), { ...profileData, createdAtServer: serverTimestamp() }),
    "saving your EDVIA profile"
  );

  // The display name and the verification email are both fire-and-forget.
  // Awaiting them used to add two full round trips to a signup the user was
  // already staring at a spinner through, and neither result changes where
  // that user lands: the verify screen reads the live emailVerified flag and
  // offers a resend, so a mail that is still in flight costs nothing.
  void updateFirebaseProfile(credential.user, { displayName: input.fullName }).catch((err) => {
    console.warn("Couldn't set the account display name", err);
  });
  void sendEmailVerification(credential.user).catch((err) => {
    console.warn("Couldn't send the verification email", err);
  });

  return toProfile(credential.user.uid, profileData);
}

export async function signIn(input: SignInInput): Promise<UserProfile> {
  const { auth } = requireFirebase();
  const credential = await withTimeout(
    signInWithEmailAndPassword(auth, input.email, input.password),
    "checking your password"
  );
  const snap = await withTimeout(getDoc(profileRef(credential.user.uid)), "reading your EDVIA profile");
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
  return readProfileWithRetry(user.uid);
}

/**
 * Reads users/{uid}, retrying briefly if the document isn't there yet.
 *
 * This retry is not defensive padding — it closes a real signup race.
 * createUserWithEmailAndPassword resolves and Firebase fires the auth-state
 * listener IMMEDIATELY, before signUp() has finished writing the profile
 * document. Without the retry the listener reads a document that does not
 * exist yet, reports "no profile", and AuthContext clears the user that
 * SignUp had just set — so a successful signup bounced straight back to the
 * sign-in screen and looked like nothing had happened.
 *
 * A genuinely profile-less account (auth record with no Firestore doc) still
 * resolves to null; it just costs ~1.5s to establish that, which only
 * happens on an account that is broken anyway.
 */
async function readProfileWithRetry(uid: string): Promise<UserProfile | null> {
  const backoffMs = [0, 350, 1200];
  for (let attempt = 0; attempt < backoffMs.length; attempt += 1) {
    if (backoffMs[attempt] > 0) {
      await new Promise((resolve) => setTimeout(resolve, backoffMs[attempt]));
    }
    try {
      const snap = await withTimeout(getDoc(profileRef(uid)), "reading your EDVIA profile");
      if (snap.exists()) return toProfile(uid, snap.data());
    } catch (err) {
      // A read that fails is not proof the profile is absent, so the last
      // attempt decides. Reporting null on a transient error would sign the
      // user out of a working session.
      if (attempt === backoffMs.length - 1) {
        console.warn("Couldn't read the EDVIA profile", err);
        return null;
      }
    }
  }
  return null;
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
    callback(await readProfileWithRetry(user.uid));
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
 * Real Firebase email verification.
 *
 * Firebase's email verification is link-based, not a numeric code. Rather
 * than render six OTP boxes and validate them client-side — which would
 * verify nothing at all — EDVIA sends the real verification email and the
 * UI checks the real `emailVerified` flag. Adding a genuine numeric OTP
 * would mean integrating an SMS/email OTP provider; faking one is worse
 * than not having it.
 */
export async function sendVerificationEmail(): Promise<void> {
  const { auth } = requireFirebase();
  const user = auth.currentUser;
  if (!user) throw new Error("You need to be signed in to send a verification email.");
  await sendEmailVerification(user);
}

/** Re-reads the account from Firebase and reports the real verified state. */
export async function refreshEmailVerified(): Promise<boolean> {
  const { auth } = requireFirebase();
  const user = auth.currentUser;
  if (!user) return false;
  await user.reload();
  return auth.currentUser?.emailVerified ?? false;
}

export function currentEmail(): string | null {
  return authInstance?.currentUser?.email ?? null;
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

// ==========================================================================
// Google sign-in
// --------------------------------------------------------------------------
// SECURITY NOTE — read before changing anything here.
//
// `pendingRole` is what the user TAPPED on the role-selection screen. It is
// written to the new profile exactly as email signup does, and it grants
// NOTHING on its own: a staff role additionally requires a server-written
// grant (principalOfSchoolId / teacherId) that only invite redemption can
// produce. resolveUserContext() refuses to issue a context without it, the
// tool layer checks isVerifiedManagement(), and firestore.rules reads the
// grant rather than the role.
//
// So signing in with Google and picking "Principal" yields an account that
// can sign in and see nothing school-wide — which is the whole point of the
// request/grant split. Do NOT "simplify" this by trusting the role.
// See docs/SECURITY.md §3.5.
//
// An EXISTING account ignores pendingRole entirely: the stored profile wins,
// so re-authenticating with Google can never change a role either.
// ==========================================================================

/** Distinguishes a cancelled popup from a genuine failure, for the UI. */
export class GoogleSignInCancelled extends Error {
  constructor() {
    super("Google sign-in was cancelled.");
    this.name = "GoogleSignInCancelled";
  }
}

/**
 * Not an error in the usual sense — the popup was unavailable, so the whole
 * page is navigating to Google instead. The UI catches this and keeps its
 * loading state rather than flashing a failure message at someone whose
 * browser is already leaving.
 */
export class GoogleSignInRedirecting extends Error {
  constructor() {
    super("Continuing to Google...");
    this.name = "GoogleSignInRedirecting";
  }
}

/**
 * Popup failures worth retrying as a full-page redirect.
 *
 * These are environment problems rather than user decisions, and they are the
 * most common way Google sign-in fails in practice:
 *
 *   popup-blocked — any browser can block it, several mobile browsers block
 *     it by default, and in-app webviews (a link opened from WhatsApp, which
 *     is how a lot of parents will arrive) often cannot open one at all.
 *   operation-not-supported-in-this-environment / web-storage-unsupported —
 *     webviews and hardened privacy settings, same story.
 *
 * A cancelled or closed popup is deliberately NOT in this set: the user
 * decided, and throwing them into a full-page Google flow they just
 * dismissed would be the app arguing with them.
 */
const REDIRECT_FALLBACK_CODES = new Set([
  "auth/popup-blocked",
  "auth/operation-not-supported-in-this-environment",
  "auth/web-storage-unsupported",
]);

/**
 * The shared tail of both Google paths: find or create the EDVIA profile.
 *
 * Identical for popup and redirect by construction. The two must not be
 * allowed to drift — a difference between them would mean a user's role or
 * school depended on which browser they happened to be holding.
 */
async function ensureGoogleProfile(user: User, pendingRole: Role): Promise<UserProfile> {
  const ref = profileRef(user.uid);
  const snap = await withTimeout(getDoc(ref), "reading your EDVIA profile");
  // Returning user: the stored profile is authoritative. pendingRole is
  // deliberately not consulted.
  if (snap.exists()) return toProfile(user.uid, snap.data());

  const profileData = {
    fullName: user.displayName ?? "",
    email: user.email ?? "",
    role: pendingRole,
    schoolId: "",
    language: "en" as const,
    onboardingComplete: false,
    createdAt: new Date().toISOString(),
    ...(user.photoURL ? { photoUrl: user.photoURL } : {}),
  };
  await withTimeout(setDoc(ref, { ...profileData, createdAtServer: serverTimestamp() }), "saving your EDVIA profile");
  return toProfile(user.uid, profileData);
}

function googleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  // Always show the chooser: on a shared school device, silently reusing the
  // last Google session is a genuine privacy problem.
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

export async function signInWithGoogle(pendingRole: Role): Promise<UserProfile> {
  const { auth } = requireFirebase();

  let credential;
  try {
    credential = await signInWithPopup(auth, googleProvider());
  } catch (err) {
    const code = (err as { code?: string })?.code ?? "";
    if (REDIRECT_FALLBACK_CODES.has(code)) {
      // Navigates the whole tab to Google. Nothing after this line runs on
      // this page load; completeGoogleRedirect() picks the flow back up when
      // the browser comes back. pendingRole survives because sessionStorage
      // belongs to the tab, and the tab is the same one.
      await signInWithRedirect(auth, googleProvider());
      throw new GoogleSignInRedirecting();
    }
    throw translateGoogleError(err);
  }

  // The popup itself is deliberately NOT timed out — the user is choosing an
  // account in it, and there is no honest upper bound on how long that takes.
  // Everything after it is a network call, so everything after it is bounded.
  return ensureGoogleProfile(credential.user, pendingRole);
}

/**
 * Completes a redirect started by signInWithGoogle, if there is one.
 *
 * Returns null on an ordinary page load, so callers can run it
 * unconditionally on mount. It MUST run before a missing profile is treated
 * as "no account": a first-time Google user comes back from the redirect
 * holding a Firebase account with no users/{uid} document yet, and this call
 * is what writes it.
 */
export async function completeGoogleRedirect(pendingRole: Role): Promise<UserProfile | null> {
  if (!isFirebaseConfigured) return null;
  const { auth } = requireFirebase();

  let result;
  try {
    result = await getRedirectResult(auth);
  } catch (err) {
    throw translateGoogleError(err);
  }
  if (!result) return null;
  return ensureGoogleProfile(result.user, pendingRole);
}

/**
 * Firebase error codes → sentences a parent can act on.
 *
 * Every branch says what to DO next. "auth/operation-not-allowed" in
 * particular is a configuration problem, not a user problem, so it says so
 * rather than blaming the person holding the phone.
 */
function translateGoogleError(err: unknown): Error {
  const code = (err as { code?: string })?.code ?? "";
  // Logged before translation, because translation is lossy by design: the
  // sentence the user reads is chosen for what they can DO about it, and
  // several distinct Firebase codes deliberately collapse onto the same one.
  // The console keeps the code that tells us which actually happened.
  logAuthFailure("signing you in with Google", err);
  switch (code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
    case "auth/user-cancelled":
      return new GoogleSignInCancelled();
    case "auth/popup-blocked":
      return new Error("Your browser blocked the Google sign-in window. Allow pop-ups for this site, or continue with email.");
    case "auth/operation-not-allowed":
    case "auth/configuration-not-found":
      return new Error("Google sign-in isn't enabled for this school's EDVIA project yet. Please continue with email.");
    case "auth/account-exists-with-different-credential":
      return new Error("An EDVIA account already uses this email address. Sign in with your email and password instead.");
    case "auth/network-request-failed":
      // Firebase reports this for anything that stopped the request reaching
      // Google, which on a working connection is almost always something in
      // the browser rather than the network: an ad/tracker blocker or strict
      // privacy mode eating identitytoolkit.googleapis.com, or blocked
      // third-party storage for the sign-in popup's own domain. Naming those
      // is the difference between a fixable message and a dead end.
      return new Error(
        "EDVIA couldn't reach Google to finish signing in. If your connection is fine, this is usually an ad blocker, a privacy extension, or blocked third-party cookies — try again in a normal (non-incognito) window with extensions paused, or continue with email."
      );
    case "auth/unauthorized-domain": {
      const host = typeof window !== "undefined" ? window.location.hostname : "this domain";
      return new Error(
        "Google sign-in isn't authorised for " +
          host +
          " yet. Add it in Firebase Console > Authentication > Settings > Authorised domains, or continue with email."
      );
    }
    default:
      // The code goes in the sentence here and nowhere else. Every branch
      // above knows what went wrong and says it in plain words; this one does
      // not, so the only useful thing it can hand over is the identifier that
      // makes the failure searchable and reportable.
      return new Error(
        "Google sign-in couldn't be completed. Try again or use email." +
          (code ? ` (${code})` : "")
      );
  }
}
