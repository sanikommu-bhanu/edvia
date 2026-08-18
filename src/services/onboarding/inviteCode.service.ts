// ==========================================================================
// Invite-code redemption — the only way a fresh signup gets linked to a
// real student/class record (see api/onboarding/redeem-invite.ts for why
// this can't just be a direct Firestore write from the client).
// ==========================================================================
import { apiPost } from "@/services/apiClient";

export interface RedeemInviteResult {
  success: true;
  linked: {
    studentId?: string;
    linkedStudentIds?: string[];
    teacherId?: string;
  };
}

export async function redeemInviteCode(code: string): Promise<RedeemInviteResult> {
  return apiPost<RedeemInviteResult>("/api/onboarding/redeem-invite", { code });
}
