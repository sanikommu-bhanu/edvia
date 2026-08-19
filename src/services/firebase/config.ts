// ==========================================================================
// Firebase configuration — client SDK
// --------------------------------------------------------------------------
// Reads standard VITE_FIREBASE_* env vars and initializes real Firebase
// Auth + Firestore instances. The whole app (auth.service.ts and every
// *.service.ts under src/services) reads and writes through these same
// instances, so the UI and EDVIA's AI backend (api/_lib/*, which uses the
// Admin SDK against the SAME Firestore project) always see the same data.
//
// isFirebaseConfigured is still exported so screens can show a clear setup
// message instead of crashing if someone runs the app without env vars set
// — but there is no silent mock-data fallback anymore. Either the app is
// wired to a real project, or it tells you it isn't.
// ==========================================================================
import { initializeApp, type FirebaseOptions, getApps } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  browserLocalPersistence,
  setPersistence,
  type Auth,
} from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
  type Firestore,
} from "firebase/firestore";

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

// --------------------------------------------------------------------------
// Configuration diagnostics
// --------------------------------------------------------------------------
// Which variables are MISSING is safe to report and is the only fact that
// makes an unconfigured deployment fixable. Which variables are PRESENT
// must never carry their values — an apiKey is not a secret, but authDomain,
// projectId and appId together identify the school's project, and a startup
// screen is the wrong place to publish them. So: names only, absent only,
// and StartupScreen renders this in development builds only.
// --------------------------------------------------------------------------
const REQUIRED_CLIENT_VARS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

/** Lists the client env vars this build was compiled without. */
export function missingFirebaseVars(): string[] {
  const values: Record<(typeof REQUIRED_CLIENT_VARS)[number], unknown> = {
    VITE_FIREBASE_API_KEY: firebaseConfig.apiKey,
    VITE_FIREBASE_AUTH_DOMAIN: firebaseConfig.authDomain,
    VITE_FIREBASE_PROJECT_ID: firebaseConfig.projectId,
    VITE_FIREBASE_APP_ID: firebaseConfig.appId,
  };
  return REQUIRED_CLIENT_VARS.filter((name) => !values[name]);
}

export function firebaseConfigDiagnostic(): string {
  const missing = missingFirebaseVars();
  if (missing.length === 0) {
    return "Firebase client config looks complete. If sign-in still fails, check the Firebase Console authorised domains for this host.";
  }
  return [
    "Missing client environment variables at build time:",
    ...missing.map((name) => `  • ${name}`),
    "",
    "These are inlined by Vite when the bundle is BUILT, not read at runtime.",
    "Set them in Vercel → Project → Settings → Environment Variables for the",
    "Production, Preview and Development environments, then REDEPLOY — changing",
    "an env var alone does not rebuild the client bundle.",
  ].join("\n");
}

// --------------------------------------------------------------------------
// Initialization must not be able to take the whole bundle down
// --------------------------------------------------------------------------
// This module is imported, transitively, by main.tsx. A throw at module
// scope here is therefore not "Firebase is unavailable" — it is a blank
// page, because the module graph never finishes evaluating and React never
// mounts. There is no error boundary that can catch that.
//
// So every initialization call is wrapped, and the failure is recorded as a
// value that AuthContext can read and turn into a screen. The app still
// cannot sign anyone in, but it can SAY so.
// --------------------------------------------------------------------------
let initError: Error | null = null;

function initialize(): { app: ReturnType<typeof initializeApp> | null; auth: Auth | null } {
  if (!isFirebaseConfigured) return { app: null, auth: null };
  try {
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    return { app, auth: getAuth(app) };
  } catch (err) {
    initError = err instanceof Error ? err : new Error(String(err));
    console.error("[EDVIA] Firebase initialization failed", err);
    return { app: null, auth: null };
  }
}

const initialized = initialize();

export const firebaseApp = initialized.app;
export const auth: Auth | null = initialized.auth;

/** The error Firebase initialization threw, if it threw. */
export function firebaseInitError(): Error | null {
  return initError;
}

// --------------------------------------------------------------------------
// Firestore transport + cache
// --------------------------------------------------------------------------
// Two settings here exist purely because of how sign-in FELT on real
// networks, and both are worth keeping:
//
//   localCache — the users/{uid} profile doc is read on sign-in, again by
//     the auth-state listener, and again on every reload. Without a cache
//     each of those is a cold network round trip, so a returning user waits
//     on the network to be told something the device already knew. With the
//     persistent cache the repeat reads are served from IndexedDB and the
//     server copy refreshes behind them.
//
//   experimentalAutoDetectLongPolling — Firestore's default transport is a
//     WebChannel stream, which school/campus networks and corporate proxies
//     frequently stall rather than refuse. A stalled stream is the worst
//     failure mode there is: no error, just a spinner. Auto-detect probes
//     the connection and falls back to long polling instead of hanging.
//
// initializeFirestore (not getFirestore) is required to pass either one,
// and it must run before any other Firestore call — hence module scope.
// --------------------------------------------------------------------------
// The persistent cache is a nice-to-have, not a requirement: it needs
// IndexedDB, which is unavailable in some private-browsing modes and in
// several in-app webviews (a join link opened from WhatsApp, for instance).
// Losing the cache there is a slower first read; losing the whole app is
// not acceptable, so the fallback is memory-only Firestore rather than none.
export const db: Firestore | null = (() => {
  if (!firebaseApp) return null;
  try {
    return initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      experimentalAutoDetectLongPolling: true,
    });
  } catch (err) {
    console.warn("[EDVIA] persistent Firestore cache unavailable; using memory only.", err);
    try {
      return initializeFirestore(firebaseApp, { experimentalAutoDetectLongPolling: true });
    } catch (fatal) {
      initError = fatal instanceof Error ? fatal : new Error(String(fatal));
      console.error("[EDVIA] Firestore initialization failed", fatal);
      return null;
    }
  }
})();

// Keep the session across reloads and tab closes. This is Firebase's default,
// but stating it means a future SDK default change can't silently sign every
// user out on refresh.
if (auth) {
  void setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn("Couldn't set auth persistence; falling back to the SDK default.", err);
  });
}

// Optional local development against the Firebase Emulator Suite. Only
// engages when explicitly requested, so a stray env var can never point a
// deployed build at a local emulator.
if (isFirebaseConfigured && import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true" && auth && db) {
  try {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  } catch (err) {
    console.warn("[EDVIA] couldn't attach to the Firebase emulators.", err);
  }
}

/** Throws a clear, actionable error from any service call made before Firebase is configured. */
export function requireFirebase(): { auth: Auth; db: Firestore } {
  if (!auth || !db) {
    if (initError) {
      throw new Error(
        "EDVIA couldn't start its connection to your school's account service. Reload the page, and if it keeps happening the browser console has the details."
      );
    }
    throw new Error(
      "EDVIA isn't connected to a school account yet. Add your Firebase project's VITE_FIREBASE_* keys to .env.local to enable sign-in and real data."
    );
  }
  return { auth, db };
}
