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
// document text chat uses. `confirmed: true` is only honoured when the
// server itself previously stored that EXACT tool + arguments as pending
// for THIS user's conversation, and only inside a short expiry window. The
// offer is consumed before the tool runs, so it cannot be replayed.
//
// What this proves, stated precisely: the model cannot act unilaterally,
// arguments cannot be swapped between the preview and the execution, an
// offer cannot be replayed or reused, and one user's offer cannot be
// redeemed by another. What it CANNOT prove is that a human physically
// spoke the word "yes" — an authenticated user controls their own client
// and could issue both calls directly. That is an acceptable boundary,
// because everything reachable this way is something this caller is already
// authorized to do; the gate exists to stop the LLM from acting without
// asking, not to defend against the account's owner. See docs/SECURITY.md.
// ==========================================================================
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { resolveUserContext } from "../_lib/userContext.js";
import { AuthError, ForbiddenError } from "../_lib/firebaseAdmin.js";
import { authorizeAndExecuteTool } from "../_lib/tools/execute.js";
import { getOwnedMemory, initMemory, updateMemory } from "../_lib/memory.js";
import { consumeRateLimit, rateLimitMessage } from "../_lib/rateLimit.js";

/**
 * How long a spoken confirmation offer stays valid. Long enough for a person
 * to hear the question and answer it; short enough that a preview cannot go
 * stale against the record it described.
 */
const CONFIRMATION_TTL_MS = 2 * 60 * 1000;

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
    const ctx = await resolveUserContext(
      req.headers.authorization as string | undefined,
    );

    // Abuse protection — see api/_lib/rateLimit.ts. Checked after
    // authentication so limits are per real account, not per IP.
    const limit = await consumeRateLimit(ctx.uid, "tool_call");
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfterSeconds));
      res.status(429).json({ error: rateLimitMessage("tool_call") });
      return;
    }
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid tool call." });
      return;
    }
    const { conversationId, toolName, args, confirmed } = parsed.data;

    let memory = await getOwnedMemory(conversationId, ctx.uid);
    if (!memory)
      memory = await initMemory(
        conversationId,
        ctx.uid,
        ctx.role,
        ctx.language,
      );

    // Memory can only narrow scope — see readTools.resolveSubjectStudent.
    const turnCtx = { ...ctx, conversationStudentId: memory.currentStudentId };

    if (confirmed) {
      const pending = memory.pendingConfirmation;
      // Every component must match: same tool, byte-identical arguments (so
      // a student name or date cannot be swapped after the user saw the
      // preview), and still inside the offer window.
      const matches =
        pending &&
        pending.toolName === toolName &&
        stableStringify(pending.args) === stableStringify(args);
      const expired = Boolean(
        pending?.expiresAt && Date.parse(pending.expiresAt) < Date.now(),
      );

      if (!matches || expired) {
        // Consume a stale offer so it cannot linger and be satisfied later.
        if (pending && expired)
          await updateMemory(conversationId, { pendingConfirmation: null });
        res.status(409).json({
          ok: false,
          kind: "needs_confirmation",
          error: expired
            ? "That confirmation has expired. Ask the user again before doing anything."
            : "That action hasn't been confirmed yet. Ask the user first.",
        });
        return;
      }
      // Single-use: consumed BEFORE execution, so a duplicate or replayed
      // request finds nothing pending and is refused above.
      await updateMemory(conversationId, { pendingConfirmation: null });
      const result = await authorizeAndExecuteTool(
        turnCtx,
        toolName,
        args,
        true,
      );
      res.status(200).json(result);
      return;
    }

    const result = await authorizeAndExecuteTool(
      turnCtx,
      toolName,
      args,
      false,
    );

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
          expiresAt: new Date(Date.now() + CONFIRMATION_TTL_MS).toISOString(),
        },
      });
    } else if (result.ok) {
      const subject = result.result as
        { studentId?: string; studentName?: string } | undefined;
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
    res
      .status(500)
      .json({ ok: false, kind: "error", error: "Tool execution failed." });
  }
}

/** Key-order-independent comparison, so argument ordering can't defeat the match. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}
