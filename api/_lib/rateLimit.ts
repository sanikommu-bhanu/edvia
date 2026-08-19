// ==========================================================================
// Per-user rate limiting
// --------------------------------------------------------------------------
// Without this, one authenticated account can loop /api/ai/chat and burn the
// school's entire Gemini quota — the audit's SEC-05. Firebase Auth throttles
// sign-in attempts; nothing throttled what a signed-in user could then do.
//
// WHY FIRESTORE AND NOT AN IN-MEMORY COUNTER
// Vercel functions are stateless and horizontally scaled: a module-level Map
// is per-instance, so the effective limit would be (limit × instance count)
// and would reset on every cold start. That is not a rate limiter, it is a
// suggestion. Firestore is already a dependency, is shared across instances,
// and supports the atomic increment this needs — so no new service and no
// new package is introduced for it.
//
// FIXED WINDOW, NOT SLIDING
// A fixed window costs exactly one document write per request. A sliding
// window needs a read of recent timestamps per request, which for abuse
// protection is not worth the extra cost. The known trade-off is that a
// caller can burst up to 2× the limit across a window boundary; the limits
// below are set with that in mind.
//
// FAILS OPEN, DELIBERATELY
// If Firestore is unavailable the request is ALLOWED. Rate limiting is abuse
// protection, not authorization — no security decision depends on it, and
// making every AI request fail because a counter write failed would turn a
// cost control into an outage. Authorization always fails closed; this does
// not. That asymmetry is intentional.
// ==========================================================================
import { adminDb } from "./firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";

export interface RateLimitRule {
  /** Requests permitted per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

/**
 * Per-endpoint budgets. Sized so a real person never notices them and a
 * script hits them immediately.
 */
export const RATE_LIMITS = {
  /** Conversation turns. A fast typist manages perhaps 6/min. */
  ai_chat: { limit: 30, windowSeconds: 60 },
  /** Voice sessions: each mints a billed Live credential. */
  voice_session: { limit: 12, windowSeconds: 300 },
  /** Document understanding: the most expensive call per request. */
  document: { limit: 15, windowSeconds: 3600 },
  /** Single tool relays during a voice session — chattier by nature. */
  tool_call: { limit: 120, windowSeconds: 60 },
  /** Invite redemption: brute-forcing codes must be slow. */
  redeem_invite: { limit: 8, windowSeconds: 600 },
  /**
   * Creating a school. A real administrator does this once, ever. The only
   * reason the limit is 3 rather than 1 is that a failed attempt (a name
   * clash, a dropped connection) must not lock someone out of onboarding.
   */
  create_school: { limit: 3, windowSeconds: 3600 },
  /** Issuing invites and creating classes: staff actions, done in bursts. */
  create_invite: { limit: 40, windowSeconds: 3600 },
  create_class: { limit: 30, windowSeconds: 3600 },
  /**
   * Previewing an invite is UNAUTHENTICATED — it is what renders "You're
   * invited to join Robo School" before sign-in — so it is the one endpoint
   * an attacker can hit without an account. Budgeted per client IP rather
   * than per uid, and kept tight: a person opens one QR link, not sixty.
   */
  preview_invite: { limit: 20, windowSeconds: 600 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

export interface RateLimitResult {
  allowed: boolean;
  /** Requests left in the current window, floored at 0. */
  remaining: number;
  /** Seconds until the window resets — surfaced as Retry-After. */
  retryAfterSeconds: number;
}

/**
 * Records one request against `uid`'s budget for `bucket`.
 *
 * @returns whether the caller may proceed
 */
export async function consumeRateLimit(
  uid: string,
  bucket: RateLimitBucket,
): Promise<RateLimitResult> {
  const rule = RATE_LIMITS[bucket];
  const now = Date.now();
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((windowStart + windowMs - now) / 1000),
  );

  // The window start is part of the id, so an expired window is simply a
  // different document — no cleanup job, no read-modify-write race.
  const docId = `${uid}_${bucket}_${windowStart}`;

  try {
    const ref = adminDb().collection("rateLimits").doc(docId);
    const snap = await ref.get();
    const used =
      (snap.exists ? (snap.data()?.count as number | undefined) : 0) ?? 0;

    if (used >= rule.limit) {
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }

    await ref.set(
      {
        count: FieldValue.increment(1),
        uid,
        bucket,
        // Lets a TTL policy reap old counters without a scheduled job.
        expiresAt: new Date(windowStart + windowMs * 2).toISOString(),
      },
      { merge: true },
    );

    return {
      allowed: true,
      remaining: Math.max(0, rule.limit - used - 1),
      retryAfterSeconds,
    };
  } catch (err) {
    // See the FAILS OPEN note above.
    console.error(`Rate limit check failed for ${bucket}`, err);
    return { allowed: true, remaining: rule.limit, retryAfterSeconds };
  }
}

/** Friendly, non-technical message. Never mentions counters or windows. */
export function rateLimitMessage(bucket: RateLimitBucket): string {
  switch (bucket) {
    case "ai_chat":
    case "tool_call":
      return "You're sending messages faster than EDVIA can keep up with. Give it a few seconds and try again.";
    case "voice_session":
      return "That's a lot of voice sessions in a short time. Please wait a moment before starting another.";
    case "document":
      return "You've scanned a lot of documents recently. Please try again a little later.";
    case "redeem_invite":
    case "preview_invite":
      return "Too many invite code attempts. Please wait a few minutes and try again.";
    case "create_school":
      return "That's several schools in a short time. If the last attempt failed, wait a moment and try once more.";
    case "create_invite":
      return "You've created a lot of invitations just now. Please wait a little before creating more.";
    case "create_class":
      return "You've created a lot of classes just now. Please wait a little before creating more.";
  }
}
