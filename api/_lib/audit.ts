// ==========================================================================
// AuditLogService — every tool decision, allowed or denied, is recorded.
// ==========================================================================
import { adminDb } from "./firebaseAdmin";
import type { TrustedUserContext } from "./userContext";

export interface AuditWriteInput {
  action: string;
  toolName?: string;
  args?: Record<string, unknown>;
  result: "success" | "denied" | "error";
  reason?: string;
}

export async function writeAuditLog(ctx: TrustedUserContext, entry: AuditWriteInput): Promise<void> {
  try {
    await adminDb().collection("auditLogs").add({
      userId: ctx.uid,
      role: ctx.role,
      schoolId: ctx.schoolId,
      ...entry,
      // Never store full free-text message bodies in the audit trail —
      // keep it to structured, minimal args needed to reconstruct "what happened".
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    // Auditing must never crash the user-facing request; log and continue.
    console.error("Failed to write audit log", err);
  }
}
