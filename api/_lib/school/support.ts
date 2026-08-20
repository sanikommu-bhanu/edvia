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

export type SupportStatusValue = "pending" | "acknowledged" | "resolved" | "cancelled";

/**
 * The support request lifecycle, as a table rather than a chain of ifs.
 *
 * Transitions are FORWARD ONLY. A resolved request cannot be dragged back to
 * pending, and an acknowledged one cannot be un-acknowledged: the status is
 * a record of what a member of staff actually did, and a workflow that can
 * walk backwards is a workflow where "resolved" means nothing. Reopening is
 * deliberately not a status change — it is a new request, with its own
 * timestamps and its own audit trail.
 *
 * `cancelled` is reachable only from `pending`, and only by the person who
 * raised the request (enforced in advanceSupportRequestStatus): staff close
 * requests by resolving them, requesters withdraw them by cancelling.
 */
export const SUPPORT_TRANSITIONS: Record<SupportStatusValue, SupportStatusValue[]> = {
  pending: ["acknowledged", "resolved", "cancelled"],
  acknowledged: ["resolved"],
  resolved: [],
  cancelled: [],
};

export function canTransition(from: SupportStatusValue, to: SupportStatusValue): boolean {
  return (SUPPORT_TRANSITIONS[from] ?? []).includes(to);
}

export interface SupportRequestDoc {
  id: string;
  recipientType: SupportRecipientType;
  /** Resolved staff uid the request is routed to, when one could be determined. */
  routedToUid: string | null;
  /**
   * The class whose CURRENT teacher this request belongs to.
   *
   * Kept alongside routedToUid because a class outlives the person teaching
   * it: when a teacher claims a class (invite redemption), or a class changes
   * hands mid-year, the open requests for that class must follow the role,
   * not stay pinned to whoever happened to hold it when the parent wrote in.
   * reassignRoutedRequests() does that handover.
   */
  routedClassId?: string | null;
  routedToLabel: string;
  message: string;
  studentContext: string | null;
  studentId: string | null;
  status: SupportStatusValue;
  createdAt: string;
  requestedBy: string;
  requestedByRole: string;
  schoolId: string;
  /** Who last moved the request along, and when. Null until someone does. */
  updatedAt?: string | null;
  updatedBy?: string | null;
  /** The status this request held before the last transition. */
  previousStatus?: SupportStatusValue | null;
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

  let routedClassId: string | null = null;

  if (input.studentId) {
    const student = await getStudent(input.studentId);
    if (student && student.schoolId === input.schoolId) {
      const klass = await getClass(student.classId);
      if (klass && klass.schoolId === input.schoolId) {
        routedClassId = klass.id;
        routedToUid = klass.teacherId ?? null;
        routedToLabel = `the class teacher for ${klass.className}`;
      }
    }
  }
  // A class with no teacher yet still files the request — nothing is lost,
  // and reassignRoutedRequests hands it over the moment one is assigned.
  if (!routedToUid && !routedClassId) routedToLabel = "the school office";

  return persist({ ...input, recipientType: "teacher" }, routedToUid, routedToLabel, routedClassId);
}

export async function createManagementSupportRequest(
  input: CreateSupportRequestInput
): Promise<SupportRequestDoc> {
  return persist({ ...input, recipientType: "management" }, null, "school management", null);
}

/**
 * Hands the open requests for a class over to its new teacher.
 *
 * Called when a teacher claims a class during invite redemption. Only
 * `pending` and `acknowledged` requests move: a resolved request is a
 * historical record of who closed it, and rewriting that would falsify the
 * audit trail rather than help anyone.
 *
 * Returns the number of requests re-pointed, so the caller can log it.
 */
export async function reassignRoutedRequests(
  classId: string,
  schoolId: string,
  newTeacherUid: string
): Promise<number> {
  const db = adminDb();
  const snap = await db.collection("supportRequests").where("routedClassId", "==", classId).get();

  const movable = snap.docs.filter((d) => {
    const data = d.data() as Omit<SupportRequestDoc, "id">;
    return (
      data.schoolId === schoolId &&
      data.routedToUid !== newTeacherUid &&
      (data.status === "pending" || data.status === "acknowledged")
    );
  });
  if (movable.length === 0) return 0;

  const batch = db.batch();
  movable.forEach((d) => batch.update(d.ref, { routedToUid: newTeacherUid }));
  await batch.commit();
  return movable.length;
}

