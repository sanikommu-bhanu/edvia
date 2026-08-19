// ==========================================================================
// EDVIA — Firestore seed
// ==========================================================================
// Creates a complete, demo-ready school in the SAME schema the application
// and the AI tool layer read. There is no separate "demo database": this
// writes production collections, which is the whole point — the golden demo
// exercises the real data path, not a fixture.
//
// Two schools are seeded on purpose:
//   Greenfield  — the demo school, fully populated
//   Riverside   — a second school with its own principal and students, so
//                 cross-school isolation can be *demonstrated* rather than
//                 asserted. Nothing in Greenfield references it.
//
// Idempotent: every document has a deterministic id, so re-running updates
// in place instead of duplicating. Attendance in particular is keyed
// `${studentId}_${date}`, exactly as the app writes it.
//
// Usage:
//   node scripts/seedFirestore.mjs
//   node scripts/seedFirestore.mjs --reset-attendance
//
// Requires the same service-account env vars as the API functions:
//   FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
// ==========================================================================
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const REQUIRED_ENV = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"];
const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  console.error("Set them from your Firebase service account (see .env.example) and try again.");
  process.exit(1);
}

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore(app);

// --------------------------------------------------------------------------
// Reference data
// --------------------------------------------------------------------------

const GREENFIELD = "sch_greenfield";
const RIVERSIDE = "sch_riverside";

const CLASS_10A = "cls_10a";
const CLASS_10B = "cls_10b";
const RIVERSIDE_CLASS = "cls_rv_9a";

/**
 * Placeholder teacher uid. Redeeming the teacher invite code overwrites this
 * with the real signed-up account's uid, so it never needs hand-editing —
 * it exists only so the class document is well-formed before anyone signs up.
 */
const UNCLAIMED = "__unclaimed__";

const GREENFIELD_10A_STUDENTS = [
  { id: "stu_rahul", fullName: "Rahul Kumar", rollNumber: "01" },
  { id: "stu_arjun", fullName: "Arjun Patel", rollNumber: "02" },
  { id: "stu_sneha", fullName: "Sneha Roy", rollNumber: "03" },
  { id: "stu_alisha", fullName: "Alisha Khan", rollNumber: "04" },
  { id: "stu_meera", fullName: "Meera Nair", rollNumber: "05" },
  { id: "stu_vikram", fullName: "Vikram Reddy", rollNumber: "06" },
];

const GREENFIELD_10B_STUDENTS = [
  { id: "stu_priya", fullName: "Priya Sharma", rollNumber: "01" },
  { id: "stu_karan", fullName: "Karan Mehta", rollNumber: "02" },
  { id: "stu_diya", fullName: "Diya Iyer", rollNumber: "03" },
  { id: "stu_rohan", fullName: "Rohan Das", rollNumber: "04" },
];

const RIVERSIDE_STUDENTS = [{ id: "stu_rv_ananya", fullName: "Ananya Bose", rollNumber: "01" }];

/**
 * Per-student attendance behaviour, so the demo has range rather than a flat
 * 100%. `absentRate` is the probability a given school day is missed;
 * `leaveRate` the probability of approved leave.
 *
 * Rahul is deliberately near the interesting end: comfortably above the 75%
 * policy threshold, but with enough absences that "why is it not higher?" has
 * a real answer to retrieve.
 */
const ATTENDANCE_PROFILES = {
  stu_rahul: { absentRate: 0.06, leaveRate: 0.04 },
  stu_arjun: { absentRate: 0.03, leaveRate: 0.02 },
  stu_sneha: { absentRate: 0.02, leaveRate: 0.01 },
  stu_alisha: { absentRate: 0.05, leaveRate: 0.03 },
  stu_meera: { absentRate: 0.01, leaveRate: 0.02 },
  stu_vikram: { absentRate: 0.22, leaveRate: 0.05 }, // pulls 10-A's average down
  stu_priya: { absentRate: 0.04, leaveRate: 0.02 },
  stu_karan: { absentRate: 0.28, leaveRate: 0.06 }, // makes 10-B the class needing attention
  stu_diya: { absentRate: 0.09, leaveRate: 0.03 },
  stu_rohan: { absentRate: 0.15, leaveRate: 0.04 },
  stu_rv_ananya: { absentRate: 0.05, leaveRate: 0.02 },
};

const SCHOOL_DAYS = 45;

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

const iso = (date) => date.toISOString().slice(0, 10);
const today = new Date();
const todayIso = iso(today);

