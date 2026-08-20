// ==========================================================================
// Support inbox — visibility, the status machine, and replay safety
// ==========================================================================
// Escalation to a human is the one AI feature where overclaiming is worst:
// a parent told "the teacher has been notified" when nothing was written has
// been actively misled about their child. Three properties keep that honest,
// and this file exists to hold them:
//
//   1. VISIBILITY IS A RELATIONSHIP. A teacher sees the requests routed to
//      them; verified management sees their school's management queue.
//      "Being staff at this school" grants nothing on its own.
//   2. STATUS ONLY MOVES FORWARD. pending → acknowledged → resolved, and
//      never backwards. A workflow that can walk backwards is one where
//      "resolved" means nothing.
//   3. NOTHING IS CLAIMED BEFORE IT IS WRITTEN. The AI action tool reports
//      resolved only after advanceSupportRequestStatus returns ok, and a
//      replayed confirmation transitions nothing a second time.
//
// Everything runs through the real authorizeAndExecuteTool path or the real
// School Service, never a re-implementation.
// ==========================================================================
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { authorizeAndExecuteTool } from "../api/_lib/tools/execute";
import { isActionTool } from "../api/_lib/tools/actionTools";
import { updateSupportRequestStatus } from "../api/_lib/tools/supportTools";
import {
  advanceSupportRequestStatus,
  canTransition,
  createTeacherCallRequest,
  createManagementSupportRequest,
  getSupportRequestById,
  listRoutedSupportRequests,
  reassignRoutedRequests,
  SUPPORT_TRANSITIONS,
  type SupportStatusValue,
} from "../api/_lib/school/support";
import { freezeClock, unfreezeClock, resetFixtures, fakeDb } from "./support/harness";
import {
  ctxStudentRahul,
  ctxParentOfRahul,
  ctxTeacher10A,
  ctxTeacher10B,
  ctxPrincipal,
  ctxUnverifiedPrincipal,
  ctxRiversidePrincipal,
  TEACHER_10A_UID,
  TEACHER_10B_UID,
  PARENT_RAHUL_UID,
  GREENFIELD,
  RIVERSIDE,
  CLASS_10A,
  RAHUL,
} from "./support/fixtures";

freezeClock();
afterAll(unfreezeClock);
beforeEach(resetFixtures);

const staffScope = (uid: string, schoolId: string, isManagement = false) => ({
  uid,
  schoolId,
  isManagement,
});

/** Files a request the way the product does, so tests use real routing. */
async function fileTeacherRequest(message = "Please call me about Rahul.") {
  return createTeacherCallRequest({
    requestedBy: PARENT_RAHUL_UID,
    requestedByRole: "parent",
    schoolId: GREENFIELD,
    recipientType: "teacher",
    message,
    studentId: RAHUL,
    studentContext: "Rahul Kumar · Class 10 - A",
  });
}

// ==========================================================================
// Routing
// ==========================================================================

