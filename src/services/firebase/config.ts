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

export const firebaseApp = isFirebaseConfigured
  ? getApps().length
    ? getApps()[0]
    : initializeApp(firebaseConfig)
  : null;

export const auth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null;

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
export const db: Firestore | null = firebaseApp
  ? initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      experimentalAutoDetectLongPolling: true,
    })
  : null;

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
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

/** Throws a clear, actionable error from any service call made before Firebase is configured. */
export function requireFirebase(): { auth: Auth; db: Firestore } {
  if (!auth || !db) {
    throw new Error(
      "EDVIA isn't connected to a school account yet. Add your Firebase project's VITE_FIREBASE_* keys to .env.local to enable sign-in and real data."
    );
  }
  return { auth, db };
}
