import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { resolveUserContext } from "../_lib/userContext";
import { AuthError } from "../_lib/firebaseAdmin";
import { geminiClient } from "../_lib/gemini";
import { AI_CONFIG } from "../_lib/config";
import { writeAuditLog } from "../_lib/audit";
import { fenceUntrustedContent } from "../_lib/security";

const BodySchema = z.object({
  // Cloudinary secure_url of an already-uploaded image/PDF (see cloudinary.service.ts client-side).
  fileUrl: z.string().url(),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  question: z.string().min(1).max(1000).default("Explain what this document says in simple terms."),
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
    const ctx = await resolveUserContext(req.headers.authorization as string | undefined);
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "A valid fileUrl and mimeType are required." });
      return;
    }
    const { fileUrl, mimeType, question } = parsed.data;

    // Only allow fetching from the school's configured Cloudinary account —
    // never an arbitrary URL supplied by the client.
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    if (cloudName && !fileUrl.includes(`res.cloudinary.com/${cloudName}/`)) {
      res.status(400).json({ error: "That file isn't from a recognized source." });
      return;
    }

    // Defense-in-depth ownership check: the client uploads document-scan
    // files under schools/{schoolId}/users/{uid}/ (see
    // cloudinary.service.ts#documentUploadFolder). Cloudinary public_ids are
    // random by default so this isn't the primary defense against
    // enumeration, but it stops one authenticated user from pointing this
    // endpoint at a *known* fileUrl belonging to someone else — e.g. a link
    // shared in a notice, screenshot, or leaked another way.
    const ownershipPrefix = `/schools/${encodeURIComponent(ctx.schoolId)}/users/${encodeURIComponent(ctx.uid)}/`;
    if (fileUrl.includes("/schools/") && !fileUrl.includes(ownershipPrefix)) {
      res.status(403).json({ error: "You don't have access to that file." });
      return;
    }

    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) {
      res.status(422).json({ error: "Couldn't read that document. Please try uploading it again." });
      return;
    }
    const arrayBuffer = await fileRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    const ai = geminiClient();
    const response = await ai.models.generateContent({
      model: AI_CONFIG.geminiModel,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: fenceUntrustedContent("USER QUESTION ABOUT THE DOCUMENT ABOVE", question) },
          ],
        },
      ],
      config: {
        systemInstruction:
          "You are EDVIA helping a school user understand an uploaded document (homework, a notice, or study material). Explain clearly and simply, matching the reading level implied by the question. If the document is unreadable or unrelated to school, say so honestly rather than guessing at its contents.",
      },
    });

    await writeAuditLog(ctx, { action: "read:document_understanding", result: "success" });
    res.status(200).json({ message: response.text ?? "I couldn't produce an explanation for this document." });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: err.message });
      return;
    }
    console.error("document handler error", err);
    res.status(500).json({ error: "I couldn't process that document. Please try again." });
  }
}
