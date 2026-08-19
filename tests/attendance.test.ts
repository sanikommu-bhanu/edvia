// ==========================================================================
// Attendance integrity
// ==========================================================================
// The bug class this file exists to prevent: attendance that is written
// twice for the same student-day, which silently halves a percentage and
// makes the dashboard and the assistant disagree. Every test here is about
// the record being ONE row, and every reader computing it the SAME way.
// ==========================================================================
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { authorizeAndExecuteTool } from "../api/_lib/tools/execute";
import { markAttendance, isActionTool } from "../api/_lib/tools/actionTools";
import { markClassAttendance, getStudentAttendance, attendanceDocId } from "../api/_lib/school/attendance";
import { tallyAttendance, attendancePercentage, rollUpPercentage } from "../src/lib/attendanceMath";
import { resolvePeriod } from "../api/_lib/tools/dateRange";
import { freezeClock, unfreezeClock, resetFixtures, fakeDb } from "./support/harness";
import { ctxTeacher10A, ctxParentOfRahul, RAHUL, TODAY, CLASS_10A, GREENFIELD, daysBefore } from "./support/fixtures";

freezeClock();
afterAll(unfreezeClock);
beforeEach(resetFixtures);

describe("Idempotency", () => {
  it("amends the existing record instead of appending a second one", async () => {
    const before = fakeDb.peekAll("attendance").filter((d) => d.data.studentId === RAHUL).length;

    await authorizeAndExecuteTool(
      ctxTeacher10A,
      "markAttendance",
      { studentName: "Rahul Kumar", status: "absent" },
      true
    );

    const after = fakeDb.peekAll("attendance").filter((d) => d.data.studentId === RAHUL);
    expect(after).toHaveLength(before);
    expect(fakeDb.peek("attendance", attendanceDocId(RAHUL, TODAY))).toMatchObject({
      status: "absent",
      previousStatus: "present",
      markedBy: ctxTeacher10A.uid,
    });
  });

  it("keeps the percentage stable when the same register is saved twice", async () => {
    const entries = [{ studentId: RAHUL, classId: CLASS_10A, schoolId: GREENFIELD, status: "present" as const, date: TODAY, markedBy: "t" }];

    await markClassAttendance(entries);
    const first = await getStudentAttendance(RAHUL, resolvePeriod("all_time"));
    await markClassAttendance(entries);
    const second = await getStudentAttendance(RAHUL, resolvePeriod("all_time"));

    expect(second.total).toBe(first.total);
    expect(second.percentage).toBe(first.percentage);
  });

  it("reports how many records a bulk save actually changed", async () => {
    const result = await markClassAttendance([
      { studentId: RAHUL, classId: CLASS_10A, schoolId: GREENFIELD, status: "absent", date: TODAY, markedBy: "t" },
    ]);
    expect(result).toEqual({ written: 1, amended: 1 });

    const unchanged = await markClassAttendance([
      { studentId: RAHUL, classId: CLASS_10A, schoolId: GREENFIELD, status: "absent", date: TODAY, markedBy: "t" },
    ]);
    expect(unchanged.amended).toBe(0);
  });

  it("uses a deterministic key so the AI tool and the UI hit the same row", async () => {
    expect(attendanceDocId(RAHUL, TODAY)).toBe(`${RAHUL}_${TODAY}`);
  });
});

