// ==========================================================================
// Server-side configuration
// --------------------------------------------------------------------------
// These read plain (non-VITE_-prefixed) environment variables, which Vite
// never inlines into the client bundle. Everything in this file runs only
// inside a Vercel serverless function (Node runtime), never in a browser.
//
// Values are read through getters, not at module load, so a missing secret
// produces a clear per-request error on the one route that needs it rather
// than crashing every route (and so `vite dev` stays usable for pure
// front-end work before any secret is configured).
// ==========================================================================

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const AI_CONFIG = {
  get geminiApiKey() {
    return required("GEMINI_API_KEY");
  },
  /**
   * Model ids are configuration, never hardcoded elsewhere in the codebase.
   * Defaults are generally-available models; override per environment to
   * move to a newer family without a code change.
   */
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  geminiLiveModel: process.env.GEMINI_LIVE_MODEL || "gemini-live-2.5-flash-preview",
  /** Low but not zero: school answers should be consistent, not robotic. */
  temperature: Number(process.env.GEMINI_TEMPERATURE ?? 0.4),
  /** A turn may chain at most this many tool calls before it must answer. */
  maxToolCallsPerTurn: 4,
  /** Compact conversation window — see memory.ts for why this is bounded. */
  maxHistoryMessages: 12,
  /** Ephemeral Live-session token lifetime. */
  voiceTokenTtlSeconds: 300,
};

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export const FIREBASE_ADMIN_CONFIG = {
  get projectId() {
    return required("FIREBASE_PROJECT_ID");
  },
  get clientEmail() {
    return required("FIREBASE_CLIENT_EMAIL");
  },
  get privateKey() {
    // Vercel stores multi-line secrets with literal \n sequences.
    return required("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");
  },
};

export function isFirebaseAdminConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY
  );
}
