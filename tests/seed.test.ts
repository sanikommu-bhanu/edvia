// ==========================================================================
// Seed data invariants
// --------------------------------------------------------------------------
// The golden demo, the docs and several eval cases all quote specific seeded
// records by name. These tests assert the properties that make those quotes
// true, so editing the roster breaks a test here rather than breaking a
// live demonstration:
//
//   * the scale the challenge brief asks for actually exists
//   * no two students in one school share a first name — student lookup
//     resolves by first name as a match tier, so a collision turns a
//     confident answer into an "which one do you mean?" mid-demo
//   * no staff member shares a first name with a student, for the same reason
//   * every student has a class, a roll number and a parent invite code
//   * invite codes are unique and point at records that exist
//   * attendance generation is deterministic and produces the percentages
//     the demo script quotes
//
// Nothing here touches Firebase: seedData.mjs is pure description.
// ==========================================================================
import { describe, it, expect } from "vitest";
import {
  ALL_STUDENTS,
  ROSTER,
  STAFF,
  GREENFIELD,
  RIVERSIDE,
  SCHOOL_DAYS,
  CLASS_10A,
  profileFor,
  GRADED_EXAMS,
  scoreFor,
  academicCentreFor,
  schoolDays,
  statusFor,
  buildInviteCodes,
} from "../scripts/seedData.mjs";

const firstName = (fullName: string): string =>
  fullName
    .replace(/^(Mr\.|Mrs\.|Ms\.|Dr\.)\s+/, "")
    .trim()
    .split(" ")[0]
    .toLowerCase();

describe("seed scale", () => {
  it("meets the roster size the brief asks for", () => {
    // 30-50 students, 4-6 classes, 5-10 teachers.
    expect(ALL_STUDENTS.length).toBeGreaterThanOrEqual(30);
    expect(ALL_STUDENTS.length).toBeLessThanOrEqual(50);
    expect(ROSTER.length).toBeGreaterThanOrEqual(4);
    expect(ROSTER.length).toBeLessThanOrEqual(6);
    expect(STAFF.length).toBeGreaterThanOrEqual(5);
    expect(STAFF.length).toBeLessThanOrEqual(10);
  });

  it("seeds a second school so cross-school isolation can be demonstrated", () => {
    const schools = new Set(ALL_STUDENTS.map((s) => s.schoolId));
    expect(schools).toContain(GREENFIELD);
    expect(schools).toContain(RIVERSIDE);
  });

  it("gives every class enough students for a class average to mean something", () => {
    for (const group of ROSTER.filter((g) => g.schoolId === GREENFIELD)) {
      expect(group.students.length).toBeGreaterThanOrEqual(5);
    }
  });
});

describe("name resolution safety", () => {
  it("has no duplicate first names within a school", () => {
    for (const schoolId of [GREENFIELD, RIVERSIDE]) {
      const names = ALL_STUDENTS.filter((s) => s.schoolId === schoolId).map((s) => firstName(s.fullName));
      const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
      expect(duplicates, `ambiguous student first names in ${schoolId}`).toEqual([]);
    }
  });

  it("has no duplicate full names anywhere", () => {
    const names = ALL_STUDENTS.map((s) => s.fullName);
    expect(new Set(names).size).toBe(names.length);
  });

  it("never gives a teacher the same first name as a student in their school", () => {
    for (const staff of STAFF) {
      const clash = ALL_STUDENTS.filter(
        (s) => s.schoolId === staff.schoolId && firstName(s.fullName) === firstName(staff.fullName)
      );
      expect(clash.map((c) => c.fullName), `${staff.fullName} collides with a student`).toEqual([]);
    }
  });

  it("keeps Rahul Kumar unambiguous — the golden demo marks him absent by name", () => {
    const rahuls = ALL_STUDENTS.filter(
      (s) => s.schoolId === GREENFIELD && firstName(s.fullName) === "rahul"
    );
    expect(rahuls).toHaveLength(1);
    expect(rahuls[0].id).toBe("stu_rahul");
    expect(rahuls[0].className).toBe("Class 10 - A");
  });
});

