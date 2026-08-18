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
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, type Firestore } from "firebase/firestore";

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
export const db: Firestore | null = firebaseApp ? getFirestore(firebaseApp) : null;

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
