// ==========================================================================
// Firestore security rules tests
// ==========================================================================
// These test the rules themselves, which is something the in-memory suite in
// tests/ deliberately cannot do: rules only execute inside the Firestore
// emulator. The two suites cover different layers —
//
//   tests/authorization.test.ts  → the server-side tool boundary (Admin SDK,
//                                  which BYPASSES rules entirely)
//   this file                    → what the BROWSER can read directly
//
// Both matter. A perfect tool layer with open rules would still let a
// signed-in student read every classmate's attendance straight from the
// client SDK, without ever going near the assistant.
//
// Prerequisites: Java (the emulator is a JVM process) and firebase-tools.
//
//   firebase emulators:exec --only firestore "node scripts/testRules.mjs"
//
// Running it directly assumes an emulator is already listening on 8080.
// ==========================================================================
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { readFileSync } from "node:fs";

const PROJECT_ID = "edvia-rules-test";
const HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const [host, port] = HOST.split(":");

// ---- fixture identities ---------------------------------------------------

const GREENFIELD = "sch_greenfield";
const RIVERSIDE = "sch_riverside";
const CLASS_10A = "cls_10a";
const CLASS_10B = "cls_10b";
const RIVERSIDE_CLASS = "cls_rv_9a";

const USERS = {
  studentRahul: {
    uid: "uid_student_rahul",
    profile: { role: "student", schoolId: GREENFIELD, studentId: "stu_rahul", classIds: [CLASS_10A] },
  },
  parentOfRahul: {
    uid: "uid_parent_rahul",
    profile: { role: "parent", schoolId: GREENFIELD, linkedStudentIds: ["stu_rahul"], classIds: [CLASS_10A] },
  },
  teacher10A: {
    uid: "uid_teacher_10a",
    profile: { role: "teacher", schoolId: GREENFIELD, teacherId: "uid_teacher_10a", classIds: [CLASS_10A] },
  },
  teacher10B: {
    uid: "uid_teacher_10b",
    profile: { role: "teacher", schoolId: GREENFIELD, teacherId: "uid_teacher_10b", classIds: [CLASS_10B] },
  },
  principal: {
    uid: "uid_principal",
    profile: { role: "principal", schoolId: GREENFIELD, classIds: [] },
  },
  riversidePrincipal: {
    uid: "uid_principal_rv",
    profile: { role: "principal", schoolId: RIVERSIDE, classIds: [] },
  },
};

