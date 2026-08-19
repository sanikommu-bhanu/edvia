// ==========================================================================
// POST /api/ai/chat
// --------------------------------------------------------------------------
// The one entry point for text conversation. Streams Server-Sent Events by
// default so the UI can show real activity ("Checking attendance records…")
// and partial text as they happen, rather than a spinner that guesses.
//
// Event types on the wire mirror OrchestratorEvent:
//   activity  — real work in flight; drives the avatar state
//   delta     — incremental answer text
//   reset     — discard streamed text (the model switched to a tool call)
//   final     — the complete result; exactly one per request
//   error     — transport-level failure
//
// Pass ?stream=0 for a single JSON response (used by the evaluation suite
// and any client that doesn't want SSE).
// ==========================================================================
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { resolveUserContext } from "../_lib/userContext";
import {
  streamConversationTurn,
  handleConversationTurn,
} from "../_lib/orchestrator";
import { getSchoolName } from "../_lib/school/people";
import { AuthError, ForbiddenError } from "../_lib/firebaseAdmin";
import { MAX_USER_MESSAGE_CHARS } from "../_lib/security";
import { consumeRateLimit, rateLimitMessage } from "../_lib/rateLimit";

const BodySchema = z.object({
  conversationId: z.string().min(1).max(128),
  message: z.string().min(1).max(MAX_USER_MESSAGE_CHARS),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let ctx;
  let body;
  try {
    ctx = await resolveUserContext(
      req.headers.authorization as string | undefined,
    );

    // Abuse protection — see api/_lib/rateLimit.ts. Checked after
    // authentication so limits are per real account, not per IP.
    const limit = await consumeRateLimit(ctx.uid, "ai_chat");
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfterSeconds));
      res.status(429).json({ error: rateLimitMessage("ai_chat") });
      return;
    }
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body." });
      return;
    }
    body = parsed.data;
  } catch (err) {
    respondWithError(res, err);
    return;
  }

  const wantsStream = String(req.query.stream ?? "1") !== "0";

  try {
    const schoolName = await getSchoolName(ctx.schoolId);

    if (!wantsStream) {
      const result = await handleConversationTurn(
        ctx,
        body.conversationId,
        body.message,
        schoolName,
      );
      res.status(200).json(result);
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Stops proxies (and Vercel's edge) from buffering the stream.
      "X-Accel-Buffering": "no",
    });

    for await (const event of streamConversationTurn(
      ctx,
      body.conversationId,
      body.message,
      schoolName,
    )) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    if (res.headersSent) {
      // The stream already started; report inside it rather than with a
      // status code the client will never see.
      const message =
        err instanceof ForbiddenError || err instanceof AuthError
          ? err.message
          : "EDVIA ran into a problem answering that. Please try again.";
      res.write(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }
    respondWithError(res, err);
  }
}

function respondWithError(res: VercelResponse, err: unknown) {
  if (err instanceof AuthError) {
    res.status(401).json({ error: err.message });
    return;
  }
  if (err instanceof ForbiddenError) {
    res.status(403).json({ error: err.message });
    return;
  }
  console.error("AI chat handler error", err);
  res
    .status(500)
    .json({
      error: "EDVIA ran into a problem answering that. Please try again.",
    });
}
