// ==========================================================================
// The authorization matrix
// ==========================================================================
// These run against the real authorizeAndExecuteTool path — the same
// function the AI orchestrator and the voice relay call. A pass here means
// the shipped boundary held, not that a test double agreed with itself.
//
// The rule being tested throughout: the model can ASK for anything. Whether
// it gets an answer is decided from the caller's verified profile, without
// consulting the model at all.
// ==========================================================================
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { authorizeAndExecuteTool } from "../api/_lib/tools/execute";
import { freezeClock, unfreezeClock, resetFixtures, fakeDb } from "./support/harness";
import {
  ctxStudentRahul,
  ctxParentOfRahul,
  ctxParentOfTwo,
  ctxTeacher10A,
  ctxTeacher10B,
  ctxPrincipal,
  ctxRiversidePrincipal,
  ctxRiversideParent,
  RAHUL,
  TODAY,
} from "./support/fixtures";

freezeClock();
afterAll(unfreezeClock);
beforeEach(resetFixtures);

describe("Student — own data only", () => {
  it("returns the signed-in student's own attendance", async () => {
    const result = await authorizeAndExecuteTool(ctxStudentRahul, "getStudentAttendance", { period: "this_month" });
    expect(result.ok).toBe(true);
    const data = result.result as { studentName: string; percentage: number; total: number };
    expect(data.studentName).toBe("Rahul Kumar");
    // 8 present + 1 leave (half credit) out of 10 recorded days.
    expect(data.percentage).toBe(85);
  });

  it("ignores a studentName argument rather than honouring it", async () => {
    // The model could be talked into passing someone else's name; the tool
    // resolves a student account to itself regardless of what it is given.
    const result = await authorizeAndExecuteTool(ctxStudentRahul, "getStudentProfile", {
      studentName: "Priya Sharma",
    });
    expect(result.ok).toBe(true);
    expect((result.result as { fullName: string }).fullName).toBe("Rahul Kumar");
  });

  it("refuses tools reserved for other roles", async () => {
    const marked = await authorizeAndExecuteTool(ctxStudentRahul, "markAttendance", {
      studentName: "Arjun Patel",
      status: "absent",
    });
    expect(marked.ok).toBe(false);
    expect(marked.kind).toBe("role_denied");

    const schoolWide = await authorizeAndExecuteTool(ctxStudentRahul, "getSchoolAttendance", { period: "this_month" });
    expect(schoolWide.ok).toBe(false);
    expect(schoolWide.kind).toBe("role_denied");
  });

  it("refuses a student with no linked record instead of guessing one", async () => {
    const unlinked = { ...ctxStudentRahul, studentId: undefined };
    const result = await authorizeAndExecuteTool(unlinked, "getStudentAttendance", { period: "this_month" });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("not_authorized");
  });
});

describe("Parent — linked children only", () => {
  it("returns the linked child's attendance", async () => {
    const result = await authorizeAndExecuteTool(ctxParentOfRahul, "getChildAttendance", { period: "this_month" });
    expect(result.ok).toBe(true);
    const data = result.result as { studentName: string; studentId: string };
    expect(data.studentName).toBe("Rahul Kumar");
    expect(data.studentId).toBe(RAHUL);
  });

  it("refuses a child who is not linked, without confirming they exist", async () => {
    const result = await authorizeAndExecuteTool(ctxParentOfRahul, "getChildAttendance", {
      childName: "Priya Sharma",
      period: "this_month",
    });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("not_authorized");
    // The refusal must not disclose whether Priya is a real student here.
    expect(result.error).not.toMatch(/Priya/i);
    expect(result.error).not.toMatch(/Class 10 - B/i);
  });

  it("asks which child when a parent has several, rather than picking one", async () => {
    const result = await authorizeAndExecuteTool(ctxParentOfTwo, "getChildAttendance", { period: "this_month" });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("ambiguous");
    expect(result.candidates).toEqual(expect.arrayContaining(["Sneha Roy", "Meera Nair"]));
  });

  it("answers directly when the parent names one of their own children", async () => {
    const result = await authorizeAndExecuteTool(ctxParentOfTwo, "getChildAttendance", {
      childName: "Meera",
      period: "this_month",
    });
    expect(result.ok).toBe(true);
    expect((result.result as { studentName: string }).studentName).toBe("Meera Nair");
  });

  it("uses conversation context to resolve a pronoun, but only within its own links", async () => {
    const withContext = { ...ctxParentOfTwo, conversationStudentId: "stu_meera" };
    const result = await authorizeAndExecuteTool(withContext, "getChildAttendance", { period: "this_month" });
    expect(result.ok).toBe(true);
    expect((result.result as { studentName: string }).studentName).toBe("Meera Nair");
  });

  it("ignores conversation context pointing at a child the parent is not linked to", async () => {
    // A poisoned or stale memory record must never widen access.
    const poisoned = { ...ctxParentOfRahul, conversationStudentId: "stu_priya" };
    const result = await authorizeAndExecuteTool(poisoned, "getChildAttendance", { period: "this_month" });
    expect(result.ok).toBe(true);
    expect((result.result as { studentName: string }).studentName).toBe("Rahul Kumar");
  });

  it("refuses to mark attendance", async () => {
    const result = await authorizeAndExecuteTool(ctxParentOfRahul, "markAttendance", {
      studentName: "Rahul Kumar",
      status: "present",
    });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("role_denied");
  });
});

