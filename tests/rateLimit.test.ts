// ==========================================================================
// Rate limiting (SEC-05)
// --------------------------------------------------------------------------
// Runs against the real consumeRateLimit with the in-memory Firestore
// double underneath, so these assert the shipped counter logic.
// ==========================================================================
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { consumeRateLimit, RATE_LIMITS, rateLimitMessage } from "../api/_lib/rateLimit";
import { freezeClock, unfreezeClock, resetFixtures } from "./support/harness";

freezeClock();
afterAll(unfreezeClock);
beforeEach(resetFixtures);

describe("per-user budgets", () => {
  it("allows requests up to the limit and refuses the next one", async () => {
    const { limit } = RATE_LIMITS.ai_chat;
    for (let i = 0; i < limit; i += 1) {
      const result = await consumeRateLimit("uid_a", "ai_chat");
      expect(result.allowed, `request ${i + 1} of ${limit}`).toBe(true);
    }
    const overflow = await consumeRateLimit("uid_a", "ai_chat");
    expect(overflow.allowed).toBe(false);
    expect(overflow.remaining).toBe(0);
    expect(overflow.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("counts down remaining accurately", async () => {
    const first = await consumeRateLimit("uid_b", "ai_chat");
    expect(first.remaining).toBe(RATE_LIMITS.ai_chat.limit - 1);
    const second = await consumeRateLimit("uid_b", "ai_chat");
    expect(second.remaining).toBe(RATE_LIMITS.ai_chat.limit - 2);
  });

  it("isolates users — one account exhausting its budget never blocks another", async () => {
    for (let i = 0; i < RATE_LIMITS.ai_chat.limit; i += 1) {
      await consumeRateLimit("uid_noisy", "ai_chat");
    }
    expect((await consumeRateLimit("uid_noisy", "ai_chat")).allowed).toBe(false);
    expect((await consumeRateLimit("uid_quiet", "ai_chat")).allowed).toBe(true);
  });

  it("isolates buckets — burning chat quota leaves voice untouched", async () => {
    for (let i = 0; i < RATE_LIMITS.ai_chat.limit; i += 1) {
      await consumeRateLimit("uid_c", "ai_chat");
    }
    expect((await consumeRateLimit("uid_c", "ai_chat")).allowed).toBe(false);
    expect((await consumeRateLimit("uid_c", "voice_session")).allowed).toBe(true);
  });

  it("gives the expensive endpoints tighter budgets than chat", async () => {
    // A document scan costs far more than a chat turn, so it must not share
    // chat's allowance.
    expect(RATE_LIMITS.document.limit).toBeLessThan(RATE_LIMITS.ai_chat.limit);
    expect(RATE_LIMITS.voice_session.limit).toBeLessThan(RATE_LIMITS.ai_chat.limit);
  });

  it("throttles invite-code guessing hard enough to matter", async () => {
    // Brute-forcing a code must be impractical: single digits per 10 minutes.
    expect(RATE_LIMITS.redeem_invite.limit).toBeLessThanOrEqual(10);
    expect(RATE_LIMITS.redeem_invite.windowSeconds).toBeGreaterThanOrEqual(300);
  });
});

describe("user-facing messages", () => {
  it("never leaks counters, windows or internals", () => {
    for (const bucket of Object.keys(RATE_LIMITS) as (keyof typeof RATE_LIMITS)[]) {
      const message = rateLimitMessage(bucket);
      expect(message.length).toBeGreaterThan(10);
      expect(message).not.toMatch(/\d+\s*(req|\/|per)|window|bucket|firestore|limit=/i);
    }
  });
});
