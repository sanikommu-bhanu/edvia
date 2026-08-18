import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { resolveUserContext } from "../_lib/userContext";
import { AuthError } from "../_lib/firebaseAdmin";
import { authorizeAndExecuteTool } from "../_lib/tools/execute";

const BodySchema = z.object({
  toolName: z.string(),
  args: z.record(z.unknown()).default({}),
  confirmed: z.boolean().default(false),
});

/**
 * POST /api/ai/tool-call
 * Called by the browser's voice hook whenever a Gemini Live session emits a
 * function call. This is the ONLY place a Live-session tool request is
 * actually authorized and executed — the browser relays the call here,
 * gets back a result, and feeds that result back into the Live session as
 * the tool response. Voice never touches Firestore or executes a tool on
 * its own, so it can't bypass the same checks text goes through.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    const ctx = await resolveUserContext(req.headers.authorization as string | undefined);
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid tool call." });
      return;
    }
    const result = await authorizeAndExecuteTool(ctx, parsed.data.toolName, parsed.data.args, parsed.data.confirmed);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: err.message });
      return;
    }
    console.error("tool-call handler error", err);
    res.status(500).json({ error: "Tool execution failed." });
  }
}
