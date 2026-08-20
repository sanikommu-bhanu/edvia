// ==========================================================================
// Grades — calculation, idempotency and the authorization matrix
// ==========================================================================
// Three bug classes this file exists to prevent, in order of how badly each
// one damages trust:
//
//   1. A mark reaching someone who may not see it. Exam results are the most
//      sensitive academic record a school holds; a classmate reading them is
//      not a bug report, it is an incident.
//   2. A paper counted twice. examResults is keyed `${examId}_${studentId}`
//      for the same reason attendance is keyed by student-day: a teacher
//      correcting a typo must AMEND the record, not append a second one that
//      silently skews every average the school computes.
//   3. Two "averages". The screen, the server and the assistant must all
//      compute the aggregate the same way — weighted by maximum marks, not
//      as a mean of percentages.
//
// Everything below runs against the real authorizeAndExecuteTool path, so a
// pass means the shipped boundary held rather than a re-implementation
// agreeing with itself.
// ==========================================================================
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { authorizeAndExecuteTool } from "../api/_lib/tools/execute";
import { GEMINI_TOOL_DECLARATIONS } from "../api/_lib/tools/index";
import { isActionTool } from "../api/_lib/tools/actionTools";
import { recordExamResult as recordExamResultTool } from "../api/_lib/tools/gradeTools";
import {
  getStudentGrades,
  getClassGrades,
  getSchoolPerformanceAnalytics,
  recordExamResult,
  recordClassExamResults,
  InvalidScoreError,
} from "../api/_lib/school/grades";
import {
  aggregateBy,
  bandFor,
  examResultId,
  meanPercentage,
  percentageFor,
  validateScore,
  weightedAggregate,
} from "../src/lib/gradeMath";
import { freezeClock, unfreezeClock, resetFixtures, fakeDb } from "./support/harness";
import {
  ctxStudentRahul,
  ctxParentOfRahul,
  ctxParentOfTwo,
  ctxTeacher10A,
  ctxTeacher10B,
  ctxPrincipal,
  ctxUnverifiedPrincipal,
  ctxRiversidePrincipal,
  ctxRiversideParent,
  RAHUL,
  ARJUN,
  PRIYA_10B,
  CLASS_10A,
  GREENFIELD,
  EXAM_10A_SCIENCE,
  EXAM_10A_MATHS,
  EXAM_10B_MATHS,
} from "./support/fixtures";

freezeClock();
afterAll(unfreezeClock);
beforeEach(resetFixtures);

// ==========================================================================
// The maths
// ==========================================================================

describe("percentage", () => {
  it("computes a mark as a percentage, to one decimal place", () => {
    expect(percentageFor(41, 50)).toBe(82);
    expect(percentageFor(37, 60)).toBe(61.7);
  });

  it("returns 0 rather than NaN or Infinity for an impossible denominator", () => {
    // A NaN reaching a chart renders as an empty bar, which looks exactly
    // like a genuine zero. Neither is acceptable; 0 with `noRecords` beside
    // it is the honest pair.
    expect(percentageFor(10, 0)).toBe(0);
    expect(percentageFor(Number.NaN, 50)).toBe(0);
  });

  it("scores full marks at 100 and a blank paper at 0", () => {
    expect(percentageFor(50, 50)).toBe(100);
    expect(percentageFor(0, 50)).toBe(0);
  });
});

