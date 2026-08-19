// ==========================================================================
// School Service — Escalation to human staff
// --------------------------------------------------------------------------
// The challenge's escalation flow ("I want to talk to my child's teacher")
// must end in a REAL record that a real staff member can act on — and EDVIA
// must only claim success once this function has returned one. Nothing here
// sends an email or places a call; it files a routed request and returns
// its id and status. The assistant's wording is written to match exactly
// that: "your call request has been submitted", never "the teacher has been
// contacted".
// ==========================================================================
import { adminDb } from "../firebaseAdmin.js";
import { getStudent, getClass } from "./people.js";

export type SupportRecipientType = "teacher" | "management";

export interface SupportRequestDoc {
  id: string;
  recipientType: SupportRecipientType;
  /** Resolved staff uid the request is routed to, when one could be determined. */
  routedToUid: string | null;
  routedToLabel: string;
  message: string;
  studentContext: string | null;
  studentId: string | null;
  status: "pending" | "acknowledged" | "resolved" | "cancelled";
  createdAt: string;
  requestedBy: string;
  requestedByRole: string;
  schoolId: string;
}

export interface CreateSupportRequestInput {
  requestedBy: string;
  requestedByRole: string;
  schoolId: string;
  recipientType: SupportRecipientType;
  message: string;
  studentContext?: string;
  /** The child this request is about, when the caller is a parent. */
  studentId?: string;
}

/**
 * Files a call-back request routed to the class teacher of the given
 * student. If the class has no teacher assigned yet, the request is still
 * created (so nothing is lost) but routedToUid is null and the caller is
 * told it went to the school office.
 */
export async function createTeacherCallRequest(
  input: CreateSupportRequestInput
): Promise<SupportRequestDoc> {
  let routedToUid: string | null = null;
  let routedToLabel = "your child's class teacher";

  if (input.studentId) {
    const student = await getStudent(input.studentId);
    if (student && student.schoolId === input.schoolId) {
      const klass = await getClass(student.classId);
      if (klass && klass.schoolId === input.schoolId) {
        routedToUid = klass.teacherId ?? null;
        routedToLabel = `the class teacher for ${klass.className}`;
      }
    }
  }
  if (!routedToUid) routedToLabel = "the school office";

  return persist({ ...input, recipientType: "teacher" }, routedToUid, routedToLabel);
}

export async function createManagementSupportRequest(
  input: CreateSupportRequestInput
): Promise<SupportRequestDoc> {
  return persist({ ...input, recipientType: "management" }, null, "school management");
}

async function persist(
  input: CreateSupportRequestInput,
  routedToUid: string | null,
  routedToLabel: string
): Promise<SupportRequestDoc> {
  const ref = adminDb().collection("supportRequests").doc();
  const doc: Omit<SupportRequestDoc, "id"> = {
    recipientType: input.recipientType,
    routedToUid,
    routedToLabel,
    message: input.message,
    studentContext: input.studentContext ?? null,
    studentId: input.studentId ?? null,
    status: "pending",
    createdAt: new Date().toISOString(),
    requestedBy: input.requestedBy,
    requestedByRole: input.requestedByRole,
    schoolId: input.schoolId,
  };
  await ref.set(doc);
  return { id: ref.id, ...doc };
}

export async function listSupportRequests(uid: string, limit = 10): Promise<SupportRequestDoc[]> {
  const snap = await adminDb()
    .collection("supportRequests")
    .where("requestedBy", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SupportRequestDoc, "id">) }));
}