describe("Routing", () => {
  it("routes a parent's call request to their child's class teacher", async () => {
    const created = await fileTeacherRequest();
    expect(created.routedToUid).toBe(TEACHER_10A_UID);
    expect(created.routedClassId).toBe(CLASS_10A);
    expect(created.routedToLabel).toContain("Class 10 - A");
    expect(created.status).toBe("pending");
  });

  it("starts a management request unrouted and labelled honestly", async () => {
    const created = await createManagementSupportRequest({
      requestedBy: PARENT_RAHUL_UID,
      requestedByRole: "parent",
      schoolId: GREENFIELD,
      recipientType: "management",
      message: "The bus is late.",
    });
    expect(created.routedToUid).toBeNull();
    expect(created.routedToLabel).toBe("school management");
  });

  it("hands a class's open requests to the teacher who claims it", async () => {
    // The seeded queue is pinned to a CLASS, not to a uid that belongs to
    // nobody. Redemption is what turns that into a real inbox.
    fakeDb.load({
      supportRequests: {
        sup_unclaimed: {
          recipientType: "teacher",
          routedToUid: null,
          routedClassId: CLASS_10A,
          routedToLabel: "the class teacher for Class 10 - A",
          message: "Waiting for a teacher.",
          studentContext: null,
          studentId: RAHUL,
          status: "pending",
          createdAt: "2026-05-18T09:00:00.000Z",
          requestedBy: PARENT_RAHUL_UID,
          requestedByRole: "parent",
          schoolId: GREENFIELD,
        },
      },
    });

    const moved = await reassignRoutedRequests(CLASS_10A, GREENFIELD, "uid_new_teacher");
    expect(moved).toBe(1);
    expect(fakeDb.peek("supportRequests", "sup_unclaimed")).toMatchObject({
      routedToUid: "uid_new_teacher",
    });
  });

  it("never hands over a RESOLVED request — that record names who closed it", async () => {
    fakeDb.load({
      supportRequests: {
        sup_done: {
          recipientType: "teacher",
          routedToUid: TEACHER_10A_UID,
          routedClassId: CLASS_10A,
          routedToLabel: "the class teacher for Class 10 - A",
          message: "Already dealt with.",
          studentContext: null,
          studentId: RAHUL,
          status: "resolved",
          createdAt: "2026-05-10T09:00:00.000Z",
          requestedBy: PARENT_RAHUL_UID,
          requestedByRole: "parent",
          schoolId: GREENFIELD,
        },
      },
    });

    await reassignRoutedRequests(CLASS_10A, GREENFIELD, "uid_new_teacher");
    expect(fakeDb.peek("supportRequests", "sup_done")).toMatchObject({
      routedToUid: TEACHER_10A_UID,
    });
  });

  it("never hands a request across a school boundary", async () => {
    fakeDb.load({
      supportRequests: {
        sup_other_school: {
          recipientType: "teacher",
          routedToUid: null,
          routedClassId: CLASS_10A,
          routedToLabel: "the class teacher",
          message: "Wrong school.",
          studentContext: null,
          studentId: null,
          status: "pending",
          createdAt: "2026-05-18T09:00:00.000Z",
          requestedBy: PARENT_RAHUL_UID,
          requestedByRole: "parent",
          schoolId: RIVERSIDE,
        },
      },
    });

    const moved = await reassignRoutedRequests(CLASS_10A, GREENFIELD, "uid_new_teacher");
    expect(moved).toBe(0);
    expect(fakeDb.peek("supportRequests", "sup_other_school")).toMatchObject({ routedToUid: null });
  });
});

// ==========================================================================
// Retrieval
// ==========================================================================