describe("weighted aggregation", () => {
  it("weights by maximum marks, not by paper count", () => {
    // 90/100 and 5/10: the mean of the percentages is 70, but the student
    // scored 95 out of a possible 110 — which is 86.4%, not 70%. Reporting
    // 70% would understate a strong student because of one small test.
    const results = [
      { score: 90, maxScore: 100 },
      { score: 5, maxScore: 10 },
    ];
    expect(weightedAggregate(results).percentage).toBe(86.4);
    expect(meanPercentage(results.map((r) => percentageFor(r.score, r.maxScore)))).toBe(70);
  });

  it("reports the underlying totals so a UI can show '95 / 110'", () => {
    const agg = weightedAggregate([
      { score: 90, maxScore: 100 },
      { score: 5, maxScore: 10 },
    ]);
    expect(agg).toMatchObject({ totalScore: 95, totalMax: 110, count: 2 });
  });

  it("ignores results with a zero maximum instead of poisoning the total", () => {
    const agg = weightedAggregate([
      { score: 40, maxScore: 50 },
      { score: 0, maxScore: 0 },
    ]);
    expect(agg.count).toBe(1);
    expect(agg.percentage).toBe(80);
  });

  it("returns 0% for an empty set rather than dividing by a fabricated 1", () => {
    expect(weightedAggregate([]).percentage).toBe(0);
    expect(meanPercentage([])).toBe(0);
  });

  it("groups by an arbitrary key and aggregates each group independently", () => {
    const grouped = aggregateBy(
      [
        { subject: "Maths", score: 40, maxScore: 50 },
        { subject: "Maths", score: 30, maxScore: 50 },
        { subject: "English", score: 45, maxScore: 50 },
      ],
      (r) => r.subject
    );
    expect(grouped.find((g) => g.key === "Maths")?.percentage).toBe(70);
    expect(grouped.find((g) => g.key === "English")?.percentage).toBe(90);
  });
});

describe("performance bands", () => {
  it("bands a percentage into the label the badge and the assistant share", () => {
    expect(bandFor(92)).toBe("excellent");
    expect(bandFor(85)).toBe("excellent"); // inclusive lower bound
    expect(bandFor(84.9)).toBe("good");
    expect(bandFor(70)).toBe("good");
    expect(bandFor(69.9)).toBe("satisfactory");
    expect(bandFor(50)).toBe("satisfactory");
    expect(bandFor(49.9)).toBe("needs_support");
    expect(bandFor(0)).toBe("needs_support");
  });
});

describe("score validation", () => {
  it("rejects a negative mark", () => {
    expect(validateScore(-1, 50).valid).toBe(false);
  });

  it("rejects a mark above the maximum", () => {
    const check = validateScore(60, 50);
    expect(check.valid).toBe(false);
    expect(check.reason).toContain("higher than the maximum");
  });

  it("rejects a non-positive maximum", () => {
    expect(validateScore(10, 0).valid).toBe(false);
    expect(validateScore(10, -5).valid).toBe(false);
  });

  it("accepts the boundaries — 0 and full marks are both real results", () => {
    expect(validateScore(0, 50).valid).toBe(true);
    expect(validateScore(50, 50).valid).toBe(true);
  });
});

// ==========================================================================
// Idempotency
// ==========================================================================

describe("Idempotency", () => {
  it("uses examId_studentId as the document id", () => {
    expect(examResultId(EXAM_10A_SCIENCE, RAHUL)).toBe(`${EXAM_10A_SCIENCE}_${RAHUL}`);
  });

  it("amends the existing result instead of appending a second one", async () => {
    const before = fakeDb.peekAll("examResults").length;

    await recordExamResult({
      examId: EXAM_10A_SCIENCE,
      examTitle: "Science Test",
      examDate: "2026-05-10",
      subject: "Science",
      studentId: RAHUL,
      studentName: "Rahul Kumar",
      classId: CLASS_10A,
      schoolId: GREENFIELD,
      score: 44,
      maxScore: 50,
      recordedBy: ctxTeacher10A.uid,
    });

    expect(fakeDb.peekAll("examResults")).toHaveLength(before);
    expect(fakeDb.peek("examResults", examResultId(EXAM_10A_SCIENCE, RAHUL))).toMatchObject({
      score: 44,
      previousScore: 40,
      recordedBy: ctxTeacher10A.uid,
    });
  });

  it("keeps the aggregate stable when the same marks are saved twice", async () => {
    const entry = {
      examId: EXAM_10A_SCIENCE,
      examTitle: "Science Test",
      examDate: "2026-05-10",
      subject: "Science",
      studentId: RAHUL,
      studentName: "Rahul Kumar",
      classId: CLASS_10A,
      schoolId: GREENFIELD,
      score: 45,
      maxScore: 50,
      recordedBy: "t",
    };

    await recordClassExamResults([entry]);
    const first = await getStudentGrades(RAHUL, GREENFIELD);
    await recordClassExamResults([entry]);
    const second = await getStudentGrades(RAHUL, GREENFIELD);

    expect(second.overall.count).toBe(first.overall.count);
    expect(second.overall.percentage).toBe(first.overall.percentage);
  });

  it("reports how many marks a bulk save actually changed", async () => {
    const base = {
      examId: EXAM_10A_SCIENCE,
      examTitle: "Science Test",
      examDate: "2026-05-10",
      subject: "Science",
      classId: CLASS_10A,
      schoolId: GREENFIELD,
      maxScore: 50,
      recordedBy: "t",
    };

    const changed = await recordClassExamResults([
      { ...base, studentId: RAHUL, studentName: "Rahul Kumar", score: 47 },
    ]);
    expect(changed).toEqual({ written: 1, amended: 1 });

    const unchanged = await recordClassExamResults([
      { ...base, studentId: RAHUL, studentName: "Rahul Kumar", score: 47 },
    ]);
    expect(unchanged).toEqual({ written: 1, amended: 0 });
  });

  it("preserves createdAt across an amendment", async () => {
    const original = fakeDb.peek("examResults", examResultId(EXAM_10A_SCIENCE, RAHUL));
    await recordExamResult({
      examId: EXAM_10A_SCIENCE,
      examTitle: "Science Test",
      examDate: "2026-05-10",
      subject: "Science",
      studentId: RAHUL,
      studentName: "Rahul Kumar",
      classId: CLASS_10A,
      schoolId: GREENFIELD,
      score: 30,
      maxScore: 50,
      recordedBy: "t",
    });
    const amended = fakeDb.peek("examResults", examResultId(EXAM_10A_SCIENCE, RAHUL));
    expect(amended?.createdAt).toBe(original?.createdAt);
  });
});

