// ==========================================================================
// Test fixtures — two schools, so isolation can be tested, not assumed
// ==========================================================================
// Greenfield is the demo school. Riverside exists purely as a control: every
// cross-school test asserts that a Greenfield account cannot reach Riverside
// data and vice versa. A single-school fixture set can't catch a missing
// schoolId filter, because there is nothing on the other side of it.
// ==========================================================================
import type { TrustedUserContext } from "../../api/_lib/userContext";
import type { DocData } from "./fakeFirestore";

export const GREENFIELD = "sch_greenfield";
export const RIVERSIDE = "sch_riverside";

export const CLASS_10A = "cls_10a";
export const CLASS_10B = "cls_10b";
export const RIVERSIDE_CLASS = "cls_rv_9a";

export const TEACHER_10A_UID = "uid_teacher_10a";
export const TEACHER_10B_UID = "uid_teacher_10b";
export const PARENT_RAHUL_UID = "uid_parent_rahul";
export const PARENT_TWO_KIDS_UID = "uid_parent_two";
export const STUDENT_RAHUL_UID = "uid_student_rahul";
export const PRINCIPAL_UID = "uid_principal_greenfield";
export const RIVERSIDE_PRINCIPAL_UID = "uid_principal_riverside";
export const RIVERSIDE_PARENT_UID = "uid_parent_riverside";

export const RAHUL = "stu_rahul";
export const ARJUN = "stu_arjun";
export const SNEHA = "stu_sneha";
export const MEERA = "stu_meera";
export const PRIYA_10B = "stu_priya";
export const ANANYA_RIVERSIDE = "stu_rv_ananya";

/** Fixed "today" so period maths and assertions are stable across runs. */
export const TODAY = "2026-05-20";