describe("Retrieval", () => {
  it("shows the routed teacher the request", async () => {
    const created = await fileTeacherRequest();
    const inbox = await listRoutedSupportRequests(staffScope(TEACHER_10A_UID, GREENFIELD));
    expect(inbox.map((r) => r.id)).toContain(created.id);
  });

  it("hides it from an unrelated teacher at the same school", async () => {
    await fileTeacherRequest();
    const inbox = await listRoutedSupportRequests(staffScope(TEACHER_10B_UID, GREENFIELD));
    expect(inbox).toHaveLength(0);
  });

  it("shows verified management the school's management queue", async () => {
    const created = await createManagementSupportRequest({
      requestedBy: PARENT_RAHUL_UID,
      requestedByRole: "parent",
      schoolId: GREENFIELD,
      recipientType: "management",
      message: "Transport.",
    });
    const inbox = await listRoutedSupportRequests(staffScope("uid_principal_greenfield", GREENFIELD, true));
    expect(inbox.map((r) => r.id)).toContain(created.id);
  });

  it("does NOT show management a teacher-routed request they aren't the recipient of", async () => {
    // A parent's private message to a class teacher is not management's to
    // read simply because they run the school.
    const created = await fileTeacherRequest();
    const inbox = await listRoutedSupportRequests(staffScope("uid_principal_greenfield", GREENFIELD, true));
    expect(inbox.map((r) => r.id)).not.toContain(created.id);
  });

  it("never returns a request from another school, even to a routed uid", async () => {
    fakeDb.load({
      supportRequests: {
        sup_cross: {
          recipientType: "teacher",
          routedToUid: TEACHER_10A_UID,
          routedClassId: null,
          routedToLabel: "somewhere else",
          message: "Cross-school.",
          studentContext: null,
          studentId: null,
          status: "pending",
          createdAt: "2026-05-19T09:00:00.000Z",
          requestedBy: "uid_someone",
          requestedByRole: "parent",
          schoolId: RIVERSIDE,
        },
      },
    });
    const inbox = await listRoutedSupportRequests(staffScope(TEACHER_10A_UID, GREENFIELD));
    expect(inbox.map((r) => r.id)).not.toContain("sup_cross");
  });

  it("filters by status when asked", async () => {
    const a = await fileTeacherRequest("First");
    await fileTeacherRequest("Second");
    await advanceSupportRequestStatus({
      requestId: a.id,
      to: "acknowledged",
      actor: staffScope(TEACHER_10A_UID, GREENFIELD),
    });

    const pending = await listRoutedSupportRequests(staffScope(TEACHER_10A_UID, GREENFIELD), {
      status: "pending",
    });
    expect(pending.map((r) => r.id)).not.toContain(a.id);
    expect(pending).toHaveLength(1);
  });

  it("returns newest first", async () => {
    const first = await fileTeacherRequest("Older");
    // createdAt is generated from the frozen clock, so nudge one explicitly.
    fakeDb.load({
      supportRequests: {
        [first.id]: { ...(fakeDb.peek("supportRequests", first.id) as object), createdAt: "2026-01-01T00:00:00.000Z" },
      },
    });
    const second = await fileTeacherRequest("Newer");
    const inbox = await listRoutedSupportRequests(staffScope(TEACHER_10A_UID, GREENFIELD));
    expect(inbox[0].id).toBe(second.id);
  });
});

// ==========================================================================
// The status machine
// ==========================================================================