// ==========================================================================
// Invalid input, at every layer
// ==========================================================================

describe("Invalid marks are refused at the service, not just the UI", () => {
  const base = {
    examId: EXAM_10A_SCIENCE,
    examTitle: "Science Test",
    examDate: "2026-05-10",
    subject: "Science",
    studentId: RAHUL,
    studentName: "Rahul Kumar",
    classId: CLASS_10A,
    schoolId: GREENFIELD,
    recordedBy: "t",
  };

  it("refuses a score above the maximum", async () => {
    await expect(recordExamResult({ ...base, score: 60, maxScore: 50 })).rejects.toBeInstanceOf(
      InvalidScoreError
    );
  });

  it("refuses a negative score", async () => {
    await expect(recordExamResult({ ...base, score: -5, maxScore: 50 })).rejects.toBeInstanceOf(
      InvalidScoreError
    );
  });

  it("refuses a whole batch if any single mark is invalid", async () => {
    const before = fakeDb.peek("examResults", examResultId(EXAM_10A_SCIENCE, ARJUN));
    await expect(
      recordClassExamResults([
        { ...base, studentId: ARJUN, studentName: "Arjun Patel", score: 10, maxScore: 50 },
        { ...base, studentId: RAHUL, studentName: "Rahul Kumar", score: 999, maxScore: 50 },
      ])
    ).rejects.toBeInstanceOf(InvalidScoreError);
    // Nothing partially written — the valid row in the batch didn't land.
    expect(fakeDb.peek("examResults", examResultId(EXAM_10A_SCIENCE, ARJUN))).toEqual(before);
  });

  it("refuses an out-of-range mark through the AI tool too", async () => {
    const result = await authorizeAndExecuteTool(
      ctxTeacher10A,
      "recordExamResult",
      { studentName: "Rahul Kumar", examTitle: "Science Test", score: 80, maxScore: 50 },
      true
    );
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("not_authorized");
  });

  it("rejects a negative score at the schema, before any handler runs", async () => {
    const result = await authorizeAndExecuteTool(
      ctxTeacher10A,
      "recordExamResult",
      { studentName: "Rahul Kumar", examTitle: "Science Test", score: -10, maxScore: 50 },
      true
    );
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("invalid_arguments");
  });
});

// ==========================================================================
// Authorization — who may read whose marks
// ==========================================================================