describe("referential integrity", () => {
  it("gives every student a class that exists, a roll number and a school", () => {
    const classIds = new Set(ROSTER.map((g) => g.classId));
    for (const student of ALL_STUDENTS) {
      expect(classIds.has(student.classId)).toBe(true);
      expect(student.rollNumber).toMatch(/^\d{2}$/);
      expect(student.schoolId).toBeTruthy();
    }
  });

  it("gives each student a unique id", () => {
    const ids = ALL_STUDENTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("numbers roll numbers from 01 within each class", () => {
    for (const group of ROSTER) {
      const rolls = ALL_STUDENTS.filter((s) => s.classId === group.classId).map((s) => s.rollNumber);
      expect(rolls[0]).toBe("01");
      expect(new Set(rolls).size).toBe(rolls.length);
    }
  });

  it("assigns every class a class teacher from the staff list", () => {
    for (const group of ROSTER) {
      const teacher = STAFF.find((s) => s.classTeacherOf === group.classId);
      expect(teacher, `no class teacher for ${group.className}`).toBeDefined();
      expect(teacher!.schoolId).toBe(group.schoolId);
    }
  });
});

describe("invite codes", () => {
  const codes = buildInviteCodes();

  it("issues unique codes", () => {
    const values = codes.map((c) => c.code);
    expect(new Set(values).size).toBe(values.length);
  });

  it("issues exactly one parent code per student", () => {
    const parentTargets = codes.filter((c) => c.role === "parent").map((c) => c.studentId);
    expect(new Set(parentTargets).size).toBe(ALL_STUDENTS.length);
    for (const student of ALL_STUDENTS) {
      expect(parentTargets, `no parent code for ${student.fullName}`).toContain(student.id);
    }
  });

  it("lands in the 15-30 parent-relationship band the brief asks for, at minimum", () => {
    expect(codes.filter((c) => c.role === "parent").length).toBeGreaterThanOrEqual(15);
  });

  it("only ever references students and classes that exist", () => {
    const studentIds = new Set(ALL_STUDENTS.map((s) => s.id));
    const classIds = new Set(ROSTER.map((g) => g.classId));
    for (const code of codes) {
      if (code.studentId) expect(studentIds.has(code.studentId), code.code).toBe(true);
      for (const classId of code.classIds ?? []) expect(classIds.has(classId), code.code).toBe(true);
    }
  });

  it("keeps every code inside the school it belongs to", () => {
    const studentSchool = new Map(ALL_STUDENTS.map((s) => [s.id, s.schoolId]));
    const classSchool = new Map(ROSTER.map((g) => [g.classId, g.schoolId]));
    for (const code of codes) {
      if (code.studentId) expect(studentSchool.get(code.studentId)).toBe(code.schoolId);
      for (const classId of code.classIds ?? []) expect(classSchool.get(classId)).toBe(code.schoolId);
    }
  });

  it("issues a teacher code for every class", () => {
    const covered = new Set(codes.flatMap((c) => c.classIds ?? []));
    for (const group of ROSTER) {
      expect(covered.has(group.classId), `no teacher code covers ${group.className}`).toBe(true);
    }
  });

  it("keeps the demo codes the docs and demo script quote", () => {
    const values = codes.map((c) => c.code);
    for (const required of [
      "GISD-STU-RAHUL",
      "GISD-PAR-RAHUL",
      "GISD-PAR-MULTI",
      "GISD-TCH-10A",
      "GISD-PRI-ADMIN",
      "RVPS-PRI-ADMIN",
    ]) {
      expect(values, `${required} is quoted in the docs`).toContain(required);
    }
  });

  it("links GISD-PAR-RAHUL and GISD-PAR-MULTI to two different children of one parent", () => {
    const rahul = codes.find((c) => c.code === "GISD-PAR-RAHUL")!;
    const second = codes.find((c) => c.code === "GISD-PAR-MULTI")!;
    expect(rahul.studentId).not.toBe(second.studentId);
    expect(rahul.schoolId).toBe(second.schoolId);
  });
});

describe("attendance generation", () => {
  // The SAME window and the SAME status function the seeder writes with —
  // imported, not re-implemented. A test that sampled its own synthetic
  // dates could pass while the real seeded ranking had flipped, which is
  // exactly the drift these assertions exist to catch.
  const dates = schoolDays(SCHOOL_DAYS);
  const todayIso = dates[dates.length - 1];

  const percentageFor = (studentId: string): number => {
    const statuses = dates.map((d) => statusFor(studentId, d, todayIso));
    const present = statuses.filter((s) => s === "present").length;
    return (present / statuses.length) * 100;
  };

  it("is deterministic — the same student and date always produce the same status", () => {
    for (const student of ALL_STUDENTS.slice(0, 10)) {
      const first = statusFor(student.id, "2025-05-12", todayIso);
      for (let i = 0; i < 5; i += 1) {
        expect(statusFor(student.id, "2025-05-12", todayIso)).toBe(first);
      }
    }
  });

  it("marks every student present today — the golden demo depends on it", () => {
    for (const student of ALL_STUDENTS) {
      expect(statusFor(student.id, todayIso, todayIso)).toBe("present");
    }
  });

  it("uses weekdays only — schools do not mark weekends", () => {
    for (const date of dates) {
      const day = new Date(date + "T00:00:00Z").getUTCDay();
      expect(day, `${date} is a weekend`).not.toBe(0);
      expect(day, `${date} is a weekend`).not.toBe(6);
    }
  });

  it("gives every student a profile with plausible rates", () => {
    for (const student of ALL_STUDENTS) {
      const profile = profileFor(student.id);
      expect(profile.absentRate).toBeGreaterThan(0);
      expect(profile.absentRate).toBeLessThan(0.4);
      expect(profile.leaveRate).toBeGreaterThanOrEqual(0);
      expect(profile.leaveRate).toBeLessThan(0.1);
    }
  });

  it("keeps Rahul above the 75% policy threshold but not at a flat 100%", () => {
    const pct = percentageFor("stu_rahul");
    expect(pct).toBeGreaterThan(75);
    expect(pct).toBeLessThan(100);
  });

  it("produces at least one student below the 75% threshold, so the alerting has something real to find", () => {
    const below = ALL_STUDENTS.filter((s) => percentageFor(s.id) < 75);
    expect(below.length).toBeGreaterThan(0);
  });

  it("makes classes differ from one another, so 'which class needs attention?' has an answer", () => {
    const averages = ROSTER.filter((g) => g.schoolId === GREENFIELD).map((group) => {
      const pcts = group.students.map((s) => percentageFor(s.id));
      return pcts.reduce((a, b) => a + b, 0) / pcts.length;
    });
    const spread = Math.max(...averages) - Math.min(...averages);
    expect(spread).toBeGreaterThan(2);
  });

  it("keeps Class 10 - B clearly the lowest class, by a margin the demo can rely on", () => {
    // The principal's "which class needs attention?" question resolves to a
    // real answer. That answer must be deliberate, not an accident
    // of derived randomness that flips the next time the roster changes — so
    // both the ordering AND a usable margin are asserted here.
    const ranked = ROSTER.filter((g) => g.schoolId === GREENFIELD)
      .map((group) => ({
        className: group.className,
        average:
          group.students.reduce((sum, s) => sum + percentageFor(s.id), 0) / group.students.length,
      }))
      .sort((a, b) => a.average - b.average);

    expect(ranked[0].className).toBe("Class 10 - B");
    expect(ranked[1].average - ranked[0].average).toBeGreaterThan(1.5);
  });

  it("keeps Class 10 - A the strongest class, so the demo's contrast holds", () => {
    const ranked = ROSTER.filter((g) => g.schoolId === GREENFIELD)
      .map((group) => ({
        className: group.className,
        average:
          group.students.reduce((sum, s) => sum + percentageFor(s.id), 0) / group.students.length,
      }))
      .sort((a, b) => b.average - a.average);
    expect(ranked[0].className).toBe("Class 10 - A");
  });
});

// ==========================================================================
// Graded papers and marks
// ==========================================================================
// The demo asks a student "how am I doing?", a teacher "how is my class
// performing?" and a principal "which subject is weakest?". Every one of
// those has to resolve to a real, stable answer computed from real records —
// so the properties that make them real are asserted here rather than
// discovered on stage.

describe("exam results", () => {
  it("grades every class, so no role lands on an empty Grades screen", () => {
    const gradedClasses = new Set(GRADED_EXAMS.map((e) => e.classId));
    for (const group of ROSTER) {
      expect(gradedClasses.has(group.classId), `${group.className} has no graded paper`).toBe(true);
    }
  });

  it("dates every graded paper in the past — a mark for a future exam is a data error", () => {
    for (const exam of GRADED_EXAMS) {
      expect(exam.back, exam.id).toBeGreaterThan(0);
    }
  });

  it("gives 10-A several subjects, so the per-subject breakdown has something to break down", () => {
    const subjects = new Set(
      GRADED_EXAMS.filter((e) => e.classId === CLASS_10A).map((e) => e.subject)
    );
    expect(subjects.size).toBeGreaterThanOrEqual(3);
  });

  it("uses differing maximum marks, so weighted aggregation differs from a naive mean", () => {
    // If every paper were out of 100 the two formulas would coincide and the
    // seeded data would prove nothing about which one the app uses.
    const maxima = new Set(GRADED_EXAMS.map((e) => e.maxScore));
    expect(maxima.size).toBeGreaterThan(1);
  });

  it("produces a deterministic mark for a given student and paper", () => {
    const first = scoreFor("stu_rahul", "exm_mid_math_10a", 100);
    const second = scoreFor("stu_rahul", "exm_mid_math_10a", 100);
    expect(second).toBe(first);
  });

  it("never produces a mark outside 0..maxScore", () => {
    for (const exam of GRADED_EXAMS) {
      const group = ROSTER.find((g) => g.classId === exam.classId)!;
      for (const student of group.students) {
        const score = scoreFor(student.id, exam.id, exam.maxScore);
        expect(score, `${student.id}/${exam.id}`).toBeGreaterThanOrEqual(0);
        expect(score, `${student.id}/${exam.id}`).toBeLessThanOrEqual(exam.maxScore);
        expect(Number.isInteger(score), `${student.id}/${exam.id}`).toBe(true);
      }
    }
  });

  it("spreads academic ability, so a class average is not everyone scoring the same", () => {
    const group = ROSTER.find((g) => g.classId === CLASS_10A)!;
    const percentages = group.students.map((s) => academicCentreFor(s.id));
    expect(Math.max(...percentages) - Math.min(...percentages)).toBeGreaterThan(20);
  });

  it("keeps academic ability INDEPENDENT of attendance behaviour", () => {
    // A school where the weakest attender is always the weakest performer
    // looks synthetic, because it is — and it removes the interesting
    // question a principal would actually ask. Karan attends poorly and
    // performs well; Vikram does neither.
    expect(profileFor("stu_karan").absentRate).toBeGreaterThan(0.2);
    expect(academicCentreFor("stu_karan")).toBeGreaterThan(80);

    expect(profileFor("stu_vikram").absentRate).toBeGreaterThan(0.2);
    expect(academicCentreFor("stu_vikram")).toBeLessThan(50);
  });
});
