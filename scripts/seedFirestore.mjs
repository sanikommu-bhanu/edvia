// ==========================================================================
// One-time Firestore seed script — mirrors src/services/mockDb.ts so the
// real backend (api/_lib/tools/*.ts) has data to query that matches what
// the Prompt 1 UI already demonstrates on mock data.
//
// Usage:
//   node scripts/seedFirestore.mjs
// Requires the same FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL /
// FIREBASE_PRIVATE_KEY env vars as the API functions (see .env.example).
// ==========================================================================
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore(app);

const SCHOOL_ID = "sch_greenfield";
const CLASS_ID = "cls_10a";
// Placeholder — a redeemed teacher invite code (see inviteCodes below)
// overwrites this with the real signed-up teacher's uid, so this value
// never actually needs to be hand-edited for a fresh test setup.
const TEACHER_UID = "REPLACE_WITH_REAL_TEACHER_FIREBASE_UID";

async function seed() {
  const batch = db.batch();

  batch.set(db.collection("schools").doc(SCHOOL_ID), {
    name: "Greenfield International School", location: "Dhaka, Bangladesh",
  });

  batch.set(db.collection("classes").doc(CLASS_ID), {
    className: "Class 10 - A", teacherId: TEACHER_UID, schoolId: SCHOOL_ID,
  });

  const students = [
    { id: "stu_rahul", fullName: "Rahul Kumar", rollNumber: "01" },
    { id: "stu_arjun", fullName: "Arjun Patel", rollNumber: "02" },
    { id: "stu_sneha", fullName: "Sneha Roy", rollNumber: "03" },
    { id: "stu_alisha", fullName: "Alisha Khan", rollNumber: "04" },
  ];
  for (const s of students) {
    batch.set(db.collection("students").doc(s.id), {
      ...s, classId: CLASS_ID, className: "Class 10 - A", section: "A", schoolId: SCHOOL_ID,
    });
  }

  const subjects = [
    { subject: "Mathematics", teacherName: "Mr. Arjun Singh", room: "Room 101", schedule: "08:00 AM", classId: CLASS_ID },
    { subject: "Physics", teacherName: "Mrs. Priya Sharma", room: "Room 102", schedule: "09:00 AM", classId: CLASS_ID },
  ];
  for (const sub of subjects) batch.set(db.collection("classSubjects").doc(), sub);

  batch.set(db.collection("policies").doc(SCHOOL_ID).collection("sections").doc("attendance"), {
    title: "Attendance Policy", section: "4.2",
    content: "Students must maintain a minimum of 75% attendance per term to be eligible to sit for term-end examinations. Medical leave with a certificate is counted at 50% weight toward this requirement.",
    keywords: ["attendance", "leave", "minimum", "percentage", "eligibility"],
  });
  batch.set(db.collection("policies").doc(SCHOOL_ID).collection("sections").doc("leave"), {
    title: "Leave Policy", section: "5.1",
    content: "Students are permitted up to 12 planned leave days per academic year with prior written notice to the class teacher. Emergency leave should be reported within 24 hours.",
    keywords: ["leave", "days", "planned", "emergency"],
  });

  batch.set(db.collection("schoolAnalytics").doc(SCHOOL_ID), {
    totalStudents: 620, totalTeachers: 45, totalClasses: 24,
    overallAttendancePercent: 87, updatedAt: new Date().toISOString(),
  });

  // Single-use invite codes so a freshly signed-up test account can link
  // itself to the seeded data above without any manual Firestore editing
  // (see api/onboarding/redeem-invite.ts). Each is scoped to one role and
  // one school; redeeming sets used:true so it can't be reused.
  const inviteCodes = [
    { code: "GISD-STU-7F3K2", role: "student", studentId: "stu_rahul" },
    { code: "GISD-STU-9H4L1", role: "student", studentId: "stu_arjun" },
    { code: "GISD-PAR-9K2M1", role: "parent", studentId: "stu_rahul" },
    { code: "GISD-TCH-4M8P0", role: "teacher", classIds: [CLASS_ID] },
  ];
  for (const invite of inviteCodes) {
    batch.set(db.collection("inviteCodes").doc(invite.code), {
      ...invite, schoolId: SCHOOL_ID, used: false, createdAt: new Date().toISOString(),
    });
  }

  await batch.commit();
  console.log("Seed complete. Remember to also create matching Firebase Auth users and users/{uid} profile docs.");
  console.log("Test invite codes:", inviteCodes.map((i) => `${i.code} (${i.role})`).join(", "));
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