describe("Student — own marks only", () => {
  it("returns the signed-in student's own results", async () => {
    const result = await authorizeAndExecuteTool(ctxStudentRahul, "getStudentGrades", {});
    expect(result.ok).toBe(true);
    const data = result.result as { studentName: string; overall: { percentage: number } };
    expect(data.studentName).toBe("Rahul Kumar");
    // 40/50 (Science) + 72/100 (Maths) = 112/150 → 74.7%
    expect(data.overall.percentage).toBe(74.7);
  });

  it("declares no argument through which another student could be named", () => {
    // Structural, not a runtime check: the schema has no studentName field,
    // so there is no phrasing and no jailbreak that widens the subject.
    const declared = GEMINI_TOOL_DECLARATIONS.find((d) => d.name === "getStudentGrades");
    expect(Object.keys(declared?.parameters?.properties ?? {})).toEqual(["subject"]);
  });

  it("silently ignores an extra studentName argument rather than honouring it", async () => {
    const result = await authorizeAndExecuteTool(ctxStudentRahul, "getStudentGrades", {
      studentName: "Priya Sharma",
    });
    expect(result.ok).toBe(true);
    expect((result.result as { studentName: string }).studentName).toBe("Rahul Kumar");
  });

  it("refuses a student the parent tool", async () => {
    const result = await authorizeAndExecuteTool(ctxStudentRahul, "getChildGrades", {});
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("role_denied");
  });

  it("refuses a student the class tool", async () => {
    const result = await authorizeAndExecuteTool(ctxStudentRahul, "getClassGrades", {});
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("role_denied");
  });

  it("refuses a student the write tool", async () => {
    const result = await authorizeAndExecuteTool(
      ctxStudentRahul,
      "recordExamResult",
      { studentName: "Rahul Kumar", examTitle: "Science Test", score: 50, maxScore: 50 },
      true
    );
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("role_denied");
  });
});

describe("Parent — linked children only", () => {
  it("returns their own child's results", async () => {
    const result = await authorizeAndExecuteTool(ctxParentOfRahul, "getChildGrades", {});
    expect(result.ok).toBe(true);
    expect((result.result as { studentName: string }).studentName).toBe("Rahul Kumar");
  });

  it("refuses a child who isn't theirs, without confirming that child exists", async () => {
    const result = await authorizeAndExecuteTool(ctxParentOfRahul, "getChildGrades", {
      childName: "Priya Sharma",
    });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("not_authorized");
    // The message must not disclose whether Priya is a student here.
    expect(result.error).not.toContain("Priya");
  });

  it("asks which child when the parent has several and names none", async () => {
    const result = await authorizeAndExecuteTool(ctxParentOfTwo, "getChildGrades", {});
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("ambiguous");
    expect(result.candidates).toEqual(expect.arrayContaining(["Sneha Roy", "Meera Nair"]));
  });

  it("refuses a parent at another school their own child's out-of-school lookup", async () => {
    // Riverside parent, Riverside child — allowed, but must never surface a
    // Greenfield record.
    const result = await authorizeAndExecuteTool(ctxRiversideParent, "getChildGrades", {
      childName: "Rahul Kumar",
    });
    expect(result.ok).toBe(false);
  });
});