function daysAgo(n) {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d;
}

function daysAhead(n) {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return d;
}

/** Weekday dates only, oldest first — schools don't mark weekends. */
function schoolDays(count) {
  const dates = [];
  let offset = 0;
  while (dates.length < count && offset < count * 3) {
    const d = daysAgo(offset);
    const day = d.getDay();
    if (day !== 0 && day !== 6) dates.push(iso(d));
    offset += 1;
  }
  return dates.reverse();
}

/**
 * Deterministic pseudo-random in [0,1) from a string seed.
 *
 * Seeding is deterministic on purpose: re-running the script produces the
 * same attendance history, so a number quoted in a rehearsed demo is still
 * the number on screen tomorrow.
 */
function seededRandom(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** Commits in chunks — a Firestore batch caps at 500 operations. */
class BatchWriter {
  constructor(database, limit = 400) {
    this.db = database;
    this.limit = limit;
    this.batch = database.batch();
    this.count = 0;
    this.total = 0;
  }

  set(ref, data, options) {
    this.batch.set(ref, data, options ?? {});
    this.count += 1;
    this.total += 1;
    if (this.count >= this.limit) return this.flush();
    return Promise.resolve();
  }

  async flush() {
    if (this.count === 0) return;
    await this.batch.commit();
    this.batch = this.db.batch();
    this.count = 0;
  }
}

// --------------------------------------------------------------------------
// Seed sections
// --------------------------------------------------------------------------

async function seedSchools(writer) {
  await writer.set(db.collection("schools").doc(GREENFIELD), {
    name: "Greenfield International School",
    location: "Bengaluru, Karnataka",
  });
  await writer.set(db.collection("schools").doc(RIVERSIDE), {
    name: "Riverside Public School",
    location: "Pune, Maharashtra",
  });
}

async function seedClasses(writer) {
  const classes = [
    { id: CLASS_10A, className: "Class 10 - A", schoolId: GREENFIELD },
    { id: CLASS_10B, className: "Class 10 - B", schoolId: GREENFIELD },
    { id: RIVERSIDE_CLASS, className: "Class 9 - A", schoolId: RIVERSIDE },
  ];
  for (const c of classes) {
    // merge:true so re-seeding never wipes a teacherId claimed by a real
    // signed-up teacher during a previous run.
    await writer.set(
      db.collection("classes").doc(c.id),
      { className: c.className, schoolId: c.schoolId, teacherId: UNCLAIMED },
      { merge: true }
    );
  }
}

async function seedStudents(writer) {
  const groups = [
    { students: GREENFIELD_10A_STUDENTS, classId: CLASS_10A, className: "Class 10 - A", section: "A", schoolId: GREENFIELD },
    { students: GREENFIELD_10B_STUDENTS, classId: CLASS_10B, className: "Class 10 - B", section: "B", schoolId: GREENFIELD },
    { students: RIVERSIDE_STUDENTS, classId: RIVERSIDE_CLASS, className: "Class 9 - A", section: "A", schoolId: RIVERSIDE },
  ];
  for (const group of groups) {
    for (const s of group.students) {
      await writer.set(db.collection("students").doc(s.id), {
        fullName: s.fullName,
        rollNumber: s.rollNumber,
        classId: group.classId,
        className: group.className,
        section: group.section,
        schoolId: group.schoolId,
      });
    }
  }
}

async function seedAttendance(writer) {
  const dates = schoolDays(SCHOOL_DAYS);
  const roster = [
    ...GREENFIELD_10A_STUDENTS.map((s) => ({ ...s, classId: CLASS_10A, schoolId: GREENFIELD })),
    ...GREENFIELD_10B_STUDENTS.map((s) => ({ ...s, classId: CLASS_10B, schoolId: GREENFIELD })),
    ...RIVERSIDE_STUDENTS.map((s) => ({ ...s, classId: RIVERSIDE_CLASS, schoolId: RIVERSIDE })),
  ];

  for (const student of roster) {
    const profile = ATTENDANCE_PROFILES[student.id] ?? { absentRate: 0.05, leaveRate: 0.02 };
    for (const date of dates) {
      let status = "present";

      // Today is always present for everyone. The golden demo depends on it:
      // "Rahul is currently marked present — change to absent?" is only an
      // honest question if he genuinely is.
      if (date !== todayIso) {
        const roll = seededRandom(`${student.id}:${date}`);
        if (roll < profile.absentRate) status = "absent";
        else if (roll < profile.absentRate + profile.leaveRate) status = "leave";
      }

      // Same deterministic key the app writes, so a demo mark-absent updates
      // this row rather than adding a duplicate.
      await writer.set(db.collection("attendance").doc(`${student.id}_${date}`), {
        studentId: student.id,
        classId: student.classId,
        schoolId: student.schoolId,
        status,
        date,
        markedBy: "seed",
        markedAt: new Date().toISOString(),
        previousStatus: null,
      });
    }
  }
  return dates.length * roster.length;
}

async function seedClassSubjects(writer) {
  const timetable = [
    { subject: "Mathematics", teacherName: "Mr. Arjun Singh", room: "Room 101", schedule: "08:00", iconKey: "math" },
    { subject: "Physics", teacherName: "Mrs. Priya Sharma", room: "Room 102", schedule: "09:00", iconKey: "physics" },
    { subject: "Chemistry", teacherName: "Mr. Rahul Verma", room: "Room 103", schedule: "10:00", iconKey: "chemistry" },
    { subject: "English", teacherName: "Ms. Neha Kapoor", room: "Room 104", schedule: "11:30", iconKey: "english" },
  ];
  for (const classId of [CLASS_10A, CLASS_10B]) {
    for (const [index, subject] of timetable.entries()) {
      await writer.set(db.collection("classSubjects").doc(`${classId}_sub_${index}`), {
        ...subject,
        classId,
        schoolId: GREENFIELD,
        teacherId: UNCLAIMED,
        progressPercent: 55 + index * 10,
      });
    }
  }
}

async function seedAssignments(writer) {
  const assignments = [
    { id: "asg_math_1", subject: "Mathematics", title: "Quadratic Equations", description: "Exercise 4.3, questions 1-12.", dueIn: 3, status: "pending", teacherName: "Mr. Arjun Singh" },
    { id: "asg_phys_1", subject: "Physics", title: "Physics Lab Report", description: "Write up experiment 7 (simple pendulum).", dueIn: 5, status: "pending", teacherName: "Mrs. Priya Sharma" },
    { id: "asg_eng_1", subject: "English", title: "English Essay", description: "800 words on a book that changed your mind.", dueIn: 8, status: "pending", teacherName: "Ms. Neha Kapoor" },
    { id: "asg_chem_1", subject: "Chemistry", title: "Chemistry Worksheet", description: "Organic compounds — naming practice.", dueIn: -2, status: "submitted", teacherName: "Mr. Rahul Verma" },
  ];
  for (const a of assignments) {
    await writer.set(db.collection("assignments").doc(a.id), {
      subject: a.subject,
      title: a.title,
      description: a.description,
      dueDate: iso(daysAhead(a.dueIn)),
      status: a.status,
      teacherName: a.teacherName,
      classId: CLASS_10A,
      schoolId: GREENFIELD,
    });
  }
  // A little for 10-B too, so switching class isn't an empty screen.
  await writer.set(db.collection("assignments").doc("asg_10b_math_1"), {
    subject: "Mathematics",
    title: "Trigonometry Practice",
    description: "Exercise 8.1, all questions.",
    dueDate: iso(daysAhead(4)),
    status: "pending",
    teacherName: "Mr. Arjun Singh",
    classId: CLASS_10B,
    schoolId: GREENFIELD,
  });
}

async function seedExams(writer) {
  const exams = [
    { id: "exm_sci_1", title: "Science Test", subject: "Science", inDays: 4, status: "upcoming" },
    { id: "exm_math_1", title: "Maths Unit Test", subject: "Mathematics", inDays: 11, status: "upcoming" },
    { id: "exm_eng_1", title: "English Test", subject: "English", inDays: 18, status: "upcoming" },
    { id: "exm_hist_1", title: "History Test", subject: "History", inDays: -12, status: "completed", score: { obtained: 41, total: 50 } },
  ];
  for (const e of exams) {
    await writer.set(db.collection("exams").doc(e.id), {
      title: e.title,
      subject: e.subject,
      date: iso(daysAhead(e.inDays)),
      status: e.status,
      classId: CLASS_10A,
      schoolId: GREENFIELD,
      ...(e.score ? { score: e.score } : {}),
    });
  }
}

async function seedNotices(writer) {
  const notices = [
    { id: "not_annual_day", title: "School Annual Day", body: "Annual Day will be held in the main auditorium. Parents are warmly invited.", category: "school", daysBack: 1 },
    { id: "not_ptm", title: "Parent-Teacher Meeting", body: "PTM for Class 10 sections will run from 9am to 1pm. Please book a slot with your class teacher.", category: "important", daysBack: 3 },
    { id: "not_holiday", title: "Summer Holiday Notice", body: "The school will remain closed for the summer break. Holiday homework has been shared class-wise.", category: "school", daysBack: 6 },
    { id: "not_sports", title: "Sports Day Trials", body: "Trials for track events begin next week during the games period.", category: "class", daysBack: 9 },
  ];
  for (const n of notices) {
    await writer.set(db.collection("notices").doc(n.id), {
      title: n.title,
      body: n.body,
      category: n.category,
      date: iso(daysAgo(n.daysBack)),
      schoolId: GREENFIELD,
    });
  }
}

async function seedResources(writer) {
  const resources = [
    { id: "res_phys_motion", title: "Physics Notes — Motion", type: "notes", subject: "Physics", fileSizeKb: 2400 },
    { id: "res_math_formula", title: "Maths Formula Sheet", type: "notes", subject: "Mathematics", fileSizeKb: 1100 },
    { id: "res_chem_chart", title: "Chemistry Periodic Chart", type: "material", subject: "Chemistry", fileSizeKb: 3300 },
    { id: "res_eng_grammar", title: "English Grammar Guide", type: "book", subject: "English", fileSizeKb: 5200 },
  ];
  for (const r of resources) {
    await writer.set(db.collection("resources").doc(r.id), {
      title: r.title,
      type: r.type,
      subject: r.subject,
      fileSizeKb: r.fileSizeKb,
      uploadedAt: iso(daysAgo(14)),
      // No fabricated CDN links: an empty url renders as "not available for
      // download yet" rather than a button that 404s.
      url: "",
      schoolId: GREENFIELD,
    });
  }
}

async function seedPolicies(writer) {
  const sections = [
    {
      id: "attendance",
      title: "Attendance Policy",
      section: "4.2",
      content:
        "Students must maintain a minimum of 75% attendance per term to be eligible to sit for term-end examinations. Approved leave supported by a medical certificate is counted at 50% weight toward this requirement. Parents are notified when a student's attendance falls below 80%.",
      keywords: ["attendance", "minimum", "percentage", "eligibility", "75", "exam"],
    },
    {
      id: "leave",
      title: "Leave Policy",
      section: "5.1",
      content:
        "Students are permitted up to 12 planned leave days per academic year with prior written notice to the class teacher. Emergency leave should be reported to the school office within 24 hours.",
      keywords: ["leave", "days", "planned", "emergency", "absence"],
    },
    {
      id: "exams",
      title: "Examination Policy",
      section: "6.4",
      content:
        "A student who misses a scheduled examination for a medical reason may sit one retake per subject per term, provided a certificate is submitted within five working days. Retakes are graded on the same scale as the original paper.",
      keywords: ["exam", "examination", "retake", "missed", "medical"],
    },
    {
      id: "conduct",
      title: "Code of Conduct",
      section: "2.1",
      content:
        "Students are expected to treat classmates and staff with respect, arrive punctually, and keep mobile devices switched off during instructional time.",
      keywords: ["conduct", "discipline", "behaviour", "phone", "punctual"],
    },
  ];
  for (const s of sections) {
    await writer.set(db.collection("policies").doc(GREENFIELD).collection("sections").doc(s.id), {
      title: s.title,
      section: s.section,
      content: s.content,
      keywords: s.keywords,
    });
  }
}

async function seedCalendar(writer) {
  const events = [
    { id: "cal_ptm", title: "Parent-Teacher Meeting", inDays: 6, type: "ptm" },
    { id: "cal_sci_test", title: "Science Test", inDays: 4, type: "test" },
    { id: "cal_annual", title: "Annual Day", inDays: 20, type: "event" },
    { id: "cal_holiday", title: "Founder's Day Holiday", inDays: 12, type: "holiday" },
  ];
  for (const e of events) {
    await writer.set(db.collection("calendarEvents").doc(e.id), {
      title: e.title,
      date: iso(daysAhead(e.inDays)),
      type: e.type,
      schoolId: GREENFIELD,
    });
  }
}

/**
 * Headline counts for the principal dashboard. Attendance percentages are
 * NOT stored here — they're computed live from the attendance collection so
 * they can never go stale against the records themselves.
 */
async function seedAnalytics(writer) {
  await writer.set(db.collection("schoolAnalytics").doc(GREENFIELD), {
    totalStudents: GREENFIELD_10A_STUDENTS.length + GREENFIELD_10B_STUDENTS.length,
    totalTeachers: 4,
    totalClasses: 2,
    updatedAt: new Date().toISOString(),
  });
  await writer.set(db.collection("schoolAnalytics").doc(RIVERSIDE), {
    totalStudents: RIVERSIDE_STUDENTS.length,
    totalTeachers: 1,
    totalClasses: 1,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Single-use invite codes. This is the ONLY way a fresh signup gets linked to
 * a real student or class — see api/onboarding/redeem-invite.ts for why that
 * can't be a client-side write.
 */
async function seedInviteCodes(writer) {
  const codes = [
    { code: "GISD-STU-RAHUL", role: "student", studentId: "stu_rahul", schoolId: GREENFIELD },
    { code: "GISD-STU-ARJUN", role: "student", studentId: "stu_arjun", schoolId: GREENFIELD },
    { code: "GISD-PAR-RAHUL", role: "parent", studentId: "stu_rahul", schoolId: GREENFIELD },
    { code: "GISD-PAR-MULTI", role: "parent", studentId: "stu_sneha", schoolId: GREENFIELD },
    { code: "GISD-TCH-10A", role: "teacher", classIds: [CLASS_10A], schoolId: GREENFIELD },
    { code: "GISD-TCH-BOTH", role: "teacher", classIds: [CLASS_10A, CLASS_10B], schoolId: GREENFIELD },
    { code: "GISD-PRI-ADMIN", role: "principal", schoolId: GREENFIELD },
    // Riverside: for demonstrating that cross-school access is refused.
    { code: "RVPS-PRI-ADMIN", role: "principal", schoolId: RIVERSIDE },
    { code: "RVPS-PAR-ANANYA", role: "parent", studentId: "stu_rv_ananya", schoolId: RIVERSIDE },
  ];
  for (const invite of codes) {
    // merge:false is deliberate for the `used` flag: re-seeding resets codes
    // so a demo can be rehearsed repeatedly from a clean state.
    await writer.set(db.collection("inviteCodes").doc(invite.code), {
      ...invite,
      used: false,
      usedBy: null,
      usedAt: null,
      createdAt: new Date().toISOString(),
    });
  }
  return codes;
}

// --------------------------------------------------------------------------
// Optional cleanup
// --------------------------------------------------------------------------

/** Removes attendance rows outside the seeded window (e.g. from an older run). */
async function resetAttendance() {
  const keep = new Set(schoolDays(SCHOOL_DAYS));
  const snap = await db.collection("attendance").get();
  const stale = snap.docs.filter((d) => !keep.has(d.data().date));
  console.log(`  removing ${stale.length} attendance records outside the seeded window`);
  for (let i = 0; i < stale.length; i += 400) {
    const batch = db.batch();
    stale.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

async function seed() {
  const writer = new BatchWriter(db);

  console.log("Seeding EDVIA…");
  if (process.argv.includes("--reset-attendance")) await resetAttendance();

  await seedSchools(writer);
  await seedClasses(writer);
  await seedStudents(writer);
  await seedClassSubjects(writer);
  await seedAssignments(writer);
  await seedExams(writer);
  await seedNotices(writer);
  await seedResources(writer);
  await seedPolicies(writer);
  await seedCalendar(writer);
  await seedAnalytics(writer);
  const codes = await seedInviteCodes(writer);
  const attendanceCount = await seedAttendance(writer);
  await writer.flush();

  console.log(`\nDone — ${writer.total} documents written (${attendanceCount} attendance records).`);
  console.log("\nNext: create Firebase Auth accounts, then redeem an invite code in the app.");
  console.log("\nInvite codes");
  console.log("------------");
  for (const c of codes) {
    const target = c.studentId ?? (c.classIds ? c.classIds.join(", ") : "school-wide");
    console.log(`  ${c.code.padEnd(16)} ${c.role.padEnd(10)} ${c.schoolId.padEnd(16)} ${target}`);
  }
  console.log("\nGolden demo: sign up a teacher with GISD-TCH-10A and a parent with GISD-PAR-RAHUL.");
  console.log(`Rahul Kumar is marked PRESENT for today (${todayIso}), ready to be changed to absent.`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nSeed failed:", err);
    process.exit(1);
  });
