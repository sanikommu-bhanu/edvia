// ==========================================================================
// Shared client for calling EDVIA's own authenticated server routes
// (api/*.ts) — used by services for the small set of writes that
// firestore.rules deliberately keep server-only (attendance, support
// requests). Every call attaches the caller's real Firebase ID token.
// ==========================================================================
import { getIdToken } from "@/services/firebase/auth.service";

export async function apiPost<TResponse>(path: string, body: unknown): Promise<TResponse> {
  const token = await getIdToken();
  if (!token) {
    throw new Error("You need to be signed in to a connected school account to do that.");
  }
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? "Something went wrong. Please try again.");
  }
  return data as TResponse;
}