describe("Teacher — their own classes only", () => {
  it("returns the class average for a class they teach", async () => {
    const result = await authorizeAndExecuteTool(ctxTeacher10A, "getClassGrades", {});
    expect(result.ok).toBe(true);
    const data = result.result as { classId: string; students: { studentName: string }[] };
    expect(data.classId).toBe(CLASS_10A);
    expect(data.students.map((s) => s.studentName)).toEqual(
      expect.arrayContaining(["Rahul Kumar", "Arjun Patel"])
    );
  });

  it("refuses a class they are not assigned to", async () => {
    const result = await authorizeAndExecuteTool(ctxTeacher10A, "getClassGrades", {
      className: "Class 10 - B",
    });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("not_authorized");
  });

  it("refuses to record a mark for a student in another teacher's class", async () => {
    const result = await authorizeAndExecuteTool(
      ctxTeacher10B,
      "recordExamResult",
      { studentName: "Rahul Kumar", examTitle: "Science Test", score: 40, maxScore: 50 },
      true
    );
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("not_authorized");
    expect(fakeDb.peek("examResults", examResultId(EXAM_10A_SCIENCE, RAHUL))).toMatchObject({
      score: 40,
    });
  });

  it("refuses an exam that belongs to a different class", async () => {
    // 10-B's maths paper, asked for by 10-A's teacher about a 10-A student.
    const result = await authorizeAndExecuteTool(
      ctxTeacher10A,
      "recordExamResult",
      { studentName: "Rahul Kumar", examTitle: "Maths Test 10B", score: 40, maxScore: 50 },
      true
    );
    expect(result.ok).toBe(false);
    expect(fakeDb.peek("examResults", examResultId(EXAM_10B_MATHS, RAHUL))).toBeUndefined();
  });

  it("refuses an exam that doesn't exist", async () => {
    const result = await authorizeAndExecuteTool(
      ctxTeacher10A,
      "recordExamResult",
      { studentName: "Rahul Kumar", examTitle: "Astrophysics Finals", score: 40, maxScore: 50 },
      true
    );
    expect(result.ok).toBe(false);
  });

  it("refuses a student who doesn't exist", async () => {
    const result = await authorizeAndExecuteTool(
      ctxTeacher10A,
      "recordExamResult",
      { studentName: "Nobody Atall", examTitle: "Science Test", score: 40, maxScore: 50 },
      true
    );
    expect(result.ok).toBe(false);
  });

  it("records a mark for their own student, and reports what changed", async () => {
    const result = await authorizeAndExecuteTool(
      ctxTeacher10A,
      "recordExamResult",
      { studentName: "Arjun Patel", examTitle: "Science Test", score: 49, maxScore: 50 },
      true
    );
    expect(result.ok).toBe(true);
    expect(result.result).toMatchObject({
      studentName: "Arjun Patel",
      score: 49,
      maxScore: 50,
      percentage: 98,
      previousScore: 46,
      changed: true,
    });
  });
});

describe("Confirmation — nothing is written on the first ask", () => {
  it("returns a preview naming the CURRENT mark instead of writing", async () => {
    const result = await authorizeAndExecuteTool(ctxTeacher10A, "recordExamResult", {
      studentName: "Rahul Kumar",
      examTitle: "Science Test",
      score: 48,
      maxScore: 50,
    });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("needs_confirmation");
    // The preview READ the record first — that is the difference between a
    // scripted confirmation and an honest one.
    expect(result.preview?.summary).toContain("currently recorded at 40/50");
    expect(fakeDb.peek("examResults", examResultId(EXAM_10A_SCIENCE, RAHUL))).toMatchObject({
      score: 40,
    });
  });

  it("flags a re-save of an identical mark as a no-op", async () => {
    expect(isActionTool(recordExamResultTool)).toBe(true);
    const preview = await recordExamResultTool.preview(ctxTeacher10A, {
      studentName: "Rahul Kumar",
      examTitle: "Science Test",
      score: 40,
      maxScore: 50,
    });
    expect(preview.noOp).toBe(true);
  });

  it("refuses an unauthorized target at preview time, before any confirmation", async () => {
    const result = await authorizeAndExecuteTool(ctxTeacher10B, "recordExamResult", {
      studentName: "Rahul Kumar",
      examTitle: "Science Test",
      score: 10,
      maxScore: 50,
    });
    expect(result.kind).not.toBe("needs_confirmation");
    expect(result.ok).toBe(false);
  });
});

describe("Principal — verified management only", () => {
  it("returns school-wide performance for a verified principal", async () => {
    const result = await authorizeAndExecuteTool(ctxPrincipal, "getSchoolPerformance", {});
    expect(result.ok).toBe(true);
    const data = result.result as {
      perClass: { classId: string }[];
      overallPercentage: number;
      resultCount: number;
    };
    expect(data.resultCount).toBeGreaterThan(0);
    expect(data.perClass.map((c) => c.classId)).toEqual(
      expect.arrayContaining([CLASS_10A, "cls_10b"])
    );
  });

  it("refuses a SELF-DECLARED principal — role is a request, not a grant", async () => {
    const result = await authorizeAndExecuteTool(ctxUnverifiedPrincipal, "getSchoolPerformance", {});
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("not_authorized");
  });

  it("never includes another school's results in the roll-up", async () => {
    const greenfield = await getSchoolPerformanceAnalytics(GREENFIELD);
    const riverside = await getSchoolPerformanceAnalytics("sch_riverside");
    expect(greenfield.perClass.map((c) => c.classId)).not.toContain("cls_rv_9a");
    expect(riverside.perClass.every((c) => c.classId === "cls_rv_9a")).toBe(true);
  });

  it("refuses another school's principal the class breakdown", async () => {
    const result = await authorizeAndExecuteTool(ctxRiversidePrincipal, "getClassGrades", {
      className: "Class 10 - A",
    });
    expect(result.ok).toBe(false);
  });

  it("weights the school figure by marks rather than averaging class averages", async () => {
    const school = await getSchoolPerformanceAnalytics(GREENFIELD);
    const naive = meanPercentage(school.perClass.map((c) => c.percentage));
    // Class sizes differ in the fixtures, so the two must not coincide —
    // if they did, this test would not be proving anything.
    expect(school.overallPercentage).not.toBe(naive);
  });
});

