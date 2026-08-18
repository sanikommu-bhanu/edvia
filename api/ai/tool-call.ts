// ==========================================================================
// POST /api/ai/tool-call
// --------------------------------------------------------------------------
// The voice channel's tool relay. When a Gemini Live session emits a
// function call, the browser forwards it here; this route authorizes and
// executes it and hands back a result the browser feeds into the Live
// session as the tool response. The browser never touches Firestore and
// never executes a tool itself, so voice runs through exactly the same
// authorization boundary as text chat (api/_lib/tools/execute.ts).
//
// Confirmation state is held SERVER-side, in the same conversationMemory
// document text chat uses. That matters: if the pending action lived only
// in the browser, a tampered client could set confirmed:true and skip the
// confirmation step. Here, `confirmed: true` is only honoured when the
// server itself previously stored that exact tool + arguments as pending
// for this user's conversation.
// ==========================================================================
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { resolveUserContext } from "../_lib/userContext";
import { AuthError, ForbiddenError } from "../_lib/firebaseAdmin";
import { authorizeAndExecuteTool } from "../_lib/tools/execute";
import { getOwnedMemory, initMemory, updateMemory } from "../_lib/memory";

const BodySchema = z.object({
  conversationId: z.string().min(1).max(128),
  toolName: z.string().min(1).max(64),
  args: z.record(z.unknown()).default({}),
  confirmed: z.boolean().default(false),
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
      res.status(400).json({ error: "Invalid tool call." });
      return;
    }
    const { conversationId, toolName, args, confirmed } = parsed.data;

    let memory = await getOwnedMemory(conversationId, ctx.uid);
    if (!memory) memory = await initMemory(conversationId, ctx.uid, ctx.role, ctx.language);

    // Memory can only narrow scope — see readTools.resolveSubjectStudent.
    const turnCtx = { ...ctx, conversationStudentId: memory.currentStudentId };

    if (confirmed) {
      const pending = memory.pendingConfirmation;
      const matches =
        pending && pending.toolName === toolName && stableStringify(pending.args) === stableStringify(args);
      if (!matches) {
        res.status(409).json({
          ok: false,
          kind: "needs_confirmation",
          error: "That action hasn't been confirmed yet. Ask the user first.",
        });
        return;
      }
      await updateMemory(conversationId, { pendingConfirmation: null });
      const result = await authorizeAndExecuteTool(turnCtx, toolName, args, true);
      res.status(200).json(result);
      return;
    }

    const result = await authorizeAndExecuteTool(turnCtx, toolName, args, false);

    if (result.kind === "needs_confirmation" && result.preview) {
      // Record what the user is about to be asked, so the follow-up
      // confirmation can be matched against it.
      await updateMemory(conversationId, {
        pendingConfirmation: {
          toolName,
          args,
          summary: result.preview.summary,
          details: result.preview.details,
          noOp: result.preview.noOp,
        },
      });
    } else if (result.ok) {
      const subject = result.result as { studentId?: string; studentName?: string } | undefined;
      if (subject?.studentId) {
        await updateMemory(conversationId, {
          currentStudentId: subject.studentId,
          currentStudentName: subject.studentName,
        });
      }
    }

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
    console.error("tool-call handler error", err);
    res.status(500).json({ ok: false, kind: "error", error: "Tool execution failed." });
  }
}

/** Key-order-independent comparison, so argument ordering can't defeat the match. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}
