// ==========================================================================
// Tool Registry — types + AuthorizationService
// --------------------------------------------------------------------------
// The LLM can only ever request a tool call by name + arguments. It cannot
// touch Firestore directly. Every tool defined here is checked against the
// caller's TRUSTED context (from userContext.ts, never client-supplied)
// before it runs. This file is the actual security boundary the spec
// requires — the model merely suggests; this authorizes.
// ==========================================================================
import type { ZodType } from "zod";
import type { Role } from "../../../src/types";
import type { TrustedUserContext } from "../userContext";

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

export class ToolAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolAuthorizationError";
  }
}

/** Straightforward "does this role appear in the allow-list" check, shared by every tool. */
export function roleAllowed(ctx: TrustedUserContext, allowedRoles: Role[]): boolean {
  return allowedRoles.includes(ctx.role);
}
