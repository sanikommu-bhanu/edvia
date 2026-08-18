import type { VercelRequest, VercelResponse } from "@vercel/node";
import { resolveUserContext } from "../_lib/userContext";
import { AuthError } from "../_lib/firebaseAdmin";
import { AI_CONFIG } from "../_lib/config";
import { geminiClient } from "../_lib/gemini";
import { buildSystemInstruction } from "../_lib/persona";
import { ensureSchoolName } from "../_lib/orchestrator";
import { writeAuditLog } from "../_lib/audit";

/**
 * POST /api/ai/voice-session
 * Issues a short-lived Gemini Live session credential scoped to this user's
 * role/language/system-instruction, so the browser can open a direct Live
 * connection WITHOUT ever holding GEMINI_API_KEY. The long-lived key stays
 * server-side; only an ephemeral token (per the Live API's session-token
 * mechanism) reaches the client, and it expires quickly.
 *
 * NOTE: the exact ephemeral-token method name/shape should be re-verified
 * against Google's current Gemini Live API docs at integration time — the
 * @google/genai SDK's ephemeral-token surface has moved during Live API's
 * preview lifecycle. This handler isolates that call to one place so a
 * signature change only touches this file.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    const ctx = await resolveUserContext(req.headers.authorization as string | undefined);
    const schoolName = await ensureSchoolName(ctx.schoolId);
    const systemInstruction = buildSystemInstruction(ctx.role, ctx.language, schoolName);

    const ai = geminiClient();
    // See note above re: verifying this call against current Live API docs.
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        liveConnectConstraints: {
          model: AI_CONFIG.geminiLiveModel,
          config: { systemInstruction },
        },
      },
    });

    await writeAuditLog(ctx, { action: "voice:session_issued", result: "success" });
    res.status(200).json({ token: token.name, model: AI_CONFIG.geminiLiveModel, expiresInSeconds: 300 });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: err.message });
      return;
    }
    console.error("voice-session handler error", err);
    res.status(500).json({ error: "Couldn't start a voice session right now. Please try text chat instead." });
  }
}
