// ==========================================================================
// The single tool execution path
// --------------------------------------------------------------------------
// Text chat (orchestrator.ts) and the Gemini Live voice relay
// (api/ai/tool-call.ts) both funnel through this function, so voice can
// never bypass the checks text goes through. Exactly one security
// boundary, used by every channel.
//
// Order of operations is deliberate and should not be rearranged:
//   1. tool exists
//   2. role allow-list           (coarse)
//   3. Zod validation            (no arbitrary/extra arguments reach a handler)
//   4. confirmation gate         (writes need an explicit prior "yes")
//   5. per-call authorize()      (ownership / school boundary / class scope)
//   6. handler                   (already inside every gate above)
//   7. audit                     (allowed AND denied, both recorded)
// ==========================================================================
import { TOOL_BY_NAME } from "./index.js";
import { writeAuditLog } from "../audit.js";
import { AmbiguousEntityError, NoDataError, ToolAuthorizationError } from "./registry.js";
import { isActionTool, type ActionPreview } from "./actionTools.js";
import type { TrustedUserContext } from "../userContext.js";

export type ToolFailureKind =
  | "unknown_tool"
  | "role_denied"
  | "invalid_arguments"
  | "needs_confirmation"
  | "not_authorized"
  | "ambiguous"
  | "no_data"
  | "error";

export interface ExecuteToolResult {
  ok: boolean;
  result?: unknown;
  /** User-safe message. Never contains internal ids, tool internals or stack detail. */
  error?: string;
  kind?: ToolFailureKind;
  /** Present on "ambiguous": the caller's own matching records, for a clarifying question. */
  candidates?: string[];
  /** Present on "needs_confirmation": what would change if the user says yes. */
  preview?: ActionPreview;
}

export async function authorizeAndExecuteTool(
  ctx: TrustedUserContext,
  toolName: string,
  rawArgs: unknown,
  confirmed = false
): Promise<ExecuteToolResult> {
  const tool = TOOL_BY_NAME[toolName];
  if (!tool) return { ok: false, kind: "unknown_tool", error: "I don't have a way to do that." };

  // 2. Role allow-list. Checked before validation so a role probe can't be
  //    used to learn a tool's argument shape.
  if (!tool.allowedRoles.includes(ctx.role)) {
    await writeAuditLog(ctx, {
      action: tool.auditAction,
      toolName,
      result: "denied",
      reason: "role_not_allowed",
    });
    return { ok: false, kind: "role_denied", error: "That isn't something I can help with on this account." };
  }

  // 3. Strict validation — Zod strips unknown keys and rejects bad types, so
  //    a handler never sees an argument the schema didn't declare.
  const parsed = tool.inputSchema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    await writeAuditLog(ctx, {
      action: tool.auditAction,
      toolName,
      result: "denied",
      reason: "invalid_arguments",
    });
    return {
      ok: false,
      kind: "invalid_arguments",
      error: "I need a bit more detail before I can do that.",
    };
  }
  const args = parsed.data as Record<string, unknown>;

  try {
    // 4. Confirmation gate for anything that writes or contacts a person.
    //    preview() runs authorize-equivalent lookups itself, so an
    //    unauthorized target is rejected here rather than after a "yes".
    if (tool.requiresConfirmation && !confirmed) {
      const authzFirst = await tool.authorize(ctx, parsed.data as never);
      if (!authzFirst.allowed) {
        await writeAuditLog(ctx, {
          action: tool.auditAction,
          toolName,
          args,
          result: "denied",
          reason: authzFirst.reason,
        });
        return { ok: false, kind: "not_authorized", error: authzFirst.reason ?? "You're not able to do that." };
      }
      const preview = isActionTool(tool)
        ? await tool.preview(ctx, parsed.data as never)
        : { summary: "Should I go ahead with that?", details: {} };
      return { ok: false, kind: "needs_confirmation", preview, error: preview.summary };
    }

    // 5. Per-call authorization.
    const authz = await tool.authorize(ctx, parsed.data as never);
    if (!authz.allowed) {
      await writeAuditLog(ctx, {
        action: tool.auditAction,
        toolName,
        args,
        result: "denied",
        reason: authz.reason,
      });
      return { ok: false, kind: "not_authorized", error: authz.reason ?? "You're not able to do that." };
    }

    // 6. Execute.
    const result = await tool.handler(ctx, parsed.data as never);

    // 7. Audit. Write tools record before/after so the log answers
    //    "what actually changed", not just "someone called a tool".
    await writeAuditLog(ctx, {
      action: tool.auditAction,
      toolName,
      args,
      result: "success",
      details: changeDetails(toolName, result),
    });
    return { ok: true, result };
  } catch (err) {
    return handleToolError(ctx, tool.auditAction, toolName, args, err);
  }
}

async function handleToolError(
  ctx: TrustedUserContext,
  auditAction: string,
  toolName: string,
  args: Record<string, unknown>,
  err: unknown
): Promise<ExecuteToolResult> {
  if (err instanceof AmbiguousEntityError) {
    // Not a failure — the caller's request was under-specified. Logged as
    // denied only so the trail shows the tool didn't return data.
    await writeAuditLog(ctx, { action: auditAction, toolName, args, result: "denied", reason: "ambiguous" });
    return { ok: false, kind: "ambiguous", candidates: err.candidates, error: "I need to know which one you mean." };
  }
  if (err instanceof ToolAuthorizationError) {
    await writeAuditLog(ctx, { action: auditAction, toolName, args, result: "denied", reason: "not_authorized" });
    return { ok: false, kind: "not_authorized", error: err.message };
  }
  if (err instanceof NoDataError) {
    await writeAuditLog(ctx, { action: auditAction, toolName, args, result: "error", reason: "no_data" });
    return { ok: false, kind: "no_data", error: err.message };
  }

  // Unexpected failure (Firestore unavailable, bad index, bug). The real
  // message goes to the server log; the user gets a plain, honest line.
  console.error(`Tool ${toolName} failed`, err);
  await writeAuditLog(ctx, {
    action: auditAction,
    toolName,
    args,
    result: "error",
    reason: err instanceof Error ? err.name : "unknown",
  });
  return {
    ok: false,
    kind: "error",
    error: "I couldn't retrieve that from the school's records right now. Please try again in a moment.",
  };
}

/** Extracts the before/after fields worth keeping in the audit trail. */
function changeDetails(toolName: string, result: unknown): Record<string, unknown> | undefined {
  if (toolName !== "markAttendance") return undefined;
  const r = result as Record<string, unknown>;
  return {
    studentId: r.studentId,
    date: r.date,
    oldStatus: r.previousStatus ?? null,
    newStatus: r.status,
    changed: r.changed,
  };
}