// ==========================================================================
// Cross-school isolation at the service layer
// ==========================================================================

describe("School boundary", () => {
  it("filters out a result belonging to another school even for a valid studentId", async () => {
    // Same studentId, wrong school: the service must return nothing rather
    // than trusting that the layer above checked.
    const wrongSchool = await getStudentGrades(RAHUL, "sch_riverside");
    expect(wrongSchool.noRecords).toBe(true);
    expect(wrongSchool.overall.count).toBe(0);
  });

  it("filters a class query by school as well as by classId", async () => {
    const wrongSchool = await getClassGrades(CLASS_10A, "sch_riverside");
    expect(wrongSchool.noRecords).toBe(true);
  });

  it("keeps Priya's 10-B result out of a 10-A class query", async () => {
    const classA = await getClassGrades(CLASS_10A, GREENFIELD);
    expect(classA.students.map((s) => s.studentId)).not.toContain(PRIYA_10B);
  });
});

// ==========================================================================
// Grounding
// ==========================================================================

describe("No data is said, not guessed", () => {
  it("reports no-data rather than 0% for a student with nothing recorded", async () => {
    const nothing = await getStudentGrades("stu_nobody", GREENFIELD);
    expect(nothing.noRecords).toBe(true);
    // 0 is what the number has to be; noRecords is what makes it honest.
    expect(nothing.overall.percentage).toBe(0);
    expect(nothing.overall.count).toBe(0);
  });

  it("returns kind 'no_data' from the tool, not a fabricated aggregate", async () => {
    const result = await authorizeAndExecuteTool(ctxStudentRahul, "getStudentGrades", {
      subject: "Astrophysics",
    });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("no_data");
  });
});

// ==========================================================================
// One implementation, two consumers
// ==========================================================================

describe("The server and the client compute the same aggregate", () => {
  it("matches gradeMath.weightedAggregate exactly", async () => {
    const server = await getStudentGrades(RAHUL, GREENFIELD);
    const recomputed = weightedAggregate([
      { score: 40, maxScore: 50 },
      { score: 72, maxScore: 100 },
    ]);
    expect(server.overall.percentage).toBe(recomputed.percentage);
    expect(server.overall.totalScore).toBe(recomputed.totalScore);
    expect(server.overall.totalMax).toBe(recomputed.totalMax);
  });

  it("bands the aggregate with the same function the badge uses", async () => {
    const server = await getStudentGrades(RAHUL, GREENFIELD);
    expect(server.band).toBe(bandFor(server.overall.percentage));
  });

  it("breaks a student down by subject, strongest first", async () => {
    const server = await getStudentGrades(RAHUL, GREENFIELD);
    const percentages = server.bySubject.map((s) => s.percentage);
    expect([...percentages].sort((a, b) => b - a)).toEqual(percentages);
    expect(server.bySubject.map((s) => s.subject)).toEqual(
      expect.arrayContaining(["Science", "Mathematics"])
    );
  });

  it("orders a class weakest-student-first — the list a teacher acts on", async () => {
    const klass = await getClassGrades(CLASS_10A, GREENFIELD);
    const percentages = klass.students.map((s) => s.percentage);
    expect([...percentages].sort((a, b) => a - b)).toEqual(percentages);
  });
});

// ==========================================================================
// The exam fixture ids used above exist
// ==========================================================================

describe("fixtures", () => {
  it("has a maths paper for 10-A distinct from 10-B's", () => {
    expect(EXAM_10A_MATHS).not.toBe(EXAM_10B_MATHS);
    expect(fakeDb.peek("exams", EXAM_10A_MATHS)?.classId).toBe(CLASS_10A);
  });
});