describe("Confirmation preview reads the live record", () => {
  it("states the current status before proposing a change", async () => {
    expect(isActionTool(markAttendance)).toBe(true);
    const preview = await markAttendance.preview(ctxTeacher10A, {
      studentName: "Rahul Kumar",
      status: "absent",
    });
    expect(preview.summary).toContain("Rahul Kumar");
    expect(preview.summary).toContain("currently marked present");
    expect(preview.details).toMatchObject({ from: "present", to: "absent", date: TODAY });
  });

  it("flags a no-op rather than pretending something changed", async () => {
    const preview = await markAttendance.preview(ctxTeacher10A, {
      studentName: "Rahul Kumar",
      status: "present",
    });
    expect(preview.noOp).toBe(true);
    expect(preview.summary).toContain("already marked present");
  });

  it("says so when the day has not been marked at all", async () => {
    // A date outside the fixture window has no record for anyone.
    const unmarkedDate = daysBefore(TODAY, 40);
    expect(fakeDb.peek("attendance", attendanceDocId("stu_arjun", unmarkedDate))).toBeUndefined();

    const preview = await markAttendance.preview(ctxTeacher10A, {
      studentName: "Arjun Patel",
      status: "leave",
      date: unmarkedDate,
    });
    expect(preview.summary).toContain("hasn't been marked");
    expect(preview.details).toMatchObject({ from: null, to: "leave" });
  });

  it("does not write anything during preview", async () => {
    const writesBefore = fakeDb.writeCount;
    await markAttendance.preview(ctxTeacher10A, { studentName: "Rahul Kumar", status: "absent" });
    expect(fakeDb.writeCount).toBe(writesBefore);
  });

  it("refuses to mark a future date", async () => {
    await expect(
      markAttendance.preview(ctxTeacher10A, {
        studentName: "Rahul Kumar",
        status: "absent",
        date: "2099-01-01",
      })
    ).rejects.toThrow(/future date/i);
  });
});

describe("One shared formula", () => {
  it("counts approved leave at half credit", () => {
    expect(attendancePercentage(["present", "present", "leave", "absent"])).toBe(62.5);
  });

  it("returns 0 for an empty set rather than dividing by a fabricated 1", () => {
    expect(attendancePercentage([])).toBe(0);
    expect(tallyAttendance([])).toMatchObject({ total: 0, percentage: 0 });
  });

  it("weights a roll-up by record count, not by class count", () => {
    // 100 records at 100% and 2 records at 0% is ~98%, not 50%.
    const weighted = rollUpPercentage([
      { present: 100, leave: 0, total: 100 },
      { present: 0, leave: 0, total: 2 },
    ]);
    expect(weighted).toBeCloseTo(98, 0);
  });

  it("gives the AI tool and a direct service read the same number", async () => {
    const direct = await getStudentAttendance(RAHUL, resolvePeriod("all_time"));
    const viaTool = await authorizeAndExecuteTool(ctxParentOfRahul, "getChildAttendance", { period: "all_time" });
    expect((viaTool.result as { percentage: number }).percentage).toBe(direct.percentage);
  });
});

describe("Empty periods are reported honestly", () => {
  it("flags noRecords rather than claiming 0% attendance", async () => {
    const result = await authorizeAndExecuteTool(ctxParentOfRahul, "getChildAttendance", { period: "today" });
    const data = result.result as { noRecords: boolean; total: number };
    // Rahul does have a record today, so this asserts the opposite direction:
    expect(data.noRecords).toBe(false);

    const empty = await getStudentAttendance("stu_nobody", resolvePeriod("this_month"));
    expect(empty.noRecords).toBe(true);
    expect(empty.total).toBe(0);
    expect(empty.percentage).toBe(0);
  });
});

describe("Audit trail", () => {
  it("records the before and after status of a change", async () => {
    await authorizeAndExecuteTool(
      ctxTeacher10A,
      "markAttendance",
      { studentName: "Rahul Kumar", status: "absent" },
      true
    );
    const logs = fakeDb.peekAll("auditLogs").map((d) => d.data);
    const write = logs.find((l) => l.toolName === "markAttendance" && l.result === "success");
    expect(write).toBeDefined();
    expect(write?.details).toMatchObject({ oldStatus: "present", newStatus: "absent", changed: true });
    expect(write).toMatchObject({ userId: ctxTeacher10A.uid, role: "teacher", schoolId: GREENFIELD });
  });

  it("records denials too, not just successes", async () => {
    await authorizeAndExecuteTool(ctxParentOfRahul, "markAttendance", {
      studentName: "Rahul Kumar",
      status: "absent",
    });
    const denied = fakeDb.peekAll("auditLogs").map((d) => d.data).find((l) => l.result === "denied");
    expect(denied).toBeDefined();
    expect(denied?.reason).toBe("role_not_allowed");
  });

  it("never stores free-text message bodies", async () => {
    await authorizeAndExecuteTool(
      ctxParentOfRahul,
      "createTeacherCallRequest",
      { message: "My private concern about my child's wellbeing at home" },
      true
    );
    const logs = fakeDb.peekAll("auditLogs").map((d) => JSON.stringify(d.data));
    expect(logs.join("\n")).not.toContain("wellbeing at home");
  });
});
