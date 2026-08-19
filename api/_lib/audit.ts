// ==========================================================================
// AuditLogService — every tool decision, allowed or denied, is recorded.
// --------------------------------------------------------------------------
// What this is FOR: answering "who changed Rahul's attendance, from what,
// to what, and when" — and equally, "did anyone try to read data they
// weren't entitled to". Denied attempts are as important as successful
// ones, so both are written.
//
// What never goes in: free-text message bodies, tokens, API keys,
// passwords, or anything a support engineer reading the log doesn't need.
// Arguments are stored, so tool schemas must not accept secrets.
// ==========================================================================
import { adminDb } from "./firebaseAdmin";
import type { TrustedUserContext } from "./userContext";

/** Argument keys that must never be persisted, even if a tool accepts them. */
const REDACTED_ARG_KEYS = new Set(["message", "question", "password", "token", "apiKey", "content"]);
const MAX_ARG_LENGTH = 120;

export interface AuditWriteInput {
  action: string;
  toolName?: string;
  args?: Record<string, unknown>;
  /** Structured before/after for mutations, e.g. { oldStatus, newStatus }. */
  details?: Record<string, unknown>;
  result: "success" | "denied" | "error";
  reason?: string;
}

export interface AuditLogRecord extends AuditWriteInput {
  userId: string;
  role: string;
  schoolId: string;
  timestamp: string;
}

export async function writeAuditLog(ctx: TrustedUserContext, entry: AuditWriteInput): Promise<void> {
  try {
    const record: AuditLogRecord = {
      userId: ctx.uid,
      role: ctx.role,
      schoolId: ctx.schoolId,
      action: entry.action,
      result: entry.result,
      timestamp: new Date().toISOString(),
    };
    if (entry.toolName) record.toolName = entry.toolName;
    if (entry.reason) record.reason = entry.reason;
    if (entry.args) record.args = sanitizeArgs(entry.args);
    if (entry.details) record.details = entry.details;

    await adminDb().collection("auditLogs").add(record);
  } catch (err) {
    // Auditing must never crash the user-facing request; log and continue.
    console.error("Failed to write audit log", err);
  }
}

function sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (REDACTED_ARG_KEYS.has(key)) {
      out[key] = typeof value === "string" ? `[${value.length} chars]` : "[redacted]";
      continue;
    }
    out[key] = typeof value === "string" ? value.slice(0, MAX_ARG_LENGTH) : value;
  }
  return out;
}
