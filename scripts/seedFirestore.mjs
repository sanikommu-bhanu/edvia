// ==========================================================================
// EDVIA — Firestore seed
// ==========================================================================
// Creates a complete, demo-ready school in the SAME schema the application
// and the AI tool layer read. There is no separate "demo database": this
// writes production collections, which is the whole point — the golden demo
// exercises the real data path, not a fixture.
//
// Two schools are seeded on purpose:
//   Greenfield  — the demo school, fully populated (5 classes, 41 students,
//                 8 teaching staff, ~45 school days of attendance history)
//   Riverside   — a second school with its own principal, staff and students,
//                 so cross-school isolation can be *demonstrated* rather than
//                 asserted. Nothing in Greenfield references it.
//
// The scale is deliberate. School-wide analytics are only meaningful if
// classes genuinely differ from one another, so per-student attendance
// behaviour is varied (deterministically) and two classes are seeded to sit
// noticeably below the rest — a principal asking "which class needs
// attention?" gets a real answer computed from real records.
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
import {
  GREENFIELD,
  RIVERSIDE,
  CLASS_10A,
  CLASS_10B,
  CLASS_9A,
  CLASS_9B,
  CLASS_8A,
  RIVERSIDE_CLASS,
  UNCLAIMED,
  STAFF,
  staffById,
  ROSTER,
  ALL_STUDENTS,
  SCHOOL_DAYS,
  seededRandom,
  schoolDays,
  statusFor,
  buildInviteCodes,
} from "./seedData.mjs";

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

// All reference data — schools, staff, roster, attendance profiles and
// invite codes — lives in seedData.mjs, which imports nothing and touches
// nothing. This file is the writer; that file is the description. Keeping
// them apart is what lets tests/seed.test.ts check the roster's invariants
// without a service account.

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

/**
 * Staff records. Read by the principal's class insights and used to derive
 * the school's teacher count; `uid` is filled in when a real account
 * redeems the matching teacher invite code.
 */
async function seedTeachers(writer) {
  for (const staff of STAFF) {
    await writer.set(
      db.collection("teachers").doc(staff.id),
      {
        fullName: staff.fullName,
        subject: staff.subject,
        schoolId: staff.schoolId,
        classTeacherOf: staff.classTeacherOf,
      },
      // merge so a uid claimed by a real signup during a previous run isn't
      // wiped by re-seeding.
      { merge: true }
    );
  }
}

async function seedClasses(writer) {
  for (const group of ROSTER) {
    const classTeacher = STAFF.find((s) => s.classTeacherOf === group.classId);
    // merge:true so re-seeding never wipes a teacherId claimed by a real
    // signed-up teacher during a previous run.
    await writer.set(
      db.collection("classes").doc(group.classId),
      {
        className: group.className,
        schoolId: group.schoolId,
        teacherId: UNCLAIMED,
        classTeacherName: classTeacher ? classTeacher.fullName : null,
        studentCount: group.students.length,
      },
      { merge: true }
    );
  }
}

async function seedStudents(writer) {
  for (const s of ALL_STUDENTS) {
    await writer.set(db.collection("students").doc(s.id), {
      fullName: s.fullName,
      rollNumber: s.rollNumber,
      classId: s.classId,
      className: s.className,
      section: s.section,
      schoolId: s.schoolId,
    });
  }
}

