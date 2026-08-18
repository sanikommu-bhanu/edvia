// ==========================================================================
// POST /api/ai/voice-session
// --------------------------------------------------------------------------
// Issues a short-lived Gemini Live credential so the browser can hold a
// low-latency audio WebSocket directly with Gemini WITHOUT ever holding
// GEMINI_API_KEY.
//
// The important part is what gets LOCKED INTO the token:
//   * the model
//   * the system instruction for this user's real role and language
//   * the tool declarations this role is allowed to use
//
// Because those are fixed in the ephemeral token's liveConnectConstraints,
// a tampered browser cannot reconnect with a different system instruction
// or a wider tool set. And even if it could, the tools it can name are
// still only *requests*: every Live function call is relayed to
// /api/ai/tool-call, which re-derives the caller's identity from their
// Firebase ID token and runs the same authorization as text chat.
//
// The token is single-use and expires in minutes, so a leaked one is worth
// almost nothing.
// ==========================================================================
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { resolveUserContext } from "../_lib/userContext";
import { AuthError } from "../_lib/firebaseAdmin";
import { AI_CONFIG, isGeminiConfigured } from "../_lib/config";
import { geminiAlphaClient } from "../_lib/gemini";
import { buildVoiceSystemInstruction } from "../_lib/persona";
import { TOOL_BY_NAME, GEMINI_TOOL_DECLARATIONS } from "../_lib/tools";
import { roleAllowed } from "../_lib/tools/registry";
import { getSchoolName } from "../_lib/school/people";
import { writeAuditLog } from "../_lib/audit";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!isGeminiConfigured()) {
    res.status(503).json({ error: "Voice isn't available right now. You can continue with chat." });
    return;
  }

  try {
    const ctx = await resolveUserContext(req.headers.authorization as string | undefined);
    const schoolName = await getSchoolName(ctx.schoolId);

    const systemInstruction = buildVoiceSystemInstruction({
      role: ctx.role,
      language: ctx.language,
      schoolName,
      today: new Date().toISOString().slice(0, 10),
    });

    // Same role filter as text chat — voice is not a looser channel.
    const functionDeclarations = GEMINI_TOOL_DECLARATIONS.filter((d) =>
      roleAllowed(ctx, TOOL_BY_NAME[d.name as string].allowedRoles)
    );

    const expireTime = new Date(Date.now() + AI_CONFIG.voiceTokenTtlSeconds * 1000).toISOString();

    const token = await geminiAlphaClient().authTokens.create({
      config: {
        uses: 1,
        expireTime,
        // Locks the whole session shape into the token itself.
        liveConnectConstraints: {
          model: AI_CONFIG.geminiLiveModel,
          config: {
            responseModalities: ["AUDIO" as never],
            systemInstruction,
            tools: functionDeclarations.length ? [{ functionDeclarations }] : undefined,
            // Transcripts of both sides, so the on-screen caption and the
            // saved conversation reflect what was actually said.
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        },
        lockAdditionalFields: [],
      },
    });

    await writeAuditLog(ctx, { action: "voice:session_issued", result: "success" });
    res.status(200).json({
      token: token.name,
      model: AI_CONFIG.geminiLiveModel,
      expiresInSeconds: AI_CONFIG.voiceTokenTtlSeconds,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: err.message });
      return;
    }
    console.error("voice-session handler error", err);
    res.status(503).json({ error: "Voice isn't available right now. You can continue with chat." });
  }
}
