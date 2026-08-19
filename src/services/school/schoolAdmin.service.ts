// ==========================================================================
// School administration — the writes that create structure
// --------------------------------------------------------------------------
// Every call here goes through EDVIA's own authenticated API rather than the
// Firestore client SDK, and that is not a style choice. Each of these writes
// either creates a grant (school creation mints principalOfSchoolId) or
// creates something a grant is later derived FROM (classes/{id}.teacherId,
// invites). firestore.rules rejects all of them from the browser, on
// purpose. See api/school/create.ts and api/invites/create.ts.
// ==========================================================================
import { apiPost } from "@/services/apiClient";
import type { ClassRecord, IssuedInvite, InviteKind, MintedInvite, School, SchoolType } from "@/types";

export interface CreateSchoolInput {
  name: string;
  location?: string;
  schoolType?: SchoolType;
  academicYear?: string;
  logoUrl?: string;
}

export async function createSchool(input: CreateSchoolInput): Promise<{ school: School }> {
  return apiPost<{ school: School }>("/api/school/create", input);
}

export interface CreateClassInput {
  className: string;
  section?: string;
  academicYear?: string;
  subjects?: string[];
}

export async function createClass(input: CreateClassInput): Promise<{ class: ClassRecord }> {
  return apiPost<{ class: ClassRecord }>("/api/classes/create", input);
}

export interface CreateInviteInput {
  kind: InviteKind;
  /** Required for class_student. */
  classId?: string;
  /** Required for parent_link. */
  studentId?: string;
  label?: string;
  expiresInDays?: number;
  usageLimit?: number;
}

/**
 * Mints an invitation.
 *
 * The `secret` and `humanCode` in the result are shown ONCE — the server
 * stores only a hash and cannot re-issue them. Callers must render them
 * immediately rather than fetching them again later.
 */
export async function createInvite(input: CreateInviteInput): Promise<MintedInvite> {
  return apiPost<MintedInvite>("/api/invites/create", input);
}

export async function listInvites(classId?: string): Promise<IssuedInvite[]> {
  const { invites } = await apiPost<{ invites: IssuedInvite[] }>("/api/invites/manage", {
    action: "list",
    ...(classId ? { classId } : {}),
  });
  return invites;
}

export async function revokeInvite(inviteId: string): Promise<void> {
  await apiPost<{ success: true }>("/api/invites/manage", { action: "revoke", inviteId });
}
