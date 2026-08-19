// ==========================================================================
// The shape every onboarding handler returns
// --------------------------------------------------------------------------
// These handlers are invoked by api/onboarding/actions.ts rather than by
// Vercel directly, so they must not touch VercelResponse: a handler that
// writes to the response can't be composed, can't be unit-tested without a
// response double, and can't have its output inspected before it is sent.
// They return a status and a body; exactly one place turns that into HTTP.
// ==========================================================================

export interface ActionResult {
  status: number;
  body: Record<string, unknown>;
}

export function ok(body: Record<string, unknown>, status = 200): ActionResult {
  return { status, body };
}

/**
 * A refusal the caller is meant to read.
 *
 * Thrown rather than returned so a handler can bail out of a nested check —
 * inside a transaction, inside a per-kind authorization branch — without
 * every intermediate step having to forward a result upwards.
 */
export class ActionError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ActionError";
  }
}
