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
   * Override per environment to move to a newer family without a code change.
   *
   * Verified against ai.google.dev/gemini-api/docs/models and
   * .../docs/deprecations on 2026-08-19:
   *
   *   geminiModel     gemini-2.5-flash is GA with NO announced shutdown date.
   *                   Newer families exist (3.x flash), but a stable GA model
   *                   with a generous free tier is the right default for a
   *                   school deployment — newer is not a reason on its own.
   *
   *   geminiLiveModel the previous default here, gemini-live-2.5-flash-preview,
   *                   was SHUT DOWN on 2025-12-09. Anyone deploying without an
   *                   explicit override would have had voice fail outright.
   *                   gemini-3.1-flash-live-preview is Google's own named
   *                   replacement and supports Live audio + function calling
   *                   (sequential, which is exactly how EDVIA relays one tool
   *                   call per round). gemini-2.5-flash-native-audio-preview-12-2025
   *                   is the supported alternative if async tool behaviour is
   *                   ever wanted.
   *
   * Both Live options are Preview and WILL be rotated by Google. That is
   * precisely why this is an env var and not a literal in the call site.
   */
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  geminiLiveModel: process.env.GEMINI_LIVE_MODEL || "gemini-3.1-flash-live-preview",
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
