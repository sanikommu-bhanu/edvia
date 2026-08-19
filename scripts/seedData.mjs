// ==========================================================================
// EDVIA — seed reference data
// ==========================================================================
// The pure, side-effect-free description of the demo school: schools, staff,
// classes, roster, attendance behaviour and invite codes.
//
// Split out from seedFirestore.mjs so it can be imported and CHECKED without
// a Firebase service account. tests/seed.test.ts asserts the invariants the
// demo silently depends on — unique first names inside a school, a class for
// every student, an invite code for every student, no duplicate codes — so a
// later edit to the roster fails a test rather than failing on stage.
//
// Importing this module talks to nothing and reads no environment.
// ==========================================================================

export const GREENFIELD = "sch_greenfield";
export const RIVERSIDE = "sch_riverside";

// Class ids are referenced by invite codes, the docs and the golden demo.
// They are stable identifiers — renumbering them invalidates printed codes.
export const CLASS_10A = "cls_10a";
export const CLASS_10B = "cls_10b";
export const CLASS_9A = "cls_9a";
export const CLASS_9B = "cls_9b";
export const CLASS_8A = "cls_8a";
export const RIVERSIDE_CLASS = "cls_rv_9a";

/**
 * Placeholder teacher uid. Redeeming the teacher invite code overwrites this
 * with the real signed-up account's uid, so it never needs hand-editing —
 * it exists only so the class document is well-formed before anyone signs up.
 */
export const UNCLAIMED = "__unclaimed__";

/**
 * Teaching staff.
 *
 * These names are the single source for timetable rows, assignment authors
 * and class-teacher labels, and the principal dashboard's "Teachers" count
 * is derived by counting this list per school — it is not a number typed
 * into an analytics document that drifts from reality.
 *
 * No staff member shares a FIRST name with any seeded student. That is a
 * correctness requirement, not tidiness: student lookup resolves by first
 * name as one of its match tiers, and a teacher called Rahul in a demo whose
 * flagship command is "mark Rahul absent" is a genuine ambiguity hazard.
 */
export const STAFF = [
  { id: "tch_singh", fullName: "Mr. Devendra Singh", subject: "Mathematics", schoolId: GREENFIELD, classTeacherOf: CLASS_10A },
  { id: "tch_sharma", fullName: "Mrs. Anita Sharma", subject: "Physics", schoolId: GREENFIELD, classTeacherOf: CLASS_10B },
  { id: "tch_verma", fullName: "Mr. Vivek Verma", subject: "Chemistry", schoolId: GREENFIELD, classTeacherOf: CLASS_9A },
  { id: "tch_kapoor", fullName: "Ms. Nandita Kapoor", subject: "English", schoolId: GREENFIELD, classTeacherOf: CLASS_9B },
  { id: "tch_iyer", fullName: "Mr. Ramesh Iyer", subject: "Biology", schoolId: GREENFIELD, classTeacherOf: CLASS_8A },
  { id: "tch_dsouza", fullName: "Ms. Carol D'Souza", subject: "History", schoolId: GREENFIELD, classTeacherOf: null },
  { id: "tch_ansari", fullName: "Mr. Faisal Ansari", subject: "Computer Science", schoolId: GREENFIELD, classTeacherOf: null },
  { id: "tch_reddy", fullName: "Mrs. Sunitha Reddy", subject: "Social Science", schoolId: GREENFIELD, classTeacherOf: null },
  { id: "tch_rv_pawar", fullName: "Mr. Ganesh Pawar", subject: "Mathematics", schoolId: RIVERSIDE, classTeacherOf: RIVERSIDE_CLASS },
];

export const staffById = Object.fromEntries(STAFF.map((s) => [s.id, s]));

/**
 * The roster. Defined ONCE and consumed by students, attendance, invite
 * codes and analytics alike — previously the class groupings were written
 * out separately for students and for attendance, which is exactly the kind
 * of duplication that lets a student exist with no attendance history.
 */
