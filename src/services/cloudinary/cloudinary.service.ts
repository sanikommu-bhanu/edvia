// ==========================================================================
// Cloudinary service
// --------------------------------------------------------------------------
// Thin abstraction around Cloudinary's unsigned upload API. Used for
// resource uploads, profile photos, and (in Prompt 2) scanned documents.
// Requires VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET.
// ==========================================================================

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined;

export const isCloudinaryConfigured = Boolean(CLOUD_NAME && UPLOAD_PRESET);

export interface UploadResult {
  url: string;
  publicId: string;
  bytes: number;
  format: string;
}

export async function uploadFile(file: File, folder?: string): Promise<UploadResult> {
  if (!isCloudinaryConfigured) {
    throw new Error("Cloudinary is not configured. Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET.");
  }
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", UPLOAD_PRESET as string);
  // Namespacing uploads under schools/{schoolId}/users/{uid}/ lets the server
  // verify ownership of a fileUrl later (see api/ai/document.ts) instead of
  // trusting any URL under the shared cloud name.
  if (folder) form.append("folder", folder);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error("Upload failed");
  const data = await res.json();
  return { url: data.secure_url, publicId: data.public_id, bytes: data.bytes, format: data.format };
}

/** Convenience helper for document-understanding uploads — keeps the folder
 * convention in one place so callers don't have to know the exact path shape
 * the server checks in api/ai/document.ts. */
export function documentUploadFolder(schoolId: string, uid: string): string {
  return `schools/${schoolId}/users/${uid}`;
}
