// ==========================================================================
// Gemini client — server-only
// ==========================================================================
import { GoogleGenAI } from "@google/genai";
import { AI_CONFIG } from "./config";

let client: GoogleGenAI | null = null;

export function geminiClient(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: AI_CONFIG.geminiApiKey });
  return client;
}
