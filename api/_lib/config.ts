// ==========================================================================
// Server-side AI configuration
// --------------------------------------------------------------------------
// These read plain (non-VITE_-prefixed) environment variables, which Vite
// never inlines into the client bundle — this file only ever runs in a
// Vercel serverless function (Node runtime), never in the browser.
// ==========================================================================

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    // Throwing here (not at module load in dev) keeps local `vite dev`
    // usable for pure-frontend work even before secrets are configured.
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const AI_CONFIG = {
  get geminiApiKey() {
    return required("GEMINI_API_KEY");
  },
  // Configurable model identifiers — never hardcode a specific model name
  // elsewhere in the codebase. Defaults point at the current generally
  // available Gemini reasoning + Live models; override via env per project.
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  geminiLiveModel: process.env.GEMINI_LIVE_MODEL || "gemini-2.5-flash-native-audio-preview-09-2025",
  maxToolCallsPerTurn: 4,
  maxHistoryMessages: 12, // compact conversation context, not unlimited history
};

export const FIREBASE_ADMIN_CONFIG = {
  get projectId() {
    return required("FIREBASE_PROJECT_ID");
  },
  get clientEmail() {
    return required("FIREBASE_CLIENT_EMAIL");
  },
  get privateKey() {
    return required("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");
  },
};
