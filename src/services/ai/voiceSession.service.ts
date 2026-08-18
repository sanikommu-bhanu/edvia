// ==========================================================================
// Voice session service — client-side
// --------------------------------------------------------------------------
// Fetches a short-lived Gemini Live session credential from EDVIA's backend
// (api/ai/voice-session.ts). The long-lived GEMINI_API_KEY never reaches
// this file or the browser at all.
// ==========================================================================
import { getIdToken } from "@/services/firebase/auth.service";

export interface VoiceSessionToken {
  token: string;
  model: string;
  expiresInSeconds: number;
}

export async function requestVoiceSession(): Promise<VoiceSessionToken | null> {
  const idToken = await getIdToken();
  if (!idToken) return null; // mock-auth mode — voice mode falls back to "not available" in the UI

  const res = await fetch("/api/ai/voice-session", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) throw new Error("Couldn't start a voice session.");
  return res.json();
}
