import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { onAuthChange, signOutUser } from "@/services/firebase/auth.service";
import { isFirebaseConfigured, firebaseConfigDiagnostic, firebaseInitError } from "@/services/firebase/config";
import { StartupError, type StartupFailure } from "@/app/StartupScreen";
import type { UserProfile } from "@/types";

// ==========================================================================
// AuthContext — and the application bootstrap state machine
// --------------------------------------------------------------------------
// This provider owns the answer to "is EDVIA ready to render anything?", and
// it is deliberately a state machine with exactly four states:
//
//   INITIALIZING   — Firebase Auth has not yet reported whether a session
//                    exists. Nothing below this provider renders.
//   AUTHENTICATED  — a session exists AND its users/{uid} profile loaded.
//   UNAUTHENTICATED— no session. The app renders its public routes.
//   ERROR          — startup failed in a way the user must be told about.
//
// The single most important property is that INITIALIZING is BOUNDED. The
// production symptom this codebase was reported with — a deployed URL stuck
// on the loading robot — is what an unbounded initializing state looks like
// from the outside. Firebase's onAuthStateChanged is not contractually
// guaranteed to fire: a blocked identitytoolkit request, a corrupted
// IndexedDB persistence store, or a network that black-holes rather than
// refuses can all leave it silent forever, and the app then waits forever
// with no error to show. The watchdog below converts that into a screen.
//
// AUTHENTICATED vs UNAUTHENTICATED is intentionally NOT exposed as a
// separate flag: `user` already is that distinction, and two sources of
// truth for one fact is how they drift apart.
// ==========================================================================

export type BootstrapStatus = "initializing" | "authenticated" | "unauthenticated" | "error";

interface AuthContextValue {
  user: UserProfile | null;
  /** True only while the very first auth resolution is outstanding. */
  loading: boolean;
  status: BootstrapStatus;
  setUser: (u: UserProfile | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * How long the app may sit in INITIALIZING before it gives up and says so.
 *
 * This is not a performance budget. Firebase's own auth restoration is an
 * IndexedDB read plus, at most, one token refresh; on a genuinely slow 3G
 * connection that is a few seconds. Twelve seconds is the point past which
 * continuing to spin is no longer honest — and the screen it leads to has a
 * retry, so being wrong about a very slow network costs one tap.
 */
const BOOTSTRAP_TIMEOUT_MS = 12_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [status, setStatus] = useState<BootstrapStatus>("initializing");
  const [failure, setFailure] = useState<StartupFailure | null>(null);
  const [detail, setDetail] = useState<string | undefined>(undefined);
  // Bumping this re-runs the subscription effect — that is the retry.
  const [attempt, setAttempt] = useState(0);
  // Guards the watchdog against firing after the first real resolution.
  const settled = useRef(false);

  useEffect(() => {
    settled.current = false;

    if (!isFirebaseConfigured) {
      // A build with no VITE_FIREBASE_* keys cannot sign anyone in, and
      // pretending otherwise means every screen fails separately with its
      // own confusing message. Say it once, at the top.
      setStatus("error");
      setFailure("unconfigured");
      setDetail(firebaseConfigDiagnostic());
      return;
    }

    const startupError = firebaseInitError();
    if (startupError) {
      // The keys were present but the SDK refused to start — a malformed
      // apiKey, or a browser with both IndexedDB and memory init blocked.
      setStatus("error");
      setFailure("init-failed");
      setDetail(startupError.stack ?? startupError.message);
      return;
    }

    const watchdog = setTimeout(() => {
      if (settled.current) return;
      settled.current = true;
      console.error(
        `[EDVIA bootstrap] auth state never resolved within ${BOOTSTRAP_TIMEOUT_MS}ms — showing the startup error instead of continuing to spin.`
      );
      setStatus("error");
      setFailure("timeout");
      setDetail("Firebase Auth did not report a session state. Check that identitytoolkit.googleapis.com is reachable and that this domain is listed under Firebase Console › Authentication › Settings › Authorised domains.");
    }, BOOTSTRAP_TIMEOUT_MS);

    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = onAuthChange((profile) => {
        settled.current = true;
        clearTimeout(watchdog);
        setUser(profile);
        setFailure(null);
        setStatus(profile ? "authenticated" : "unauthenticated");
      });
    } catch (err) {
      // requireFirebase() throws here if initialization failed despite the
      // keys being present (a malformed apiKey, a blocked IndexedDB).
      settled.current = true;
      clearTimeout(watchdog);
      console.error("[EDVIA bootstrap] could not subscribe to auth state", err);
      setStatus("error");
      setFailure("init-failed");
      setDetail(err instanceof Error ? (err.stack ?? err.message) : String(err));
    }

    return () => {
      clearTimeout(watchdog);
      unsubscribe?.();
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setStatus("initializing");
    setFailure(null);
    setDetail(undefined);
    setAttempt((n) => n + 1);
  }, []);

  // Keeps `status` honest when a screen sets the user directly after a
  // sign-in, before the auth listener has echoed it back.
  const applyUser = useCallback((next: UserProfile | null) => {
    setUser(next);
    setStatus(next ? "authenticated" : "unauthenticated");
  }, []);

  const logout = useCallback(async () => {
    await signOutUser();
    applyUser(null);
  }, [applyUser]);

  if (status === "error" && failure) {
    // Rendering the error INSTEAD of the children is deliberate. A tree that
    // renders under a broken auth provider produces a second wave of
    // confusing per-screen failures on top of the real one.
    return <StartupError failure={failure} detail={detail} onRetry={retry} />;
  }

  return (
    <AuthContext.Provider
      value={{ user, loading: status === "initializing", status, setUser: applyUser, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