async function seedAttendance(writer) {
  const dates = schoolDays(SCHOOL_DAYS);

  for (const student of ALL_STUDENTS) {
    for (const date of dates) {
      // statusFor() lives in seedData.mjs so the tests assert exactly what
      // gets written here. Today is always "present" for everyone — the
      // golden demo's "Rahul is currently marked present, change to absent?"
      // is only an honest question if he genuinely is.
      const status = statusFor(student.id, date, todayIso);

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
  return dates.length * ALL_STUDENTS.length;
}

/**
 * Timetable. Every Greenfield class gets the same five-period spine taught
 * by the real staff records above, so switching class never lands on an
 * empty screen and the teacher named on a row is a teacher who exists.
 */
async function seedClassSubjects(writer) {
  const timetable = [
    { staffId: "tch_singh", room: "Room 101", schedule: "08:00", iconKey: "math" },
    { staffId: "tch_sharma", room: "Room 102", schedule: "09:00", iconKey: "physics" },
    { staffId: "tch_verma", room: "Room 103", schedule: "10:00", iconKey: "chemistry" },
    { staffId: "tch_kapoor", room: "Room 104", schedule: "11:30", iconKey: "english" },
    { staffId: "tch_iyer", room: "Room 105", schedule: "12:30", iconKey: "biology" },
  ];

  const greenfieldClasses = ROSTER.filter((g) => g.schoolId === GREENFIELD);
  for (const group of greenfieldClasses) {
    for (const [index, row] of timetable.entries()) {
      const staff = staffById[row.staffId];
      await writer.set(db.collection("classSubjects").doc(`${group.classId}_sub_${index}`), {
        subject: staff.subject,
        teacherName: staff.fullName,
        room: row.room,
        schedule: row.schedule,
        iconKey: row.iconKey,
        classId: group.classId,
        schoolId: GREENFIELD,
        teacherId: UNCLAIMED,
        // Varies per class so the "syllabus progress" strip isn't identical
        // everywhere; derived from the ids so it stays stable across runs.
        progressPercent: 50 + Math.round(seededRandom(`${group.classId}:${row.staffId}`) * 40),
      });
    }
  }

  // Riverside's single class, so its student's timetable isn't empty either.
  const pawar = staffById.tch_rv_pawar;
  await writer.set(db.collection("classSubjects").doc(`${RIVERSIDE_CLASS}_sub_0`), {
    subject: pawar.subject,
    teacherName: pawar.fullName,
    room: "Room 12",
    schedule: "08:30",
    iconKey: "math",
    classId: RIVERSIDE_CLASS,
    schoolId: RIVERSIDE,
    teacherId: UNCLAIMED,
    progressPercent: 60,
  });
}

/**
 * Assignments. Class 10-A carries the richest set because that is where the
 * demo spends its time; every other class still gets real work so no screen
 * is empty and the teacher's "what's due for my class?" always resolves.
 */
async function seedAssignments(writer) {
  const tenA = [
    { id: "asg_math_1", staffId: "tch_singh", title: "Quadratic Equations", description: "Exercise 4.3, questions 1-12.", dueIn: 3, status: "pending" },
    { id: "asg_phys_1", staffId: "tch_sharma", title: "Physics Lab Report", description: "Write up experiment 7 (simple pendulum).", dueIn: 5, status: "pending" },
    { id: "asg_eng_1", staffId: "tch_kapoor", title: "English Essay", description: "800 words on a book that changed your mind.", dueIn: 8, status: "pending" },
    { id: "asg_chem_1", staffId: "tch_verma", title: "Chemistry Worksheet", description: "Organic compounds — naming practice.", dueIn: -2, status: "submitted" },
  ];
  for (const a of tenA) {
    const staff = staffById[a.staffId];
    await writer.set(db.collection("assignments").doc(a.id), {
      subject: staff.subject,
      title: a.title,
      description: a.description,
      dueDate: iso(daysAhead(a.dueIn)),
      status: a.status,
      teacherName: staff.fullName,
      classId: CLASS_10A,
      schoolId: GREENFIELD,
    });
  }

  const others = [
    { classId: CLASS_10B, staffId: "tch_singh", title: "Trigonometry Practice", description: "Exercise 8.1, all questions.", dueIn: 4 },
    { classId: CLASS_10B, staffId: "tch_iyer", title: "Cell Structure Diagram", description: "Label a plant and an animal cell.", dueIn: 7 },
    { classId: CLASS_9A, staffId: "tch_verma", title: "Acids and Bases Worksheet", description: "Complete the pH scale exercises.", dueIn: 2 },
    { classId: CLASS_9A, staffId: "tch_kapoor", title: "Letter Writing", description: "A formal letter to the school librarian.", dueIn: 6 },
    { classId: CLASS_9B, staffId: "tch_dsouza", title: "History Timeline", description: "Timeline of the Indian independence movement.", dueIn: 5 },
    { classId: CLASS_9B, staffId: "tch_singh", title: "Linear Equations", description: "Exercise 3.2, questions 1-10.", dueIn: 9 },
    { classId: CLASS_8A, staffId: "tch_ansari", title: "Scratch Animation", description: "Build a short animation with at least three sprites.", dueIn: 6 },
    { classId: CLASS_8A, staffId: "tch_reddy", title: "Map Work — Rivers", description: "Mark the major rivers of India on the outline map.", dueIn: 3 },
  ];
  for (const [index, a] of others.entries()) {
    const staff = staffById[a.staffId];
    await writer.set(db.collection("assignments").doc(`asg_extra_${index}`), {
      subject: staff.subject,
      title: a.title,
      description: a.description,
      dueDate: iso(daysAhead(a.dueIn)),
      status: "pending",
      teacherName: staff.fullName,
      classId: a.classId,
      schoolId: GREENFIELD,
    });
  }
}

async function seedExams(writer) {
  const tenA = [
    { id: "exm_sci_1", title: "Science Test", subject: "Science", inDays: 4, status: "upcoming" },
    { id: "exm_math_1", title: "Maths Unit Test", subject: "Mathematics", inDays: 11, status: "upcoming" },
    { id: "exm_eng_1", title: "English Test", subject: "English", inDays: 18, status: "upcoming" },
    { id: "exm_hist_1", title: "History Test", subject: "History", inDays: -12, status: "completed", score: { obtained: 41, total: 50 } },
  ];
  for (const e of tenA) {
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

  // The term exam schedule applies school-wide, so every other class has a
  // real upcoming paper rather than an empty exams tab.
  const otherClasses = [CLASS_10B, CLASS_9A, CLASS_9B, CLASS_8A];
  for (const [index, classId] of otherClasses.entries()) {
    await writer.set(db.collection("exams").doc(`exm_term_${index}`), {
      title: "Term Unit Test — Mathematics",
      subject: "Mathematics",
      date: iso(daysAhead(9 + index)),
      status: "upcoming",
      classId,
      schoolId: GREENFIELD,
    });
    await writer.set(db.collection("exams").doc(`exm_term_sci_${index}`), {
      title: "Term Unit Test — Science",
      subject: "Science",
      date: iso(daysAhead(14 + index)),
      status: "upcoming",
      classId,
      schoolId: GREENFIELD,
    });
  }
}

async function seedNotices(writer) {
  const notices = [
    { id: "not_annual_day", title: "School Annual Day", body: "Annual Day will be held in the main auditorium. Parents are warmly invited.", category: "school", daysBack: 1 },
    { id: "not_ptm", title: "Parent-Teacher Meeting", body: "PTM for Class 10 sections will run from 9am to 1pm. Please book a slot with your class teacher.", category: "important", daysBack: 3 },
    { id: "not_holiday", title: "Summer Holiday Notice", body: "The school will remain closed for the summer break. Holiday homework has been shared class-wise.", category: "school", daysBack: 6 },
    { id: "not_sports", title: "Sports Day Trials", body: "Trials for track events begin next week during the games period.", category: "class", daysBack: 9 },
    { id: "not_attendance", title: "Attendance Reminder", body: "Students below 75% attendance will not be eligible for term-end examinations. Parents of affected students will be contacted individually.", category: "important", daysBack: 4 },
    { id: "not_library", title: "Library Week", body: "The library will host reading sessions during the lunch break all next week.", category: "school", daysBack: 12 },
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
    { id: "res_bio_cells", title: "Biology — Cell Structure Notes", type: "notes", subject: "Biology", fileSizeKb: 1800 },
    { id: "res_cs_scratch", title: "Computer Science — Scratch Starter Pack", type: "material", subject: "Computer Science", fileSizeKb: 900 },
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
    { id: "cal_sports", title: "Sports Day", inDays: 27, type: "event" },
    { id: "cal_term_exams", title: "Term Examinations Begin", inDays: 9, type: "test" },
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
 * Headline counts for the principal dashboard.
 *
 * Every figure is DERIVED from the roster and staff list above rather than
 * typed in, so the dashboard can't claim four teachers while the timetable
 * names eight. Attendance percentages are deliberately absent: they are
 * computed live from the attendance collection by
 * api/_lib/school/attendance.ts, so they can never go stale against the
 * records themselves.
 */
async function seedAnalytics(writer) {
  for (const schoolId of [GREENFIELD, RIVERSIDE]) {
    const classes = ROSTER.filter((g) => g.schoolId === schoolId);
    await writer.set(db.collection("schoolAnalytics").doc(schoolId), {
      totalStudents: classes.reduce((sum, g) => sum + g.students.length, 0),
      totalTeachers: STAFF.filter((s) => s.schoolId === schoolId).length,
      totalClasses: classes.length,
      updatedAt: new Date().toISOString(),
    });
  }
}


async function seedInviteCodes(writer) {
  const codes = buildInviteCodes();
  for (const invite of codes) {
    // The `used` flag is deliberately reset on re-seed so a demo can be
    // rehearsed repeatedly from a clean state.
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
  await seedTeachers(writer);
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

  const greenfieldClasses = ROSTER.filter((g) => g.schoolId === GREENFIELD);
  console.log(`\nDone — ${writer.total} documents written (${attendanceCount} attendance records).`);
  console.log(
    `  Greenfield: ${greenfieldClasses.length} classes · ` +
      `${greenfieldClasses.reduce((n, g) => n + g.students.length, 0)} students · ` +
      `${STAFF.filter((s) => s.schoolId === GREENFIELD).length} teachers`
  );
  console.log(
    `  Riverside:  ${ROSTER.length - greenfieldClasses.length} class · ` +
      `${ALL_STUDENTS.filter((s) => s.schoolId === RIVERSIDE).length} students · ` +
      `${STAFF.filter((s) => s.schoolId === RIVERSIDE).length} teacher`
  );

  console.log("\nDemo invite codes");
  console.log("-----------------");
  const demoCodes = codes.filter((c) => !c.code.startsWith("GISD-PAR-") || c.code === "GISD-PAR-RAHUL" || c.code === "GISD-PAR-MULTI");
  for (const c of demoCodes) {
    const target = c.studentId ?? (c.classIds ? c.classIds.join(", ") : "school-wide");
    console.log(`  ${c.code.padEnd(18)} ${c.role.padEnd(10)} ${c.schoolId.padEnd(16)} ${target}`);
  }
  const parentCodeCount = codes.filter((c) => c.role === "parent").length;
  console.log(`\n  + ${parentCodeCount - 3} further parent codes, one per remaining student (GISD-PAR-<NAME> / RVPS-PAR-<NAME>).`);
  console.log("  Full list: Firestore console → inviteCodes collection.");

  console.log("\nGolden demo: sign up a teacher with GISD-TCH-10A and a parent with GISD-PAR-RAHUL.");
  console.log(`Rahul Kumar is marked PRESENT for today (${todayIso}), ready to be changed to absent.`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nSeed failed:", err);
    process.exit(1);
  });