describe("Teacher — assigned classes only", () => {
  it("reads attendance for a class they teach", async () => {
    const result = await authorizeAndExecuteTool(ctxTeacher10A, "getClassAttendance", {
      className: "Class 10 - A",
      period: "this_month",
    });
    expect(result.ok).toBe(true);
    expect((result.result as { classId: string }).classId).toBe("cls_10a");
  });

  it("refuses a class they do not teach", async () => {
    const result = await authorizeAndExecuteTool(ctxTeacher10A, "getClassAttendance", {
      className: "Class 10 - B",
      period: "this_month",
    });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("not_authorized");
  });

  it("refuses a student outside their classes", async () => {
    const result = await authorizeAndExecuteTool(ctxTeacher10A, "getStudentProfile", {
      studentName: "Priya Sharma",
    });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("not_authorized");
  });

  it("refuses to mark attendance for a student in another class", async () => {
    const result = await authorizeAndExecuteTool(
      ctxTeacher10B,
      "markAttendance",
      { studentName: "Rahul Kumar", status: "absent" },
      true
    );
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("not_authorized");
    // Rahul already has a record for today; the denied write must have left
    // it exactly as it was, not overwritten it.
    const record = fakeDb.peek("attendance", `${RAHUL}_${TODAY}`);
    expect(record).toMatchObject({ status: "present", markedBy: "fixture" });
  });

  it("asks which student when a name matches two of their own", async () => {
    const result = await authorizeAndExecuteTool(ctxTeacher10A, "getStudentProfile", { studentName: "Rahul" });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("ambiguous");
    expect(result.candidates).toEqual(expect.arrayContaining(["Rahul Kumar", "Rahul Verma"]));
  });

  it("refuses school-wide analytics", async () => {
    const result = await authorizeAndExecuteTool(ctxTeacher10A, "getSchoolAttendance", { period: "this_month" });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("role_denied");
  });
});

describe("Principal — own school only", () => {
  it("returns a weighted school-wide roll-up", async () => {
    const result = await authorizeAndExecuteTool(ctxPrincipal, "getSchoolAttendance", { period: "this_month" });
    expect(result.ok).toBe(true);
    const data = result.result as {
      overallPercentage: number;
      perClass: { classId: string; className: string }[];
      classesNeedingAttention: { className: string }[];
    };
    expect(data.perClass.map((c) => c.classId).sort()).toEqual(["cls_10a", "cls_10b"]);
    // Class 10 - B runs materially lower and must surface as the outlier.
    expect(data.classesNeedingAttention[0].className).toBe("Class 10 - B");
  });

  it("weights classes by record count rather than averaging percentages", async () => {
    const result = await authorizeAndExecuteTool(ctxPrincipal, "getSchoolAttendance", { period: "this_month" });
    const data = result.result as { overallPercentage: number; perClass: { percentage: number }[] };
    const naiveMean =
      data.perClass.reduce((sum, c) => sum + c.percentage, 0) / data.perClass.length;
    // The fixture is built so the two differ; if they ever coincide the
    // assertion below is worthless, so assert the difference explicitly.
    expect(Math.abs(data.overallPercentage - naiveMean)).toBeGreaterThan(0.5);
  });

  it("excludes other schools entirely from the roll-up", async () => {
    const result = await authorizeAndExecuteTool(ctxPrincipal, "getSchoolAttendance", { period: "all_time" });
    const data = result.result as { perClass: { classId: string }[] };
    expect(data.perClass.map((c) => c.classId)).not.toContain("cls_rv_9a");
  });

  it("cannot mark attendance", async () => {
    const result = await authorizeAndExecuteTool(ctxPrincipal, "markAttendance", {
      studentName: "Rahul Kumar",
      status: "absent",
    });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("role_denied");
  });
});

