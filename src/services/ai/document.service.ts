// ==========================================================================
// Document understanding — client side
// --------------------------------------------------------------------------
// Two steps, in this order:
//   1. Upload the captured image to Cloudinary, namespaced under
//      schools/{schoolId}/users/{uid}/ so the server can verify the caller
//      owns the file rather than trusting any URL under the cloud name.
//   2. Ask EDVIA's own backend (api/ai/document.ts) to read it. Gemini is
//      never called from the browser and the file is never re-uploaded to
//      the model provider's persistent storage.
// ==========================================================================
import { getIdToken } from "@/services/firebase/auth.service";
import { uploadFile, documentUploadFolder, isCloudinaryConfigured } from "@/services/cloudinary/cloudinary.service";

export interface DocumentExplanation {
  message: string;
  fileUrl: string;
}

export class DocumentUnavailableError extends Error {}

export async function explainDocument(
  file: File,
  context: { schoolId: string; uid: string },
  question?: string
): Promise<DocumentExplanation> {
  if (!isCloudinaryConfigured) {
    throw new DocumentUnavailableError(
      "Document scanning isn't set up for this school yet. You can still ask EDVIA about it in chat."
    );
  }

  const token = await getIdToken();
  if (!token) {
    throw new DocumentUnavailableError("Please sign in again to scan a document.");
  }

  let upload;
  try {
    upload = await uploadFile(file, documentUploadFolder(context.schoolId, context.uid));
  } catch {
    throw new DocumentUnavailableError("I couldn't upload that image. Check your connection and try again.");
  }

  const res = await fetch("/api/ai/document", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      fileUrl: upload.url,
      mimeType: file.type === "image/png" ? "image/png" : "image/jpeg",
      ...(question ? { question } : {}),
    }),
  });

  const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) {
    throw new DocumentUnavailableError(data.error ?? "I couldn't read that document. Please try again.");
  }
  return { message: data.message ?? "I couldn't produce an explanation for this document.", fileUrl: upload.url };
}

/** Renders the current video frame to a JPEG File ready for upload. */
export async function captureFrame(video: HTMLVideoElement): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't capture the photo on this device.");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new Error("Couldn't capture the photo on this device.");
  return new File([blob], `scan_${Date.now()}.jpg`, { type: "image/jpeg" });
}
