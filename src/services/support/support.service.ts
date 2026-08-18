import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { requireFirebase } from "@/services/firebase/config";
import { apiPost } from "@/services/apiClient";
import type { SupportRequest, SupportRecipient } from "@/types";

export interface CreateSupportRequestInput {
  recipientType: SupportRecipient;
  message: string;
  studentContext?: string;
}

// firestore.rules deny direct client writes to `supportRequests`, so this
// goes through api/support/create.ts (Admin SDK), which writes to the SAME
// collection EDVIA's AI escalation tools use — a request submitted from
// this screen or from a conversation with EDVIA both show up here.
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
