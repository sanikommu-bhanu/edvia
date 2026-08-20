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
    // principalOfSchoolId is the GRANT — written server-side by
    // api/onboarding/redeem-invite.ts against a single-use school code.
    profile: {
      role: "principal",
      schoolId: GREENFIELD,
      principalOfSchoolId: GREENFIELD,
      classIds: [],
    },
  },
  riversidePrincipal: {
    uid: "uid_principal_rv",
    profile: {
      role: "principal",
      schoolId: RIVERSIDE,
      principalOfSchoolId: RIVERSIDE,
      classIds: [],
    },
  },
  /**
   * CRIT-01: signed up, chose "Principal / Admin", picked a real school and
   * never redeemed a code. The profile SAYS principal; nothing granted it.
   * Every direct-Firestore read below must refuse this account.
   */
  selfDeclaredPrincipal: {
    uid: "uid_fake_principal",
    profile: { role: "principal", schoolId: GREENFIELD, classIds: [] },
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

    // Exam results: one document per student per paper, keyed
    // examId_studentId exactly as api/_lib/school/grades.ts writes them.
    await setDoc(doc(db, "examResults", "exm_sci_stu_rahul"), {
      examId: "exm_sci", studentId: "stu_rahul", classId: CLASS_10A, schoolId: GREENFIELD,
      subject: "Science", score: 40, maxScore: 50, percentage: 80,
    });
    await setDoc(doc(db, "examResults", "exm_sci_stu_arjun"), {
      examId: "exm_sci", studentId: "stu_arjun", classId: CLASS_10A, schoolId: GREENFIELD,
      subject: "Science", score: 46, maxScore: 50, percentage: 92,
    });
    await setDoc(doc(db, "examResults", "exm_math_stu_priya"), {
      examId: "exm_math", studentId: "stu_priya", classId: CLASS_10B, schoolId: GREENFIELD,
      subject: "Mathematics", score: 44, maxScore: 100, percentage: 44,
    });
    await setDoc(doc(db, "examResults", "exm_math_stu_rv"), {
      examId: "exm_math", studentId: "stu_rv", classId: RIVERSIDE_CLASS, schoolId: RIVERSIDE,
      subject: "Mathematics", score: 88, maxScore: 100, percentage: 88,
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
      routedClassId: CLASS_10A,
      recipientType: "teacher",
      status: "pending",
      schoolId: GREENFIELD,
    });
    // A management-routed request: visible to VERIFIED management of the same
    // school, and to nobody else who merely works there.
    await setDoc(doc(db, "supportRequests", "req_mgmt"), {
      requestedBy: USERS.parentOfRahul.uid,
      routedToUid: null,
      routedClassId: null,
      recipientType: "management",
      status: "pending",
      schoolId: GREENFIELD,
    });
    await setDoc(doc(db, "notifications", "ntf_1"), { userId: USERS.studentRahul.uid, read: false, title: "Hi" });
  });

  const db = (key) => testEnv.authenticatedContext(USERS[key].uid).firestore();
  /** A freshly authenticated account with no profile document yet. */
  const freshSignup = testEnv.authenticatedContext("uid_new_signup").firestore();
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

  // ---- exam results -------------------------------------------------------
  // The class relationship is NOT sufficient here. A classmate may read the
  // class's exam PAPER but must never read another student's MARK for it —
  // which is the distinction that separates this block from the one above.
  section("exam results — the student relationship, not the class one");

  await check("student reads their own result", () =>
    assertSucceeds(getDoc(doc(db("studentRahul"), "examResults", "exm_sci_stu_rahul")))
  );
  await check("student CANNOT read a classmate's result", () =>
    assertFails(getDoc(doc(db("studentRahul"), "examResults", "exm_sci_stu_arjun")))
  );
  await check("student CANNOT list every result for their own class", () =>
    assertFails(
      getDocs(query(collection(db("studentRahul"), "examResults"), where("classId", "==", CLASS_10A)))
    )
  );
  await check("student CANNOT list results by exam", () =>
    assertFails(
      getDocs(query(collection(db("studentRahul"), "examResults"), where("examId", "==", "exm_sci")))
    )
  );
  await check("parent reads their linked child's result", () =>
    assertSucceeds(getDoc(doc(db("parentOfRahul"), "examResults", "exm_sci_stu_rahul")))
  );
  await check("parent CANNOT read another family's child's result", () =>
    assertFails(getDoc(doc(db("parentOfRahul"), "examResults", "exm_math_stu_priya")))
  );
  await check("teacher reads results for a class they teach", () =>
    assertSucceeds(
      getDocs(query(collection(db("teacher10A"), "examResults"), where("classId", "==", CLASS_10A)))
    )
  );
  await check("teacher CANNOT read results for another class", () =>
    assertFails(
      getDocs(query(collection(db("teacher10A"), "examResults"), where("classId", "==", CLASS_10B)))
    )
  );
  await check("principal reads their own school's results", () =>
    assertSucceeds(
      getDocs(query(collection(db("principal"), "examResults"), where("schoolId", "==", GREENFIELD)))
    )
  );
  await check("principal CANNOT read another school's result", () =>
    assertFails(getDoc(doc(db("riversidePrincipal"), "examResults", "exm_sci_stu_rahul")))
  );
  await check("self-declared principal CANNOT read any result", () =>
    assertFails(getDoc(doc(db("selfDeclaredPrincipal"), "examResults", "exm_sci_stu_rahul")))
  );
  await check("a student CANNOT rewrite their own mark", () =>
    assertFails(updateDoc(doc(db("studentRahul"), "examResults", "exm_sci_stu_rahul"), { score: 50 }))
  );
  await check("a teacher CANNOT write a mark directly (server route only)", () =>
    assertFails(
      setDoc(doc(db("teacher10A"), "examResults", "exm_sci_stu_new"), {
        examId: "exm_sci", studentId: "stu_arjun", classId: CLASS_10A, schoolId: GREENFIELD, score: 50, maxScore: 50,
      })
    )
  );
  await check("anonymous CANNOT read a result", () =>
    assertFails(getDoc(doc(anon, "examResults", "exm_sci_stu_rahul")))
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
  await check("verified management reads the school's management queue", () =>
    assertSucceeds(getDoc(doc(db("principal"), "supportRequests", "req_mgmt")))
  );
  await check("management CANNOT read a teacher-routed request they aren't the recipient of", () =>
    assertFails(getDoc(doc(db("principal"), "supportRequests", "req_1")))
  );
  await check("another school's principal CANNOT read the management queue", () =>
    assertFails(getDoc(doc(db("riversidePrincipal"), "supportRequests", "req_mgmt")))
  );
  await check("a self-declared principal CANNOT read the management queue", () =>
    assertFails(getDoc(doc(db("selfDeclaredPrincipal"), "supportRequests", "req_mgmt")))
  );
  await check("the routed teacher CANNOT flip the status from the client", () =>
    // Status changes go through api/support/update-status.ts so the
    // transition is transactional, forward-only and audited.
    assertFails(updateDoc(doc(db("teacher10A"), "supportRequests", "req_1"), { status: "resolved" }))
  );
  await check("the requester CANNOT mark their own escalation resolved", () =>
    assertFails(updateDoc(doc(db("parentOfRahul"), "supportRequests", "req_1"), { status: "resolved" }))
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

  // ---- CRIT-01: self-declared principal -----------------------------------
  // The direct-Firestore half of the fix. The tool layer refuses this
  // account too (tests/authorization.test.ts), but rules are what stand
  // between a self-declared principal and the browser SDK, so they must
  // refuse independently of anything the API does.
  section("self-declared principal (CRIT-01)");

  await check("self-declared principal CANNOT read a student", () =>
    assertFails(getDoc(doc(db("selfDeclaredPrincipal"), "students", "stu_rahul")))
  );
  await check("self-declared principal CANNOT list the school roster", () =>
    assertFails(
      getDocs(query(collection(db("selfDeclaredPrincipal"), "students"), where("schoolId", "==", GREENFIELD)))
    )
  );
  await check("self-declared principal CANNOT read attendance", () =>
    assertFails(getDoc(doc(db("selfDeclaredPrincipal"), "attendance", "stu_rahul_2026-05-20")))
  );
  await check("self-declared principal CANNOT read a class", () =>
    assertFails(getDoc(doc(db("selfDeclaredPrincipal"), "classes", CLASS_10A)))
  );
  await check("self-declared principal CANNOT read school analytics", () =>
    assertFails(getDoc(doc(db("selfDeclaredPrincipal"), "schoolAnalytics", GREENFIELD)))
  );
  await check("verified principal CAN still read the roster (fix is not a blanket denial)", () =>
    assertSucceeds(getDocs(query(collection(db("principal"), "students"), where("schoolId", "==", GREENFIELD))))
  );

  // ---- the grant itself must not be client-writable ------------------------
  section("principalOfSchoolId is server-written only");

  await check("a student CANNOT grant themselves principalOfSchoolId", () =>
    assertFails(
      updateDoc(doc(db("studentRahul"), "users", "uid_student_rahul"), { principalOfSchoolId: GREENFIELD })
    )
  );
  await check("a self-declared principal CANNOT grant themselves the field", () =>
    assertFails(
      updateDoc(doc(db("selfDeclaredPrincipal"), "users", "uid_fake_principal"), {
        principalOfSchoolId: GREENFIELD,
      })
    )
  );
  await check("a verified principal CANNOT move their grant to another school", () =>
    assertFails(updateDoc(doc(db("principal"), "users", "uid_principal"), { principalOfSchoolId: RIVERSIDE }))
  );
  await check("a new account CANNOT set principalOfSchoolId at creation", () =>
    assertFails(
      setDoc(doc(freshSignup, "users", "uid_new_signup"), {
        role: "principal",
        schoolId: GREENFIELD,
        principalOfSchoolId: GREENFIELD,
      })
    )
  );

  // ---- rate-limit counters are server-only ---------------------------------
  section("rate limit counters");

  await check("a user CANNOT read their own rate-limit counter", () =>
    assertFails(getDoc(doc(db("studentRahul"), "rateLimits", "uid_student_rahul_ai_chat_0")))
  );
  await check("a user CANNOT reset their own rate-limit counter", () =>
    assertFails(setDoc(doc(db("studentRahul"), "rateLimits", "uid_student_rahul_ai_chat_0"), { count: 0 }))
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
