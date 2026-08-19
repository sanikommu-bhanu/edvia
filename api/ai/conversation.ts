import type { VercelRequest, VercelResponse } from "@vercel/node";
import { resolveUserContext } from "../_lib/userContext.js";
import { getOwnedMemory, clearMemory, initMemory } from "../_lib/memory.js";
import { AuthError, ForbiddenError } from "../_lib/firebaseAdmin.js";
import { writeAuditLog } from "../_lib/audit.js";

// DELETE /api/ai/conversation?conversationId=... — clears memory + history for a "New conversation".
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await resolveUserContext(req.headers.authorization as string | undefined);
    const conversationId = String(req.query.conversationId ?? "");
    if (!conversationId) {
      res.status(400).json({ error: "conversationId is required." });
      return;
    }

    if (req.method === "DELETE") {
      // Ownership check before touching anything: without this, any
      // authenticated user could pass a stranger's conversationId here and
      // wipe their conversation memory + message history. A missing
      // conversationId (never used yet) is fine to "clear" — it's a no-op
      // that just seeds fresh memory for the caller.
      await getOwnedMemory(conversationId, ctx.uid);
      await clearMemory(conversationId);
      await initMemory(conversationId, ctx.uid, ctx.role, ctx.language);
      await writeAuditLog(ctx, { action: "conversation:cleared", result: "success" });
      res.status(200).json({ cleared: true });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: err.message });
      return;
    }
    if (err instanceof ForbiddenError) {
      res.status(403).json({ error: err.message });
      return;
    }
    console.error("conversation handler error", err);
    res.status(500).json({ error: "Something went wrong." });
  }
}