export function daysBefore(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// --------------------------------------------------------------------------
// Trusted contexts — what resolveUserContext() would produce for each account
// --------------------------------------------------------------------------

export const ctxStudentRahul: TrustedUserContext = {
  uid: STUDENT_RAHUL_UID,
  role: "student",
  schoolId: GREENFIELD,
  studentId: RAHUL,
  classIds: [CLASS_10A],
  language: "en",
};

export const ctxParentOfRahul: TrustedUserContext = {
  uid: PARENT_RAHUL_UID,
  role: "parent",
  schoolId: GREENFIELD,
  linkedStudentIds: [RAHUL],
  classIds: [CLASS_10A],
  language: "en",
};

/** A parent with two children — the ambiguity path. */
export const ctxParentOfTwo: TrustedUserContext = {
  uid: PARENT_TWO_KIDS_UID,
  role: "parent",
  schoolId: GREENFIELD,
  linkedStudentIds: [SNEHA, MEERA],
  classIds: [CLASS_10A],
  language: "en",
};

export const ctxTeacher10A: TrustedUserContext = {
  uid: TEACHER_10A_UID,
  role: "teacher",
  schoolId: GREENFIELD,
  teacherId: TEACHER_10A_UID,
  teacherClassIds: [CLASS_10A],
  classIds: [CLASS_10A],
  language: "en",
};

export const ctxTeacher10B: TrustedUserContext = {
  uid: TEACHER_10B_UID,
  role: "teacher",
  schoolId: GREENFIELD,
  teacherId: TEACHER_10B_UID,
  teacherClassIds: [CLASS_10B],
  classIds: [CLASS_10B],
  language: "en",
};

export const ctxPrincipal: TrustedUserContext = {
  uid: PRINCIPAL_UID,
  role: "principal",
  schoolId: GREENFIELD,
  // The server-written GRANT. Without this, `role: "principal"` is only the
  // request the user made on the signup screen — see ctxUnverifiedPrincipal.
  principalOfSchoolId: GREENFIELD,
  classIds: [],
  language: "en",
};

/**
 * Someone who signed up, chose "Principal / Admin", picked a real school and
 * never redeemed a code. This is the CRIT-01 attacker: the profile says
 * principal, but no server-written grant backs it.
 *
 * In production resolveUserContext refuses to build this context at all;
 * the fixture exists so the tool layer can be proven to refuse it too, which
 * is the defence-in-depth that matters if the context layer is ever bypassed.
 */
export const ctxUnverifiedPrincipal: TrustedUserContext = {
  uid: "uid_self_declared_principal",
  role: "principal",
  schoolId: GREENFIELD,
  classIds: [],
  language: "en",
};

/** A verified principal of Riverside pointing their grant at another school. */
export const ctxForgedPrincipalGrant: TrustedUserContext = {
  uid: "uid_forged_grant",
  role: "principal",
  schoolId: GREENFIELD,
  principalOfSchoolId: RIVERSIDE,
  classIds: [],
  language: "en",
};

export const ctxRiversidePrincipal: TrustedUserContext = {
  uid: RIVERSIDE_PRINCIPAL_UID,
  role: "principal",
  schoolId: RIVERSIDE,
  principalOfSchoolId: RIVERSIDE,
  classIds: [],
  language: "en",
};

export const ctxRiversideParent: TrustedUserContext = {
  uid: RIVERSIDE_PARENT_UID,
  role: "parent",
  schoolId: RIVERSIDE,
  linkedStudentIds: [ANANYA_RIVERSIDE],
  classIds: [RIVERSIDE_CLASS],
  language: "en",
};

// --------------------------------------------------------------------------
// Firestore fixture data
// --------------------------------------------------------------------------

const students: Record<string, DocData> = {
  [RAHUL]: { fullName: "Rahul Kumar", rollNumber: "01", classId: CLASS_10A, className: "Class 10 - A", section: "A", schoolId: GREENFIELD },
  [ARJUN]: { fullName: "Arjun Patel", rollNumber: "02", classId: CLASS_10A, className: "Class 10 - A", section: "A", schoolId: GREENFIELD },
  [SNEHA]: { fullName: "Sneha Roy", rollNumber: "03", classId: CLASS_10A, className: "Class 10 - A", section: "A", schoolId: GREENFIELD },
  [MEERA]: { fullName: "Meera Nair", rollNumber: "05", classId: CLASS_10A, className: "Class 10 - A", section: "A", schoolId: GREENFIELD },
  // Two students called Rahul in the same class — the disambiguation path.
  stu_rahul_verma: { fullName: "Rahul Verma", rollNumber: "07", classId: CLASS_10A, className: "Class 10 - A", section: "A", schoolId: GREENFIELD },
  [PRIYA_10B]: { fullName: "Priya Sharma", rollNumber: "01", classId: CLASS_10B, className: "Class 10 - B", section: "B", schoolId: GREENFIELD },
  [ANANYA_RIVERSIDE]: { fullName: "Ananya Bose", rollNumber: "01", classId: RIVERSIDE_CLASS, className: "Class 9 - A", section: "A", schoolId: RIVERSIDE },
};

const classes: Record<string, DocData> = {
  [CLASS_10A]: { className: "Class 10 - A", schoolId: GREENFIELD, teacherId: TEACHER_10A_UID },
  [CLASS_10B]: { className: "Class 10 - B", schoolId: GREENFIELD, teacherId: TEACHER_10B_UID },
  [RIVERSIDE_CLASS]: { className: "Class 9 - A", schoolId: RIVERSIDE, teacherId: "uid_teacher_riverside" },
};

/** Builds a deterministic attendance history ending at TODAY. */
function attendanceFixture(): Record<string, DocData> {
  const records: Record<string, DocData> = {};

  const add = (studentId: string, classId: string, schoolId: string, date: string, status: string) => {
    records[`${studentId}_${date}`] = {
      studentId,
      classId,
      schoolId,
      status,
      date,
      markedBy: "fixture",
      markedAt: `${date}T09:00:00.000Z`,
      previousStatus: null,
    };
  };

  // Rahul: 10 days, 8 present / 1 absent / 1 leave → (8 + 0.5) / 10 = 85%.
  const rahulPattern = ["present", "present", "absent", "present", "present", "leave", "present", "present", "present", "present"];
  rahulPattern.forEach((status, i) => add(RAHUL, CLASS_10A, GREENFIELD, daysBefore(TODAY, 9 - i), status));

  // Arjun: all present across the same window.
  for (let i = 0; i < 10; i += 1) add(ARJUN, CLASS_10A, GREENFIELD, daysBefore(TODAY, 9 - i), "present");

  // Sneha and Meera: short histories, enough to answer for either child.
  for (let i = 0; i < 4; i += 1) add(SNEHA, CLASS_10A, GREENFIELD, daysBefore(TODAY, 3 - i), "present");
  for (let i = 0; i < 4; i += 1) add(MEERA, CLASS_10A, GREENFIELD, daysBefore(TODAY, 3 - i), i === 0 ? "absent" : "present");

  // 10-B runs materially lower, so the principal roll-up has a real outlier
  // and the weighted average differs from a naive per-class mean.
  const priyaPattern = ["absent", "absent", "present", "present", "absent", "present"];
  priyaPattern.forEach((status, i) => add(PRIYA_10B, CLASS_10B, GREENFIELD, daysBefore(TODAY, 5 - i), status));

  // Riverside — must never appear in a Greenfield result.
  for (let i = 0; i < 5; i += 1) {
    add(ANANYA_RIVERSIDE, RIVERSIDE_CLASS, RIVERSIDE, daysBefore(TODAY, 4 - i), "present");
  }

  return records;
}

export const fixtureData: Record<string, Record<string, DocData>> = {
  schools: {
    [GREENFIELD]: { name: "Greenfield International School", location: "Bengaluru, Karnataka" },
    [RIVERSIDE]: { name: "Riverside Public School", location: "Pune, Maharashtra" },
  },
  students,
  classes,
  attendance: attendanceFixture(),
  assignments: {
    asg_10a_1: { subject: "Mathematics", title: "Quadratic Equations", dueDate: "2026-05-24", status: "pending", classId: CLASS_10A, schoolId: GREENFIELD },
    asg_10a_2: { subject: "Physics", title: "Lab Report", dueDate: "2026-05-28", status: "pending", classId: CLASS_10A, schoolId: GREENFIELD },
    asg_10b_1: { subject: "Mathematics", title: "Trigonometry", dueDate: "2026-05-26", status: "pending", classId: CLASS_10B, schoolId: GREENFIELD },
    asg_rv_1: { subject: "Biology", title: "Cell Structure", dueDate: "2026-05-25", status: "pending", classId: RIVERSIDE_CLASS, schoolId: RIVERSIDE },
  },
  exams: {
    exm_10a_1: { title: "Science Test", subject: "Science", date: "2026-05-24", status: "upcoming", classId: CLASS_10A, schoolId: GREENFIELD },
  },
  classSubjects: {
    sub_10a_1: { subject: "Mathematics", teacherName: "Mr. Arjun Singh", room: "101", schedule: "08:00", classId: CLASS_10A, schoolId: GREENFIELD },
  },
  notices: {
    not_1: { title: "Annual Day", body: "Annual Day is next month.", category: "school", date: "2026-05-18", schoolId: GREENFIELD },
    not_rv: { title: "Riverside Sports Day", body: "Riverside only.", category: "school", date: "2026-05-19", schoolId: RIVERSIDE },
  },
  resources: {
    res_1: { title: "Physics Notes", type: "notes", subject: "Physics", url: "", uploadedAt: "2026-05-01", schoolId: GREENFIELD },
  },
  schoolAnalytics: {
    [GREENFIELD]: { totalStudents: 6, totalTeachers: 4, totalClasses: 2, updatedAt: "2026-05-20T00:00:00.000Z" },
    [RIVERSIDE]: { totalStudents: 1, totalTeachers: 1, totalClasses: 1, updatedAt: "2026-05-20T00:00:00.000Z" },
  },
  "policies/sch_greenfield/sections": {
    attendance: {
      title: "Attendance Policy",
      section: "4.2",
      content:
        "Students must maintain a minimum of 75% attendance per term to be eligible to sit for term-end examinations.",
      keywords: ["attendance", "minimum", "percentage", "eligibility"],
    },
  },
  notifications: {},
  supportRequests: {},
  auditLogs: {},
  conversationMemory: {},
};
