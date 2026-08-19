// ==========================================================================
// Join service — the client half of the QR / code onboarding flow
// --------------------------------------------------------------------------
// Two calls, and the split between them is the whole UX:
//
//   previewInvite  runs WITHOUT a signed-in user, so the join screen can say
//                  "You've been invited to join Robo School as a Teacher"
//                  before asking anyone to authenticate. Asking someone to
//                  sign in to find out what they are signing in for is how
//                  invitations get abandoned.
//
//   redeemInvite   runs WITH a signed-in user and is the only call that
//                  changes anything.
//
// Neither ever sends a role, a school or a class. The token is the whole
// request; the server decides what it means. See api/invites/redeem.ts.
// ==========================================================================
import { apiPost } from "@/services/apiClient";
import type { InvitePreview, InviteKind, Role } from "@/types";

/** The link a QR encodes. Absolute, because it is scanned off paper. */
export function joinUrlFor(secret: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/join/${secret}`;
}

export interface InviteCredential {
  /** From a scanned QR / deep link. */
  token?: string;
  /** Typed by hand off a noticeboard. */
  code?: string;
}

export class InviteRejectedError extends Error {
  constructor(
    message: string,
    /** true when the invitation was real but is no longer usable. */
    readonly gone: boolean
  ) {
    super(message);
    this.name = "InviteRejectedError";
  }
}

/**
 * Describes an invitation without consuming it. Unauthenticated by design,
 * so this deliberately does NOT go through apiClient (which requires a
 * Firebase ID token and would reject an anonymous visitor before the request
 * was ever made).
 */
export async function previewInvite(credential: InviteCredential): Promise<InvitePreview> {
  let res: Response;
  try {
    res = await fetch("/api/invites/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credential),
    });
  } catch {
    throw new Error("We couldn't reach EDVIA to check that invitation. Check your connection and try again.");
  }

  const data = (await res.json().catch(() => ({}))) as Partial<InvitePreview> & { error?: string };
  if (!res.ok) {
    throw new InviteRejectedError(
      data.error ?? "That invitation couldn't be checked.",
      // 410 Gone — the invitation existed and is expired, revoked or used up.
      res.status === 410
    );
  }
  return data as InvitePreview;
}

export interface RedeemResult {
  success: true;
  schoolId: string;
  role: Role;
  kind: InviteKind;
  /** True when this account had already redeemed this exact invitation. */
  alreadyRedeemed: boolean;
}

export async function redeemInvite(credential: InviteCredential): Promise<RedeemResult> {
  return apiPost<RedeemResult>("/api/invites/redeem", credential);
}

// --------------------------------------------------------------------------
// Surviving the OAuth round trip
// --------------------------------------------------------------------------
// If Google sign-in falls back to a full-page redirect, the browser leaves
// EDVIA entirely and comes back to a fresh page load. The invite token lives
// in the URL, so the URL is what has to be restored — losing it would drop
// someone at a generic dashboard with no idea their invitation went
// unredeemed, which is the single most likely way this whole flow fails in
// practice.
//
// sessionStorage rather than localStorage: it is scoped to the tab, so a
// stale invite cannot leak into an unrelated session tomorrow, and it
// survives a redirect because the tab is the same tab.
// --------------------------------------------------------------------------
const PENDING_KEY = "edvia.pendingInvite";

export function rememberPendingInvite(credential: InviteCredential): void {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(credential));
  } catch {
    // Private browsing with storage disabled. The popup path still works;
    // only the redirect fallback loses its place, and the user can rescan.
  }
}

export function readPendingInvite(): InviteCredential | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as InviteCredential;
    return parsed.token || parsed.code ? parsed : null;
  } catch {
    return null;
  }
}

export function clearPendingInvite(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* nothing to clear */
  }
}