describe("Status transitions", () => {
  it("declares a forward-only machine", () => {
    expect(SUPPORT_TRANSITIONS.pending).toEqual(
      expect.arrayContaining(["acknowledged", "resolved"])
    );
    expect(SUPPORT_TRANSITIONS.acknowledged).toEqual(["resolved"]);
    expect(SUPPORT_TRANSITIONS.resolved).toEqual([]);
    expect(SUPPORT_TRANSITIONS.cancelled).toEqual([]);
  });

  it.each<[SupportStatusValue, SupportStatusValue, boolean]>([
    ["pending", "acknowledged", true],
    ["pending", "resolved", true],
    ["acknowledged", "resolved", true],
    ["resolved", "pending", false],
    ["resolved", "acknowledged", false],
    ["acknowledged", "pending", false],
    ["cancelled", "resolved", false],
  ])("%s → %s is %s", (from, to, allowed) => {
    expect(canTransition(from, to)).toBe(allowed);
  });

  it("moves pending → acknowledged and records who and when", async () => {
    const created = await fileTeacherRequest();
    const outcome = await advanceSupportRequestStatus({
      requestId: created.id,
      to: "acknowledged",
      actor: staffScope(TEACHER_10A_UID, GREENFIELD),
    });
    expect(outcome.ok).toBe(true);
    expect(fakeDb.peek("supportRequests", created.id)).toMatchObject({
      status: "acknowledged",
      previousStatus: "pending",
      updatedBy: TEACHER_10A_UID,
    });
  });

  it("moves pending → resolved directly", async () => {
    const created = await fileTeacherRequest();
    const outcome = await advanceSupportRequestStatus({
      requestId: created.id,
      to: "resolved",
      actor: staffScope(TEACHER_10A_UID, GREENFIELD),
    });
    expect(outcome.ok).toBe(true);
    expect((await getSupportRequestById(created.id))?.status).toBe("resolved");
  });

  it("moves acknowledged → resolved", async () => {
    const created = await fileTeacherRequest();
    await advanceSupportRequestStatus({
      requestId: created.id,
      to: "acknowledged",
      actor: staffScope(TEACHER_10A_UID, GREENFIELD),
    });
    const outcome = await advanceSupportRequestStatus({
      requestId: created.id,
      to: "resolved",
      actor: staffScope(TEACHER_10A_UID, GREENFIELD),
    });
    expect(outcome.ok).toBe(true);
  });

  it("refuses resolved → pending, and leaves the record untouched", async () => {
    const created = await fileTeacherRequest();
    await advanceSupportRequestStatus({
      requestId: created.id,
      to: "resolved",
      actor: staffScope(TEACHER_10A_UID, GREENFIELD),
    });
    const before = fakeDb.peek("supportRequests", created.id);

    const outcome = await advanceSupportRequestStatus({
      requestId: created.id,
      to: "acknowledged",
      actor: staffScope(TEACHER_10A_UID, GREENFIELD),
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.refusal).toBe("illegal_transition");
    expect(fakeDb.peek("supportRequests", created.id)).toEqual(before);
  });

  it("reports an unknown request as not_found", async () => {
    const outcome = await advanceSupportRequestStatus({
      requestId: "sup_does_not_exist",
      to: "resolved",
      actor: staffScope(TEACHER_10A_UID, GREENFIELD),
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.refusal).toBe("not_found");
  });
});

describe("Transition authorization", () => {
  it("refuses an unrelated teacher, with the same message an unknown id gets", async () => {
    const created = await fileTeacherRequest();
    const outcome = await advanceSupportRequestStatus({
      requestId: created.id,
      to: "resolved",
      actor: staffScope(TEACHER_10B_UID, GREENFIELD),
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.refusal).toBe("not_authorized");
    // Indistinguishable from "no such request", so ids can't be enumerated.
    expect(outcome.message).toContain("couldn't find that request");
    expect((await getSupportRequestById(created.id))?.status).toBe("pending");
  });

  it("refuses another school's principal", async () => {
    const created = await createManagementSupportRequest({
      requestedBy: PARENT_RAHUL_UID,
      requestedByRole: "parent",
      schoolId: GREENFIELD,
      recipientType: "management",
      message: "Transport.",
    });
    const outcome = await advanceSupportRequestStatus({
      requestId: created.id,
      to: "resolved",
      actor: staffScope("uid_principal_riverside", RIVERSIDE, true),
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.refusal).toBe("not_authorized");
  });

  it("refuses the REQUESTER a resolve on their own escalation", async () => {
    // The status records what the SCHOOL did. A parent marking their own
    // request resolved would make the field meaningless.
    const created = await fileTeacherRequest();
    const outcome = await advanceSupportRequestStatus({
      requestId: created.id,
      to: "resolved",
      actor: staffScope(PARENT_RAHUL_UID, GREENFIELD),
    });
    expect(outcome.ok).toBe(false);
  });

  it("lets the requester CANCEL their own pending request", async () => {
    const created = await fileTeacherRequest();
    const outcome = await advanceSupportRequestStatus({
      requestId: created.id,
      to: "cancelled",
      actor: staffScope(PARENT_RAHUL_UID, GREENFIELD),
    });
    expect(outcome.ok).toBe(true);
    expect((await getSupportRequestById(created.id))?.status).toBe("cancelled");
  });

  it("refuses a stranger cancelling someone else's request", async () => {
    const created = await fileTeacherRequest();
    const outcome = await advanceSupportRequestStatus({
      requestId: created.id,
      to: "cancelled",
      actor: staffScope("uid_random", GREENFIELD),
    });
    expect(outcome.ok).toBe(false);
  });
});

describe("Replay protection", () => {
  it("transitions once, however many times the same call arrives", async () => {
    const created = await fileTeacherRequest();
    const actor = staffScope(TEACHER_10A_UID, GREENFIELD);

    const first = await advanceSupportRequestStatus({ requestId: created.id, to: "resolved", actor });
    const second = await advanceSupportRequestStatus({ requestId: created.id, to: "resolved", actor });
    const third = await advanceSupportRequestStatus({ requestId: created.id, to: "resolved", actor });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.refusal).toBe("already_in_state");
    expect(third.refusal).toBe("already_in_state");
  });

  it("does not rewrite updatedBy on a replayed call", async () => {
    const created = await fileTeacherRequest();
    await advanceSupportRequestStatus({
      requestId: created.id,
      to: "resolved",
      actor: staffScope(TEACHER_10A_UID, GREENFIELD),
    });
    const afterFirst = fakeDb.peek("supportRequests", created.id);

    await advanceSupportRequestStatus({
      requestId: created.id,
      to: "resolved",
      // A different colleague replaying the same action must not be recorded
      // as the person who closed it.
      actor: staffScope("uid_someone_else", GREENFIELD, true),
    });
    expect(fakeDb.peek("supportRequests", created.id)).toEqual(afterFirst);
  });
});

// ==========================================================================
// The AI surface
// ==========================================================================

describe("getSupportInbox tool", () => {
  it("returns the teacher's own queue", async () => {
    const created = await fileTeacherRequest();
    const result = await authorizeAndExecuteTool(ctxTeacher10A, "getSupportInbox", {});
    expect(result.ok).toBe(true);
    const data = result.result as { requests: { requestId: string }[]; pendingCount: number };
    expect(data.requests.map((r) => r.requestId)).toContain(created.id);
    expect(data.pendingCount).toBe(1);
  });

  it("refuses a student", async () => {
    const result = await authorizeAndExecuteTool(ctxStudentRahul, "getSupportInbox", {});
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("role_denied");
  });

  it("refuses a parent", async () => {
    const result = await authorizeAndExecuteTool(ctxParentOfRahul, "getSupportInbox", {});
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("role_denied");
  });

  it("gives a self-declared principal an EMPTY inbox, not the school's", async () => {
    await createManagementSupportRequest({
      requestedBy: PARENT_RAHUL_UID,
      requestedByRole: "parent",
      schoolId: GREENFIELD,
      recipientType: "management",
      message: "Transport.",
    });
    const fake = await authorizeAndExecuteTool(ctxUnverifiedPrincipal, "getSupportInbox", {});
    expect(fake.ok).toBe(false);
    expect(fake.kind).toBe("no_data");

    const real = await authorizeAndExecuteTool(ctxPrincipal, "getSupportInbox", {});
    expect(real.ok).toBe(true);
  });

  it("says no-data rather than returning an empty list as if it were an answer", async () => {
    const result = await authorizeAndExecuteTool(ctxTeacher10B, "getSupportInbox", {});
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("no_data");
  });
});

describe("updateSupportRequestStatus tool", () => {
  it("previews before writing, naming the current status", async () => {
    const created = await fileTeacherRequest();
    const result = await authorizeAndExecuteTool(ctxTeacher10A, "updateSupportRequestStatus", {
      requestId: created.id,
      status: "resolved",
    });
    expect(result.kind).toBe("needs_confirmation");
    expect(result.preview?.summary).toContain("currently pending");
    // Nothing written on the ask.
    expect((await getSupportRequestById(created.id))?.status).toBe("pending");
  });

  it("writes only after an explicit confirmation", async () => {
    const created = await fileTeacherRequest();
    const result = await authorizeAndExecuteTool(
      ctxTeacher10A,
      "updateSupportRequestStatus",
      { requestId: created.id, status: "resolved" },
      true
    );
    expect(result.ok).toBe(true);
    expect(result.result).toMatchObject({ status: "resolved", previousStatus: "pending" });
    expect((await getSupportRequestById(created.id))?.status).toBe("resolved");
  });

  it("refuses a request outside the caller's inbox without revealing it exists", async () => {
    const created = await fileTeacherRequest();
    const result = await authorizeAndExecuteTool(
      ctxTeacher10B,
      "updateSupportRequestStatus",
      { requestId: created.id, status: "resolved" },
      true
    );
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("not_authorized");
    expect((await getSupportRequestById(created.id))?.status).toBe("pending");
  });

  it("refuses a backwards transition at PREVIEW time, before asking the user", async () => {
    const created = await fileTeacherRequest();
    await advanceSupportRequestStatus({
      requestId: created.id,
      to: "resolved",
      actor: staffScope(TEACHER_10A_UID, GREENFIELD),
    });

    const result = await authorizeAndExecuteTool(ctxTeacher10A, "updateSupportRequestStatus", {
      requestId: created.id,
      status: "acknowledged",
    });
    expect(result.kind).not.toBe("needs_confirmation");
    expect(result.ok).toBe(false);
  });

  it("flags an already-in-state request as a no-op rather than a change", async () => {
    const created = await fileTeacherRequest();
    await advanceSupportRequestStatus({
      requestId: created.id,
      to: "acknowledged",
      actor: staffScope(TEACHER_10A_UID, GREENFIELD),
    });

    expect(isActionTool(updateSupportRequestStatus)).toBe(true);
    const preview = await updateSupportRequestStatus.preview(ctxTeacher10A, {
      requestId: created.id,
      status: "acknowledged",
    });
    expect(preview.noOp).toBe(true);
  });

  it("cannot claim 'resolved' when the server refused — a replay fails loudly", async () => {
    const created = await fileTeacherRequest();
    const args = { requestId: created.id, status: "resolved" as const };

    const first = await authorizeAndExecuteTool(ctxTeacher10A, "updateSupportRequestStatus", args, true);
    const replay = await authorizeAndExecuteTool(ctxTeacher10A, "updateSupportRequestStatus", args, true);

    expect(first.ok).toBe(true);
    // The model gets a failure, not a second success it could narrate as one.
    expect(replay.ok).toBe(false);
  });

  it("refuses a student and a parent outright", async () => {
    const created = await fileTeacherRequest();
    for (const ctx of [ctxStudentRahul, ctxParentOfRahul]) {
      const result = await authorizeAndExecuteTool(
        ctx,
        "updateSupportRequestStatus",
        { requestId: created.id, status: "resolved" },
        true
      );
      expect(result.ok).toBe(false);
      expect(result.kind).toBe("role_denied");
    }
    expect((await getSupportRequestById(created.id))?.status).toBe("pending");
  });

  it("refuses another school's principal", async () => {
    const created = await createManagementSupportRequest({
      requestedBy: PARENT_RAHUL_UID,
      requestedByRole: "parent",
      schoolId: GREENFIELD,
      recipientType: "management",
      message: "Transport.",
    });
    const result = await authorizeAndExecuteTool(
      ctxRiversidePrincipal,
      "updateSupportRequestStatus",
      { requestId: created.id, status: "resolved" },
      true
    );
    expect(result.ok).toBe(false);
    expect((await getSupportRequestById(created.id))?.status).toBe("pending");
  });

  it("rejects an empty requestId at the schema, before any lookup", async () => {
    const result = await authorizeAndExecuteTool(
      ctxTeacher10A,
      "updateSupportRequestStatus",
      { requestId: "", status: "resolved" },
      true
    );
    expect(result.kind).toBe("invalid_arguments");
  });

  it("does not offer 'pending' as a target status at all", async () => {
    const result = await authorizeAndExecuteTool(
      ctxTeacher10A,
      "updateSupportRequestStatus",
      { requestId: "anything", status: "pending" },
      true
    );
    expect(result.kind).toBe("invalid_arguments");
  });
});

// ==========================================================================
// The audit trail
// ==========================================================================

describe("Audit", () => {
  it("records a successful transition", async () => {
    const created = await fileTeacherRequest();
    await authorizeAndExecuteTool(
      ctxTeacher10A,
      "updateSupportRequestStatus",
      { requestId: created.id, status: "resolved" },
      true
    );
    const entries = fakeDb.peekAll("auditLogs").map((d) => d.data);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "write:support_request_status", result: "success" }),
      ])
    );
  });

  it("records a DENIED transition too", async () => {
    const created = await fileTeacherRequest();
    await authorizeAndExecuteTool(
      ctxTeacher10B,
      "updateSupportRequestStatus",
      { requestId: created.id, status: "resolved" },
      true
    );
    const entries = fakeDb.peekAll("auditLogs").map((d) => d.data);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "write:support_request_status", result: "denied" }),
      ])
    );
  });
});
