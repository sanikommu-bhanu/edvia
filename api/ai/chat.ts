import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { resolveUserContext } from "../_lib/userContext";
import { handleConversationTurn, ensureSchoolName } from "../_lib/orchestrator";
import { AuthError, ForbiddenError } from "../_lib/firebaseAdmin";

const BodySchema = z.object({
  conversationId: z.string().min(1).max(128),
  message: z.string().min(1).max(4000),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const ctx = await resolveUserContext(req.headers.authorization as string | undefined);
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body." });
      return;
    }

    const schoolName = await ensureSchoolName(ctx.schoolId);
    const result = await handleConversationTurn(ctx, parsed.data.conversationId, parsed.data.message, schoolName);

    res.status(200).json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: err.message });
      return;
    }
    if (err instanceof ForbiddenError) {
      res.status(403).json({ error: err.message });
      return;
    }
    console.error("AI chat handler error", err);
    res.status(500).json({ error: "EDVIA ran into a problem answering that. Please try again." });
  }
}
