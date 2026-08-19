// ==========================================================================
// Tool Registry — types + the authorization contract
// --------------------------------------------------------------------------
// The LLM can only ever request a tool call by name + arguments. It cannot
// touch Firestore, and it cannot reach the School Service layer directly.
// Every tool defined in this package is checked against the caller's
// TRUSTED context (from userContext.ts, derived from a verified Firebase ID
// token — never from anything the client or the model claims) before it
// runs. This file defines the shape of that boundary; execute.ts enforces it.
// ==========================================================================
import type { ZodType } from "zod";
import type { Role } from "../../../src/types/index.js";
import type { TrustedUserContext } from "../userContext.js";

export interface ToolDefinition<Input = unknown, Output = unknown> {
  name: string;
  description: string;
  inputSchema: ZodType<Input>;
  allowedRoles: Role[];
  /** Extra per-call authorization beyond role (ownership, school boundary, class membership). */
  authorize: (ctx: TrustedUserContext, input: Input) => Promise<{ allowed: boolean; reason?: string }>;
  handler: (ctx: TrustedUserContext, input: Input) => Promise<Output>;
  /** Write/side-effecting tools must be confirmed by the user before execution. */
  requiresConfirmation: boolean;
  auditAction: string;
}

/**
 * The caller asked for something outside their permissions. The message is
 * written to be shown to the user verbatim, so it must never disclose
 * whether the out-of-scope resource actually exists.
 */
export class ToolAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolAuthorizationError";
  }
}

/**
 * The request was legitimate but under-specified — several of the caller's
 * OWN records matched. The orchestrator turns this into a clarifying
 * question instead of an error, and never guesses a candidate.
 */
export class AmbiguousEntityError extends Error {
  readonly candidates: string[];
  constructor(candidates: string[]) {
    super(candidates.length ? `Ambiguous: ${candidates.join(", ")}` : "Ambiguous request");
    this.name = "AmbiguousEntityError";
    this.candidates = candidates;
  }
}

/**
 * Authorized, unambiguous — but the school simply has no such record. This
 * is the case where the assistant MUST say it couldn't find anything rather
 * than producing a plausible number (see Part 10, grounded responses).
 */
export class NoDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoDataError";
  }
}

/** Straightforward "does this role appear in the allow-list" check, shared by every tool. */
export function roleAllowed(ctx: TrustedUserContext, allowedRoles: Role[]): boolean {
  return allowedRoles.includes(ctx.role);
}