export const ROSTER = [
  {
    classId: CLASS_10A,
    className: "Class 10 - A",
    section: "A",
    schoolId: GREENFIELD,
    students: [
      { id: "stu_rahul", fullName: "Rahul Kumar" },
      { id: "stu_arjun", fullName: "Arjun Patel" },
      { id: "stu_sneha", fullName: "Sneha Roy" },
      { id: "stu_alisha", fullName: "Alisha Khan" },
      { id: "stu_meera", fullName: "Meera Nair" },
      { id: "stu_vikram", fullName: "Vikram Reddy" },
      { id: "stu_ishaan", fullName: "Ishaan Joshi" },
      { id: "stu_tanvi", fullName: "Tanvi Deshmukh" },
      { id: "stu_farhan", fullName: "Farhan Ali" },
    ],
  },
  {
    classId: CLASS_10B,
    className: "Class 10 - B",
    section: "B",
    schoolId: GREENFIELD,
    students: [
      { id: "stu_priya", fullName: "Priya Sharma" },
      { id: "stu_karan", fullName: "Karan Mehta" },
      { id: "stu_diya", fullName: "Diya Iyer" },
      { id: "stu_rohan", fullName: "Rohan Das" },
      { id: "stu_aditya", fullName: "Aditya Rao" },
      { id: "stu_nikita", fullName: "Nikita Bansal" },
      { id: "stu_sameer", fullName: "Sameer Qureshi" },
      { id: "stu_kavya", fullName: "Kavya Menon" },
    ],
  },
  {
    classId: CLASS_9A,
    className: "Class 9 - A",
    section: "A",
    schoolId: GREENFIELD,
    students: [
      { id: "stu_aarav", fullName: "Aarav Gupta" },
      { id: "stu_ishita", fullName: "Ishita Chatterjee" },
      { id: "stu_manav", fullName: "Manav Shah" },
      { id: "stu_riya", fullName: "Riya Pillai" },
      { id: "stu_zoya", fullName: "Zoya Sheikh" },
      { id: "stu_dev", fullName: "Dev Malhotra" },
      { id: "stu_anjali", fullName: "Anjali Verma" },
      { id: "stu_yash", fullName: "Yash Kulkarni" },
    ],
  },
  {
    classId: CLASS_9B,
    className: "Class 9 - B",
    section: "B",
    schoolId: GREENFIELD,
    students: [
      { id: "stu_neha", fullName: "Neha Bhatt" },
      { id: "stu_siddharth", fullName: "Siddharth Rane" },
      { id: "stu_pooja", fullName: "Pooja Naik" },
      { id: "stu_harsh", fullName: "Harsh Agarwal" },
      { id: "stu_simran", fullName: "Simran Kaur" },
      { id: "stu_ritvik", fullName: "Ritvik Sinha" },
      { id: "stu_lakshmi", fullName: "Lakshmi Raman" },
      { id: "stu_omkar", fullName: "Omkar Jadhav" },
    ],
  },
  {
    classId: CLASS_8A,
    className: "Class 8 - A",
    section: "A",
    schoolId: GREENFIELD,
    students: [
      { id: "stu_kabir", fullName: "Kabir Chauhan" },
      { id: "stu_ananya_m", fullName: "Ananya Mishra" },
      { id: "stu_rehan", fullName: "Rehan Sheikh" },
      { id: "stu_tara", fullName: "Tara Krishnan" },
      { id: "stu_varun", fullName: "Varun Saxena" },
      { id: "stu_isha", fullName: "Isha Dutta" },
      { id: "stu_nikhil", fullName: "Nikhil Bose" },
      { id: "stu_preeti", fullName: "Preeti Yadav" },
    ],
  },
  {
    classId: RIVERSIDE_CLASS,
    className: "Class 9 - A",
    section: "A",
    schoolId: RIVERSIDE,
    students: [
      { id: "stu_rv_ananya", fullName: "Ananya Bose" },
      { id: "stu_rv_rudra", fullName: "Rudra Pawar" },
      { id: "stu_rv_sanjana", fullName: "Sanjana Kale" },
      { id: "stu_rv_aditi", fullName: "Aditi Joshi" },
    ],
  },
];

/** Flat roster with class context attached — the form most sections want. */
export const ALL_STUDENTS = ROSTER.flatMap((group, groupIndex) =>
  group.students.map((s, index) => ({
    ...s,
    rollNumber: String(index + 1).padStart(2, "0"),
    classId: group.classId,
    className: group.className,
    section: group.section,
    schoolId: group.schoolId,
    groupIndex,
  }))
);

/**
 * Explicit attendance behaviour for the students the demo actually talks
 * about. `absentRate` is the probability a given school day is missed;
 * `leaveRate` the probability of approved leave.
 *
 * Rahul is deliberately near the interesting end: comfortably above the 75%
 * policy threshold, but with enough absences that "why is it not higher?"
 * has a real answer to retrieve. Vikram and Karan are the two students who
 * pull their class averages down, which is what makes the principal's
 * "which class needs attention?" question resolve to a genuine answer.
 *
 * Every other student gets a stable profile derived from their id, so class
 * averages differ from one another without a hand-maintained table of 45
 * rows that nobody would keep accurate.
 */
export const ATTENDANCE_PROFILES = {
  stu_rahul: { absentRate: 0.06, leaveRate: 0.04 },
  stu_arjun: { absentRate: 0.03, leaveRate: 0.02 },
  stu_sneha: { absentRate: 0.02, leaveRate: 0.01 },
  stu_alisha: { absentRate: 0.05, leaveRate: 0.03 },
  stu_meera: { absentRate: 0.01, leaveRate: 0.02 },
  stu_vikram: { absentRate: 0.22, leaveRate: 0.05 }, // pulls 10-A's average down
  stu_priya: { absentRate: 0.04, leaveRate: 0.02 },
  stu_karan: { absentRate: 0.28, leaveRate: 0.06 }, // makes 10-B the class needing attention
  stu_diya: { absentRate: 0.09, leaveRate: 0.03 },
  stu_rohan: { absentRate: 0.22, leaveRate: 0.04 },
  // Sameer joins Karan and Rohan in giving 10-B a clear, deliberate margin as
  // the lowest class. The demo asks "which class needs attention?" and quotes
  // the answer, so that answer must not be an accident of derived randomness
  // that flips when the roster changes — tests/seed.test.ts asserts it.
  stu_sameer: { absentRate: 0.30, leaveRate: 0.05 },
  stu_rv_ananya: { absentRate: 0.05, leaveRate: 0.02 },
};


