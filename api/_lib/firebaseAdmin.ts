// ==========================================================================
// Firebase Admin — server-only
// --------------------------------------------------------------------------
// This is the ONLY place identity is trusted. Every AI request must present
// a Firebase ID token; we verify it here and derive role/school/child
// linkage from Firestore — never from anything the client claims directly.
// ==========================================================================
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { FIREBASE_ADMIN_CONFIG } from "./config";

let app: App | null = null;

function getAdminApp(): App {
  if (app) return app;
  app = getApps().length
    ? getApps()[0]
    : initializeApp({
        credential: cert({
          projectId: FIREBASE_ADMIN_CONFIG.projectId,
          clientEmail: FIREBASE_ADMIN_CONFIG.clientEmail,
          privateKey: FIREBASE_ADMIN_CONFIG.privateKey,
        }),
      });
  return app;
}

export function adminDb(): Firestore {
  return getFirestore(getAdminApp());
}

/**
 * Verifies the bearer ID token from an incoming request and returns the
 * decoded, trustworthy claims. Throws on any invalid/expired/missing token.
 */
export async function verifyIdToken(authorizationHeader: string | undefined) {
  const token = authorizationHeader?.startsWith("Bearer ") ? authorizationHeader.slice(7) : null;
  if (!token) throw new AuthError("Missing bearer token.");
  try {
    return await getAuth(getAdminApp()).verifyIdToken(token);
  } catch {
    throw new AuthError("Invalid or expired session. Please sign in again.");
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Thrown when an authenticated caller references a resource (e.g. a
 * conversationId) that exists but belongs to a different user. Distinct from
 * AuthError (401 — "who are you?") — this is a 403 ("I know who you are,
 * but that's not yours").
 */
export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}
