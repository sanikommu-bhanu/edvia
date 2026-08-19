import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { resolveUserContext } from "../_lib/userContext.js";
import { AuthError } from "../_lib/firebaseAdmin.js";
import { geminiClient } from "../_lib/gemini.js";
import { AI_CONFIG } from "../_lib/config.js";
import { consumeRateLimit, rateLimitMessage } from "../_lib/rateLimit.js";
import { writeAuditLog } from "../_lib/audit.js";
import { fenceUntrustedContent } from "../_lib/security.js";
import {
  checkDocumentSource,
  documentSourceMessage,
  documentSourceStatus,
  MAX_DOCUMENT_BYTES,
  FETCH_TIMEOUT_MS,
} from "../_lib/documentSource.js";

const BodySchema = z.object({
  // Cloudinary secure_url of an already-uploaded image/PDF (see cloudinary.service.ts client-side).
  fileUrl: z.string().url(),
  mimeType: z.enum([
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
  ]),
  question: z
    .string()
    .min(1)
    .max(1000)
    .default("Explain what this document says in simple terms."),
});

/**
 * POST /api/ai/document
 * Fetches an already-uploaded (Cloudinary-hosted) document/image server-side
 * and asks Gemini to explain/summarize it. The file itself is never routed
 * through the AI service's persistent storage — only this request's context.
 */
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
    const limit = await consumeRateLimit(ctx.uid, "document");
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfterSeconds));
      res.status(429).json({ error: rateLimitMessage("document") });
      return;
    }
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "A valid fileUrl and mimeType are required." });
      return;
    }
    const { fileUrl, mimeType, question } = parsed.data;

    // Fail-closed source validation: HTTPS, host exactly res.cloudinary.com,
    // our cloud account, and inside THIS caller's own folder. See
    // api/_lib/documentSource.ts for why each rule exists.
    const source = checkDocumentSource(
      fileUrl,
      ctx.schoolId,
      ctx.uid,
      process.env.CLOUDINARY_CLOUD_NAME,
    );
    if (!source.ok) {
      await writeAuditLog(ctx, {
        action: "read:document_understanding",
        result: "denied",
        reason: source.reason,
      });
      res
        .status(documentSourceStatus(source.reason))
        .json({ error: documentSourceMessage(source.reason) });
      return;
    }

    // Bounded fetch: a hung or oversized origin must not hold a serverless
    // invocation open or exhaust its memory.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let fileRes: Response;
    try {
      fileRes = await fetch(source.url, {
        signal: controller.signal,
        redirect: "error",
      });
    } catch {
      clearTimeout(timeout);
      res
        .status(504)
        .json({
          error: "That document took too long to load. Please try again.",
        });
      return;
    }
    clearTimeout(timeout);

    if (!fileRes.ok) {
      res
        .status(422)
        .json({
          error: "Couldn't read that document. Please try uploading it again.",
        });
      return;
    }

    // Two size checks. The header is a fast reject; the byte length is the
    // one that actually holds, because Content-Length can be absent or lie.
    const declared = Number(fileRes.headers.get("content-length") ?? 0);
    if (declared > MAX_DOCUMENT_BYTES) {
      res
        .status(413)
        .json({
          error: "That file is too large. Please upload one under 10 MB.",
        });
      return;
    }

    // The origin's own content type must match what the client declared,
    // so a client cannot label a PDF as an image to reach a different
    // Gemini code path.
    const servedType = (fileRes.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (servedType && servedType !== mimeType) {
      res
        .status(415)
        .json({ error: "That file isn't the type it claims to be." });
      return;
    }

    const arrayBuffer = await fileRes.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_DOCUMENT_BYTES) {
      res
        .status(413)
        .json({
          error: "That file is too large. Please upload one under 10 MB.",
        });
      return;
    }
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    const ai = geminiClient();
    const response = await ai.models.generateContent({
      model: AI_CONFIG.geminiModel,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: base64 } },
            {
              text: fenceUntrustedContent(
                "USER QUESTION ABOUT THE DOCUMENT ABOVE",
                question,
              ),
            },
          ],
        },
      ],
      config: {
        systemInstruction:
          "You are EDVIA helping a school user understand an uploaded document (homework, a notice, or study material). Explain clearly and simply, matching the reading level implied by the question. If the document is unreadable or unrelated to school, say so honestly rather than guessing at its contents.",
      },
    });

    await writeAuditLog(ctx, {
      action: "read:document_understanding",
      result: "success",
    });
    res
      .status(200)
      .json({
        message:
          response.text ??
          "I couldn't produce an explanation for this document.",
      });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: err.message });
      return;
    }
    console.error("document handler error", err);
    res
      .status(500)
      .json({ error: "I couldn't process that document. Please try again." });
  }
}
