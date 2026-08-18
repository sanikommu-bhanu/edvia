// ==========================================================================
// Shared tool execution path
// --------------------------------------------------------------------------
// Both the text orchestrator (orchestrator.ts) and the voice tool-call
// endpoint (api/ai/tool-call.ts) funnel through this single function, so
// voice can never bypass the authorization/validation/audit path that text
// goes through — exactly one security boundary, used by every channel.
// ==========================================================================
import { TOOL_BY_NAME } from "./index";
import { writeAuditLog } from "../audit";
import type { TrustedUserContext } from "../userContext";

export interface ExecuteToolResult {
  ok: boolean;
  result?: unknown;
  error?: string;
  requiresConfirmation?: true;
}

export async function authorizeAndExecuteTool(
  ctx: TrustedUserContext,
  toolName: string,
  rawArgs: unknown,
  confirmed = false
): Promise<ExecuteToolResult> {
  const tool = TOOL_BY_NAME[toolName];
  if (!tool) return { ok: false, error: "Unknown tool." };
  if (!tool.allowedRoles.includes(ctx.role)) {
    await writeAuditLog(ctx, { action: tool.auditAction, toolName, result: "denied", reason: "role_not_allowed" });
    return { ok: false, error: "You're not able to do that." };
  }

  const parsed = tool.inputSchema.safeParse(rawArgs ?? {});
  if (!parsed.success) return { ok: false, error: "Missing or invalid details for that request." };

  if (tool.requiresConfirmation && !confirmed) {
    return { ok: false, requiresConfirmation: true };
  }

  try {
    const authz = await tool.authorize(ctx, parsed.data);
    if (!authz.allowed) {
      await writeAuditLog(ctx, { action: tool.auditAction, toolName, args: parsed.data as Record<string, unknown>, result: "denied", reason: authz.reason });
      return { ok: false, error: authz.reason ?? "Not authorized." };
    }
    const result = await tool.handler(ctx, parsed.data);
    await writeAuditLog(ctx, { action: tool.auditAction, toolName, args: parsed.data as Record<string, unknown>, result: "success" });
    return { ok: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await writeAuditLog(ctx, { action: tool.auditAction, toolName, args: parsed.data as Record<string, unknown>, result: "error", reason: message });
    return { ok: false, error: message };
  }
}
