import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { requireFirebase } from "@/services/firebase/config";
import { apiPost } from "@/services/apiClient";
import type { SupportRequest, SupportRecipient } from "@/types";

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
