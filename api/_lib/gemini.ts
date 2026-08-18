// ==========================================================================
// Gemini client — server-only
// --------------------------------------------------------------------------
// GEMINI_API_KEY is read here and nowhere else, and this module is only
// ever imported by code under api/. It is never bundled into the browser:
// the client talks to EDVIA's own routes, which hold the key.
// ==========================================================================
import { GoogleGenAI } from "@google/genai";
import { AI_CONFIG, isGeminiConfigured as configured } from "./config";

let client: GoogleGenAI | null = null;

export function geminiClient(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: AI_CONFIG.geminiApiKey });
  return client;
}

/**
 * Separate client pinned to the v1alpha API surface, which is where the
 * Gemini Developer API exposes ephemeral auth tokens. Kept apart from the
 * default client so ordinary generateContent traffic stays on the stable
 * surface.
 */
let alphaClient: GoogleGenAI | null = null;

export function geminiAlphaClient(): GoogleGenAI {
  if (!alphaClient) {
    alphaClient = new GoogleGenAI({
      apiKey: AI_CONFIG.geminiApiKey,
      httpOptions: { apiVersion: "v1alpha" },
    });
  }
  return alphaClient;
}

export const isGeminiConfigured = configured;
