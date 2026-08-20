import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { requireFirebase } from "@/services/firebase/config";
import { apiGet, apiPost } from "@/services/apiClient";
import type { SupportRequest, SupportRecipient, SupportStatus } from "@/types";

// ==========================================================================
// Escalation to human staff
// --------------------------------------------------------------------------
// firestore.rules denies direct client writes to `supportRequests`, so this
// goes through api/support/create.ts (Admin SDK) — the SAME service EDVIA's
// createTeacherCallRequest tool calls. A request raised from this screen and
// one raised in conversation produce identical, identically-routed records.
// ==========================================================================

export interface CreateSupportRequestInput {
  recipientType: SupportRecipient;
  message: string;
  /** Human-readable context, e.g. "Rahul Kumar · Class 10 - A". */
  studentContext?: string;
  /** The child the request concerns; used to route it to the right teacher. */
  studentId?: string;
}

export async function createSupportRequest(input: CreateSupportRequestInput): Promise<SupportRequest> {
  return apiPost("/api/support/create", input);
}

export async function listSupportRequests(uid: string): Promise<SupportRequest[]> {
  const { db } = requireFirebase();
  const snap = await getDocs(
    query(collection(db, "supportRequests"), where("requestedBy", "==", uid), orderBy("createdAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SupportRequest);
}

// ==========================================================================
// The staff side of the same queue
// --------------------------------------------------------------------------
// Deliberately server routes rather than client Firestore queries. The staff
// inbox is a UNION of two relationships (routed to me personally, plus the
// school's management queue for verified management), and status changes must
// be transactional and audited. Both are properties a client query cannot
// have — see api/support/inbox.ts and api/support/update-status.ts.
// ==========================================================================

export interface SupportInboxResponse {
  count: number;
  requests: SupportRequest[];
  counts: { pending: number; acknowledged: number; resolved: number };
}

export async function getSupportInbox(status?: SupportStatus): Promise<SupportInboxResponse> {
  const suffix = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiGet<SupportInboxResponse>(`/api/support/inbox${suffix}`);
}

/**
 * Moves one request along its lifecycle.
 *
 * Returns the server's copy of the updated record — the caller must render
 * THAT, not an optimistic local mutation. A 409 means a colleague already
 * advanced it; the UI reloads rather than pretending the click worked.
 */
export async function updateSupportRequestStatus(
  requestId: string,
  status: Exclude<SupportStatus, "pending">
): Promise<SupportRequest> {
  const response = await apiPost<{ success: true; request: SupportRequest }>(
    "/api/support/update-status",
    { requestId, status }
  );
  return response.request;
}
