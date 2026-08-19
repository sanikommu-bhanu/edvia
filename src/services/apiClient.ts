// ==========================================================================
// Shared client for calling EDVIA's own authenticated server routes
// (api/*.ts) — used by services for the small set of writes that
// firestore.rules deliberately keep server-only (attendance, support
// requests). Every call attaches the caller's real Firebase ID token.
// ==========================================================================
import { getIdToken } from "@/services/firebase/auth.service";

async function authorizedFetch(path: string, init: RequestInit): Promise<unknown> {
  const token = await getIdToken();
  if (!token) {
    throw new Error("You need to be signed in to a connected school account to do that.");
  }

  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    });
  } catch {
    // Network-level failure: distinguish it from a server rejection so the
    // UI can say "check your connection" rather than blaming the school.
    throw new Error("We couldn't reach EDVIA. Check your connection and try again.");
  }

  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "Something went wrong. Please try again.");
  }
  return data;
}

export async function apiPost<TResponse>(path: string, body: unknown): Promise<TResponse> {
  return (await authorizedFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })) as TResponse;
}

export async function apiGet<TResponse>(path: string): Promise<TResponse> {
  return (await authorizedFetch(path, { method: "GET" })) as TResponse;
}