let passed = 0;
let failed = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed += 1;
    failures.push({ name, message: err?.message ?? String(err) });
    console.log(`  FAIL  ${name}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));
}

async function main() {
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host,
      port: Number(port),
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });

  // Seed with rules disabled — this is fixture setup, not a test.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    for (const { uid, profile } of Object.values(USERS)) {
      await setDoc(doc(db, "users", uid), profile);
    }

    await setDoc(doc(db, "schools", GREENFIELD), { name: "Greenfield International School" });
    await setDoc(doc(db, "schools", RIVERSIDE), { name: "Riverside Public School" });

    await setDoc(doc(db, "classes", CLASS_10A), { className: "Class 10 - A", schoolId: GREENFIELD });
    await setDoc(doc(db, "classes", CLASS_10B), { className: "Class 10 - B", schoolId: GREENFIELD });
    await setDoc(doc(db, "classes", RIVERSIDE_CLASS), { className: "Class 9 - A", schoolId: RIVERSIDE });

    await setDoc(doc(db, "students", "stu_rahul"), { fullName: "Rahul Kumar", classId: CLASS_10A, schoolId: GREENFIELD });
    await setDoc(doc(db, "students", "stu_arjun"), { fullName: "Arjun Patel", classId: CLASS_10A, schoolId: GREENFIELD });
    await setDoc(doc(db, "students", "stu_priya"), { fullName: "Priya Sharma", classId: CLASS_10B, schoolId: GREENFIELD });
    await setDoc(doc(db, "students", "stu_rv"), { fullName: "Ananya Bose", classId: RIVERSIDE_CLASS, schoolId: RIVERSIDE });

    await setDoc(doc(db, "attendance", "stu_rahul_2026-05-20"), {
      studentId: "stu_rahul", classId: CLASS_10A, schoolId: GREENFIELD, status: "present", date: "2026-05-20",
    });
    await setDoc(doc(db, "attendance", "stu_priya_2026-05-20"), {
      studentId: "stu_priya", classId: CLASS_10B, schoolId: GREENFIELD, status: "absent", date: "2026-05-20",
    });
    await setDoc(doc(db, "attendance", "stu_rv_2026-05-20"), {
      studentId: "stu_rv", classId: RIVERSIDE_CLASS, schoolId: RIVERSIDE, status: "present", date: "2026-05-20",
    });

    await setDoc(doc(db, "assignments", "asg_10a"), { title: "Maths", classId: CLASS_10A, schoolId: GREENFIELD });
    await setDoc(doc(db, "assignments", "asg_10b"), { title: "Trig", classId: CLASS_10B, schoolId: GREENFIELD });
    await setDoc(doc(db, "notices", "not_gf"), { title: "Annual Day", schoolId: GREENFIELD });
    await setDoc(doc(db, "notices", "not_rv"), { title: "Riverside Day", schoolId: RIVERSIDE });
    await setDoc(doc(db, "schoolAnalytics", GREENFIELD), { totalStudents: 3 });
    await setDoc(doc(db, "inviteCodes", "GISD-STU-RAHUL"), { role: "student", used: false });
    await setDoc(doc(db, "auditLogs", "log_1"), { userId: USERS.teacher10A.uid, action: "write:attendance" });
    await setDoc(doc(db, "conversationMemory", "conv_1"), { userId: USERS.parentOfRahul.uid });
    await setDoc(doc(db, "supportRequests", "req_1"), {
      requestedBy: USERS.parentOfRahul.uid,
      routedToUid: USERS.teacher10A.uid,
      recipientType: "teacher",
      schoolId: GREENFIELD,
    });
    await setDoc(doc(db, "notifications", "ntf_1"), { userId: USERS.studentRahul.uid, read: false, title: "Hi" });
  });

  const db = (key) => testEnv.authenticatedContext(USERS[key].uid).firestore();
  const anon = testEnv.unauthenticatedContext().firestore();

  // ---- students -----------------------------------------------------------
  section("students — access requires a relationship, not just a shared school");

  await check("student reads own record", () =>
    assertSucceeds(getDoc(doc(db("studentRahul"), "students", "stu_rahul")))
  );
  await check("student CANNOT read a classmate", () =>
    assertFails(getDoc(doc(db("studentRahul"), "students", "stu_arjun")))
  );
  await check("student CANNOT read a student in another class", () =>
    assertFails(getDoc(doc(db("studentRahul"), "students", "stu_priya")))
  );
  await check("parent reads their linked child", () =>
    assertSucceeds(getDoc(doc(db("parentOfRahul"), "students", "stu_rahul")))
  );
  await check("parent CANNOT read another family's child", () =>
    assertFails(getDoc(doc(db("parentOfRahul"), "students", "stu_priya")))
  );
  await check("teacher reads a student in their own class", () =>
    assertSucceeds(getDoc(doc(db("teacher10A"), "students", "stu_arjun")))
  );
  await check("teacher CANNOT read a student in another class", () =>
    assertFails(getDoc(doc(db("teacher10A"), "students", "stu_priya")))
  );
  await check("teacher lists their own class roster", () =>
    assertSucceeds(
      getDocs(query(collection(db("teacher10A"), "students"), where("classId", "==", CLASS_10A)))
    )
  );
  await check("teacher CANNOT list another class roster", () =>
    assertFails(getDocs(query(collection(db("teacher10B"), "students"), where("classId", "==", CLASS_10A))))
  );
  await check("teacher CANNOT list every student in the school", () =>
    assertFails(getDocs(query(collection(db("teacher10A"), "students"), where("schoolId", "==", GREENFIELD))))
  );
  await check("principal lists their own school's students", () =>
    assertSucceeds(getDocs(query(collection(db("principal"), "students"), where("schoolId", "==", GREENFIELD))))
  );
  await check("principal CANNOT read another school's student", () =>
    assertFails(getDoc(doc(db("riversidePrincipal"), "students", "stu_rahul")))
  );
  await check("nobody may write a student record from the client", () =>
    assertFails(setDoc(doc(db("principal"), "students", "stu_new"), { fullName: "X", schoolId: GREENFIELD }))
  );

  // ---- attendance ---------------------------------------------------------
  section("attendance — same relationship test, and no client writes at all");

  await check("student reads own attendance", () =>
    assertSucceeds(getDoc(doc(db("studentRahul"), "attendance", "stu_rahul_2026-05-20")))
  );
  await check("student CANNOT read another student's attendance", () =>
    assertFails(getDoc(doc(db("studentRahul"), "attendance", "stu_priya_2026-05-20")))
  );
  await check("parent reads their child's attendance", () =>
    assertSucceeds(getDoc(doc(db("parentOfRahul"), "attendance", "stu_rahul_2026-05-20")))
  );
  await check("parent CANNOT read another child's attendance", () =>
    assertFails(getDoc(doc(db("parentOfRahul"), "attendance", "stu_priya_2026-05-20")))
  );
  await check("teacher reads attendance for their own class", () =>
    assertSucceeds(
      getDocs(query(collection(db("teacher10A"), "attendance"), where("classId", "==", CLASS_10A)))
    )
  );
  await check("teacher CANNOT read attendance for another class", () =>
    assertFails(getDocs(query(collection(db("teacher10A"), "attendance"), where("classId", "==", CLASS_10B))))
  );
  await check("principal reads school-wide attendance", () =>
    assertSucceeds(getDocs(query(collection(db("principal"), "attendance"), where("schoolId", "==", GREENFIELD))))
  );
  await check("principal CANNOT read another school's attendance", () =>
    assertFails(getDoc(doc(db("riversidePrincipal"), "attendance", "stu_rahul_2026-05-20")))
  );
  await check("teacher CANNOT write attendance directly (server route only)", () =>
    assertFails(
      setDoc(doc(db("teacher10A"), "attendance", "stu_rahul_2026-05-21"), {
        studentId: "stu_rahul", classId: CLASS_10A, schoolId: GREENFIELD, status: "absent", date: "2026-05-21",
      })
    )
  );
  await check("teacher CANNOT amend an existing attendance record", () =>
    assertFails(updateDoc(doc(db("teacher10A"), "attendance", "stu_rahul_2026-05-20"), { status: "absent" }))
  );

  // ---- class content ------------------------------------------------------
  section("class content — scoped to classes you belong to");

  await check("student reads their own class's assignments", () =>
    assertSucceeds(getDocs(query(collection(db("studentRahul"), "assignments"), where("classId", "==", CLASS_10A))))
  );
  await check("student CANNOT read another class's assignments", () =>
    assertFails(getDocs(query(collection(db("studentRahul"), "assignments"), where("classId", "==", CLASS_10B))))
  );
  await check("class document is readable by its own members", () =>
    assertSucceeds(getDoc(doc(db("teacher10A"), "classes", CLASS_10A)))
  );
  await check("class document is NOT readable by an unrelated teacher", () =>
    assertFails(getDoc(doc(db("teacher10B"), "classes", CLASS_10A)))
  );

  // ---- school-wide, non-personal -----------------------------------------
  section("notices and analytics");

  await check("any member reads their school's notices", () =>
    assertSucceeds(getDocs(query(collection(db("studentRahul"), "notices"), where("schoolId", "==", GREENFIELD))))
  );
  await check("members CANNOT read another school's notices", () =>
    assertFails(getDoc(doc(db("studentRahul"), "notices", "not_rv")))
  );
  await check("principal reads their own analytics", () =>
    assertSucceeds(getDoc(doc(db("principal"), "schoolAnalytics", GREENFIELD)))
  );
  await check("teacher CANNOT read school analytics", () =>
    assertFails(getDoc(doc(db("teacher10A"), "schoolAnalytics", GREENFIELD)))
  );
  await check("another school's principal CANNOT read these analytics", () =>
    assertFails(getDoc(doc(db("riversidePrincipal"), "schoolAnalytics", GREENFIELD)))
  );

  // ---- profiles -----------------------------------------------------------
  section("users — no client-side privilege escalation");

  await check("user reads own profile", () =>
    assertSucceeds(getDoc(doc(db("studentRahul"), "users", USERS.studentRahul.uid)))
  );
  await check("user CANNOT read another user's profile", () =>
    assertFails(getDoc(doc(db("studentRahul"), "users", USERS.teacher10A.uid)))
  );
  await check("user CANNOT change their own role", () =>
    assertFails(updateDoc(doc(db("studentRahul"), "users", USERS.studentRahul.uid), { role: "principal" }))
  );
  await check("user CANNOT relink themselves to another student", () =>
    assertFails(updateDoc(doc(db("studentRahul"), "users", USERS.studentRahul.uid), { studentId: "stu_priya" }))
  );
  await check("parent CANNOT add a child to their own links", () =>
    assertFails(
      updateDoc(doc(db("parentOfRahul"), "users", USERS.parentOfRahul.uid), {
        linkedStudentIds: ["stu_rahul", "stu_priya"],
      })
    )
  );
  await check("user CANNOT grant themselves a class", () =>
    assertFails(updateDoc(doc(db("studentRahul"), "users", USERS.studentRahul.uid), { classIds: [CLASS_10B] }))
  );
  await check("user CANNOT move themselves to another school", () =>
    assertFails(updateDoc(doc(db("studentRahul"), "users", USERS.studentRahul.uid), { schoolId: RIVERSIDE }))
  );
  await check("user MAY change their own language", () =>
    assertSucceeds(updateDoc(doc(db("studentRahul"), "users", USERS.studentRahul.uid), { language: "ta" }))
  );

  // ---- fully closed collections ------------------------------------------
  section("server-only collections");

  await check("invite codes are never client-readable", () =>
    assertFails(getDoc(doc(db("studentRahul"), "inviteCodes", "GISD-STU-RAHUL")))
  );
  await check("audit logs are never client-readable", () =>
    assertFails(getDoc(doc(db("principal"), "auditLogs", "log_1")))
  );
  await check("conversation memory is never client-readable, even by its owner", () =>
    assertFails(getDoc(doc(db("parentOfRahul"), "conversationMemory", "conv_1")))
  );
  await check("an undeclared collection is denied by default", () =>
    assertFails(getDoc(doc(db("principal"), "secretStuff", "anything")))
  );

  // ---- support requests ---------------------------------------------------
  section("support requests");

  await check("requester reads their own request", () =>
    assertSucceeds(getDoc(doc(db("parentOfRahul"), "supportRequests", "req_1")))
  );
  await check("the routed teacher reads it too", () =>
    assertSucceeds(getDoc(doc(db("teacher10A"), "supportRequests", "req_1")))
  );
  await check("an unrelated teacher CANNOT read it", () =>
    assertFails(getDoc(doc(db("teacher10B"), "supportRequests", "req_1")))
  );
  await check("nobody may write one from the client", () =>
    assertFails(setDoc(doc(db("parentOfRahul"), "supportRequests", "req_2"), { message: "hi" }))
  );

  // ---- notifications ------------------------------------------------------
  section("notifications");

  await check("owner reads their own notification", () =>
    assertSucceeds(getDoc(doc(db("studentRahul"), "notifications", "ntf_1")))
  );
  await check("owner may flip only the read flag", () =>
    assertSucceeds(updateDoc(doc(db("studentRahul"), "notifications", "ntf_1"), { read: true }))
  );
  await check("owner CANNOT rewrite the notification body", () =>
    assertFails(updateDoc(doc(db("studentRahul"), "notifications", "ntf_1"), { title: "Tampered" }))
  );
  await check("another user CANNOT read it", () =>
    assertFails(getDoc(doc(db("teacher10A"), "notifications", "ntf_1")))
  );

  // ---- unauthenticated ----------------------------------------------------
  section("unauthenticated access");

  await check("anonymous CANNOT read a student", () => assertFails(getDoc(doc(anon, "students", "stu_rahul"))));
  await check("anonymous CANNOT read attendance", () =>
    assertFails(getDoc(doc(anon, "attendance", "stu_rahul_2026-05-20")))
  );
  await check("anonymous CANNOT read schools", () => assertFails(getDoc(doc(anon, "schools", GREENFIELD))));

  await testEnv.cleanup();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f.name}\n    ${f.message}`);
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\nRules tests could not run.");
  console.error(err?.message ?? err);
  console.error(
    "\nThe Firestore emulator must be running (it needs Java). Try:\n" +
      "  firebase emulators:exec --only firestore \"node scripts/testRules.mjs\""
  );
  process.exit(1);
});