describe("Cross-school isolation", () => {
  it("a Riverside principal sees only Riverside classes", async () => {
    const result = await authorizeAndExecuteTool(ctxRiversidePrincipal, "getSchoolAttendance", { period: "all_time" });
    expect(result.ok).toBe(true);
    const data = result.result as { perClass: { classId: string }[] };
    expect(data.perClass.map((c) => c.classId)).toEqual(["cls_rv_9a"]);
  });

  it("a Riverside principal cannot query a Greenfield class by name", async () => {
    const result = await authorizeAndExecuteTool(ctxRiversidePrincipal, "getClassAttendance", {
      className: "Class 10 - A",
      period: "all_time",
    });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("not_authorized");
  });

  it("a Riverside parent cannot reach a Greenfield student", async () => {
    const result = await authorizeAndExecuteTool(ctxRiversideParent, "getChildAttendance", {
      childName: "Rahul Kumar",
      period: "all_time",
    });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("not_authorized");
  });

  it("notices are scoped to the caller's own school", async () => {
    const greenfield = await authorizeAndExecuteTool(ctxPrincipal, "getAnnouncements", {});
    const riverside = await authorizeAndExecuteTool(ctxRiversidePrincipal, "getAnnouncements", {});
    const gfTitles = (greenfield.result as { notices: { title: string }[] }).notices.map((n) => n.title);
    const rvTitles = (riverside.result as { notices: { title: string }[] }).notices.map((n) => n.title);
    expect(gfTitles).toContain("Annual Day");
    expect(gfTitles).not.toContain("Riverside Sports Day");
    expect(rvTitles).toEqual(["Riverside Sports Day"]);
  });

  it("assignments never cross a school boundary", async () => {
    const result = await authorizeAndExecuteTool(ctxStudentRahul, "getAssignments", {});
    const titles = (result.result as { assignments: { title: string }[] }).assignments.map((a) => a.title);
    expect(titles).not.toContain("Cell Structure");
    expect(titles).not.toContain("Trigonometry");
  });
});

describe("Argument validation", () => {
  it("rejects an unknown tool name", async () => {
    const result = await authorizeAndExecuteTool(ctxPrincipal, "dropAllTables", {});
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("unknown_tool");
  });

  it("rejects an invalid enum value rather than coercing it", async () => {
    const result = await authorizeAndExecuteTool(ctxStudentRahul, "getStudentAttendance", { period: "since_forever" });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("invalid_arguments");
  });

  it("rejects an invalid attendance status", async () => {
    const result = await authorizeAndExecuteTool(ctxTeacher10A, "markAttendance", {
      studentName: "Rahul Kumar",
      status: "expelled",
    });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("invalid_arguments");
  });

  it("strips arguments a tool never declared", async () => {
    // Zod object schemas strip unknown keys, so a smuggled schoolId cannot
    // reach a handler even if the model is persuaded to send one.
    const result = await authorizeAndExecuteTool(ctxStudentRahul, "getStudentAttendance", {
      period: "this_month",
      schoolId: "sch_riverside",
      studentId: "stu_priya",
    });
    expect(result.ok).toBe(true);
    expect((result.result as { studentName: string }).studentName).toBe("Rahul Kumar");
  });

  it("rejects a malformed date instead of writing it", async () => {
    const result = await authorizeAndExecuteTool(ctxTeacher10A, "markAttendance", {
      studentName: "Rahul Kumar",
      status: "absent",
      date: "yesterday",
    });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("invalid_arguments");
  });
});