export const SCHOOL_DAYS = 45;

/**
 * Attendance behaviour for a student without an explicit profile. Spreads
 * absence rates across roughly 2%-16% so classes have visibly different
 * averages, and stays deterministic because it is derived from the id.
 */
export function profileFor(studentId) {
  const explicit = ATTENDANCE_PROFILES[studentId];
  if (explicit) return explicit;
  const r = seededRandom(`profile:${studentId}`);
  return { absentRate: 0.02 + r * 0.14, leaveRate: 0.01 + seededRandom(`leave:${studentId}`) * 0.04 };
}

/**
 * Deterministic pseudo-random in [0,1) from a string seed.
 *
 * Seeding is deterministic on purpose: re-running the script produces the
 * same attendance history, so a number quoted in a rehearsed demo is still
 * the number on screen tomorrow.
 */
export function seededRandom(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export function buildInviteCodes() {
  const codes = [
    // --- demo-critical, referenced by the docs and the golden demo --------
    { code: "GISD-STU-RAHUL", role: "student", studentId: "stu_rahul", schoolId: GREENFIELD },
    { code: "GISD-STU-ARJUN", role: "student", studentId: "stu_arjun", schoolId: GREENFIELD },
    { code: "GISD-PAR-RAHUL", role: "parent", studentId: "stu_rahul", schoolId: GREENFIELD },
    // Second child for the same parent: redeem alongside GISD-PAR-RAHUL to
    // exercise the child switcher. Rahul and Sneha are both in 10-A.
    { code: "GISD-PAR-MULTI", role: "parent", studentId: "stu_sneha", schoolId: GREENFIELD },
    { code: "GISD-TCH-10A", role: "teacher", classIds: [CLASS_10A], schoolId: GREENFIELD },
    { code: "GISD-TCH-BOTH", role: "teacher", classIds: [CLASS_10A, CLASS_10B], schoolId: GREENFIELD },
    { code: "GISD-PRI-ADMIN", role: "principal", schoolId: GREENFIELD },
    // Riverside: for demonstrating that cross-school access is refused.
    { code: "RVPS-PRI-ADMIN", role: "principal", schoolId: RIVERSIDE },
    { code: "RVPS-PAR-ANANYA", role: "parent", studentId: "stu_rv_ananya", schoolId: RIVERSIDE },
    { code: "RVPS-TCH-9A", role: "teacher", classIds: [RIVERSIDE_CLASS], schoolId: RIVERSIDE },
  ];

  // --- one teacher code per remaining Greenfield class --------------------
  const namedClasses = new Set([CLASS_10A, CLASS_10B, RIVERSIDE_CLASS]);
  for (const group of ROSTER) {
    if (namedClasses.has(group.classId)) continue;
    codes.push({
      code: `GISD-TCH-${group.classId.replace("cls_", "").toUpperCase()}`,
      role: "teacher",
      classIds: [group.classId],
      schoolId: group.schoolId,
    });
  }

  // --- one parent code per student ---------------------------------------
  const existingParentTargets = new Set(codes.filter((c) => c.role === "parent").map((c) => c.studentId));
  for (const student of ALL_STUDENTS) {
    if (existingParentTargets.has(student.id)) continue;
    const prefix = student.schoolId === GREENFIELD ? "GISD" : "RVPS";
    const slug = student.id.replace(/^stu_(rv_)?/, "").toUpperCase();
    codes.push({ code: `${prefix}-PAR-${slug}`, role: "parent", studentId: student.id, schoolId: student.schoolId });
  }

  return codes;
}

/**
 * The seeded attendance window: the last `count` WEEKDAY dates, oldest
 * first. Schools don't mark weekends.
 *
 * Lives here rather than in the writer so the seeder and tests/seed.test.ts
 * sample the SAME dates. When the test asserted a class ranking over its own
 * synthetic date set, it could pass while the real seeded ranking had
 * flipped — which is precisely the drift the test exists to catch.
 */
export function schoolDays(count, from = new Date()) {
  const dates = [];
  let offset = 0;
  while (dates.length < count && offset < count * 3) {
    const d = new Date(from);
    d.setDate(d.getDate() - offset);
    const day = d.getDay();
    if (day !== 0 && day !== 6) dates.push(d.toISOString().slice(0, 10));
    offset += 1;
  }
  return dates.reverse();
}

/**
 * The status the seeder writes for one student on one date. Exported so the
 * tests reason about exactly what will be written, not an approximation.
 * `todayIso` is always present: the golden demo needs Rahul genuinely marked
 * present before it proposes changing him to absent.
 */
export function statusFor(studentId, date, todayIso) {
  if (date === todayIso) return "present";
  const profile = profileFor(studentId);
  const roll = seededRandom(`${studentId}:${date}`);
  if (roll < profile.absentRate) return "absent";
  if (roll < profile.absentRate + profile.leaveRate) return "leave";
  return "present";
}