async function persist(
  input: CreateSupportRequestInput,
  routedToUid: string | null,
  routedToLabel: string,
  routedClassId: string | null
): Promise<SupportRequestDoc> {
  const ref = adminDb().collection("supportRequests").doc();
  const doc: Omit<SupportRequestDoc, "id"> = {
    recipientType: input.recipientType,
    routedToUid,
    routedClassId,
    routedToLabel,
    message: input.message,
    studentContext: input.studentContext ?? null,
    studentId: input.studentId ?? null,
    status: "pending",
    createdAt: new Date().toISOString(),
    requestedBy: input.requestedBy,
    requestedByRole: input.requestedByRole,
    schoolId: input.schoolId,
    updatedAt: null,
    updatedBy: null,
    previousStatus: null,
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

// ==========================================================================
// The staff side of escalation
// --------------------------------------------------------------------------
// Creating a request was only ever half a workflow. Until a member of staff
// can SEE the request and mark what they did about it, "escalation to a
// human" is a write-only queue — the parent is told someone will call, and
// nothing in the system ever records whether anyone did.
//
// Two rules hold everything below together:
//
//   1. Visibility is a RELATIONSHIP, not a role. A teacher sees the requests
//      routed to them; verified management sees their school's management
//      queue. "Being a teacher at this school" grants nothing on its own,
//      exactly as with students and attendance.
//
//   2. Status only ever moves forward, and only through
//      advanceSupportRequestStatus, which re-reads the live document inside
//      the transition check. A stale client that thinks a request is still
//      pending cannot re-resolve one that a colleague already closed.
// ==========================================================================

/** How the caller is entitled to see a given queue. */
export interface StaffInboxScope {
  uid: string;
  schoolId: string;
  /** True only for VERIFIED management (principalOfSchoolId === schoolId). */
  isManagement: boolean;
}

export interface ListInboxOptions {
  status?: SupportStatusValue;
  limit?: number;
}

/**
 * The requests this staff member may act on.
 *
 * Deliberately two narrow queries unioned in memory rather than one broad
 * `where schoolId ==` scan filtered afterwards: the broad version would pull
 * every family's message for the whole school into the function's memory
 * before discarding most of them, which is a data-exposure shape even when
 * the output is correct.
 */
export async function listRoutedSupportRequests(
  scope: StaffInboxScope,
  options: ListInboxOptions = {}
): Promise<SupportRequestDoc[]> {
  const db = adminDb();
  const limit = options.limit ?? 50;

  const queries: FirebaseFirestore.Query[] = [
    db.collection("supportRequests").where("routedToUid", "==", scope.uid),
  ];
  if (scope.isManagement) {
    queries.push(
      db
        .collection("supportRequests")
        .where("schoolId", "==", scope.schoolId)
        .where("recipientType", "==", "management")
    );
  }

  const snaps = await Promise.all(queries.map((q) => q.get()));
  const seen = new Set<string>();
  const rows: SupportRequestDoc[] = [];
  for (const snap of snaps) {
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      const doc = { id: d.id, ...(d.data() as Omit<SupportRequestDoc, "id">) };
      // Second, independent school-boundary check. The routedToUid query is
      // scoped by uid alone, so a staff account that somehow held a routing
      // from another school would otherwise see it here.
      if (doc.schoolId !== scope.schoolId) continue;
      if (options.status && doc.status !== options.status) continue;
      rows.push(doc);
    }
  }

  return rows.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).slice(0, limit);
}

export async function getSupportRequestById(requestId: string): Promise<SupportRequestDoc | null> {
  const snap = await adminDb().collection("supportRequests").doc(requestId).get();
  return snap.exists ? { id: snap.id, ...(snap.data() as Omit<SupportRequestDoc, "id">) } : null;
}

/** Why a transition was refused. Every message is safe to show verbatim. */
export type TransitionRefusal =
  | "not_found"
  | "not_authorized"
  | "illegal_transition"
  | "already_in_state";

export interface AdvanceStatusResult {
  ok: boolean;
  refusal?: TransitionRefusal;
  message?: string;
  request?: SupportRequestDoc;
}

export interface AdvanceStatusInput {
  requestId: string;
  to: SupportStatusValue;
  actor: StaffInboxScope;
  /** The acting account's role, so a requester can cancel their own request. */
  actorRole?: string;
}

/**
 * Moves one request along its lifecycle, transactionally.
 *
 * The authorization, the legality of the transition and the write all happen
 * inside a single transaction against the LIVE document. That is what makes
 * this replay-safe: two "resolve" clicks (or a repeated AI confirmation)
 * produce one transition and one audit-worthy change, because the second
 * read sees `resolved` and refuses rather than rewriting the timestamps.
 */
export async function advanceSupportRequestStatus(
  input: AdvanceStatusInput
): Promise<AdvanceStatusResult> {
  const db = adminDb();
  const ref = db.collection("supportRequests").doc(input.requestId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      return { ok: false, refusal: "not_found" as const, message: "I couldn't find that request." };
    }
    const current = { id: snap.id, ...(snap.data() as Omit<SupportRequestDoc, "id">) };

    if (!mayAdvance(current, input)) {
      // Deliberately the same message as not_found would produce for a
      // request in another school — a staff member must not be able to probe
      // for the existence of requests outside their own queue.
      return {
        ok: false,
        refusal: "not_authorized" as const,
        message: "I couldn't find that request in your inbox.",
      };
    }

    if (current.status === input.to) {
      return {
        ok: false,
        refusal: "already_in_state" as const,
        message: `That request is already marked ${input.to}.`,
        request: current,
      };
    }
    if (!canTransition(current.status, input.to)) {
      return {
        ok: false,
        refusal: "illegal_transition" as const,
        message: `A request that is already ${current.status} can't be moved back to ${input.to}.`,
        request: current,
      };
    }

    const now = new Date().toISOString();
    tx.update(ref, {
      status: input.to,
      previousStatus: current.status,
      updatedAt: now,
      updatedBy: input.actor.uid,
    });

    return {
      ok: true,
      request: { ...current, status: input.to, previousStatus: current.status, updatedAt: now, updatedBy: input.actor.uid },
    };
  });
}

/**
 * Who may move this particular request.
 *
 * Staff: the routed teacher, or verified management for a management-routed
 * request in their own school. Requester: only to cancel their own pending
 * request — they can withdraw an escalation, never mark it resolved on the
 * school's behalf.
 */
function mayAdvance(request: SupportRequestDoc, input: AdvanceStatusInput): boolean {
  if (request.schoolId !== input.actor.schoolId) return false;

  if (input.to === "cancelled") {
    return request.requestedBy === input.actor.uid;
  }
  if (request.routedToUid && request.routedToUid === input.actor.uid) return true;
  return input.actor.isManagement && request.recipientType === "management";
}
