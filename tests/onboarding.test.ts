// ==========================================================================
// Self-serve onboarding — school creation, join tokens, and the attacks
// --------------------------------------------------------------------------
// These tests drive the REAL route handlers (the five actions behind
// api/onboarding/actions.ts) against the in-memory Firestore
// double, with only the ID-token verifier stubbed. So a passing test here is
// the shipped authorization logic passing, not a re-implementation of it.
//
// The security block at the bottom is the point of the file. Every attack in
// it is one the brief called out, and most of them are interesting precisely
// because they CANNOT be expressed: the redeem endpoint accepts a token and
// nothing else, so "forge the schoolId" has no field to put a schoolId in.
// Those cases assert that the forged value is ignored, which is the
// observable form of "there is nothing to forge".
// ==========================================================================
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fakeDb } from "./support/fakeFirestore";
import { verifyIdToken } from "../api/_lib/firebaseAdmin";
import {
  createSchoolHandler as createSchool,
  createClassHandler as createClass,
} from "../api/onboarding/actions";
import createInvite from "../api/_lib/onboarding/createInvite";
import previewInvite from "../api/invites/preview";
import redeemInvite from "../api/_lib/onboarding/redeem";
import manageInvites from "../api/_lib/onboarding/manageInvites";
import {
  hashSecret,
  generateHumanCode,
  generateInviteSecret,
  checkInvite,
  normalizeHumanCode,
  type InviteDoc,
} from "../api/_lib/invites";

// --------------------------------------------------------------------------
// Route-invocation harness
// --------------------------------------------------------------------------
interface Captured {
  status: number;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

type Handler = (req: never, res: never) => Promise<void>;

async function call(handler: Handler, uid: string | null, body: unknown): Promise<Captured> {
  if (uid) {
    vi.mocked(verifyIdToken).mockResolvedValue({ uid, email: `${uid}@example.com`, name: uid } as never);
  } else {
    vi.mocked(verifyIdToken).mockRejectedValue(new Error("no token"));
  }

  const captured: Captured = { status: 0, body: {}, headers: {} };
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(payload: Record<string, unknown>) {
      captured.body = payload;
      return this;
    },
    setHeader(key: string, value: string) {
      captured.headers[key] = value;
    },
  };

  await handler(
    { method: "POST", headers: { authorization: uid ? "Bearer test" : undefined }, body } as never,
    res as never
  );
  return captured;
}

/** Seeds a users/{uid} document directly, the way a real signup would. */
function seedUser(uid: string, data: Record<string, unknown> = {}) {
  fakeDb.load({
    users: {
      [uid]: {
        fullName: uid,
        email: `${uid}@example.com`,
        role: "student",
        schoolId: "",
        language: "en",
        onboardingComplete: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        ...data,
      },
    },
  });
}

async function userDoc(uid: string): Promise<Record<string, unknown>> {
  const snap = await fakeDb.collection("users").doc(uid).get();
  return (snap.data() ?? {}) as Record<string, unknown>;
}

/** Creates a school and returns its id plus its administrator's uid. */
async function foundSchool(uid = "uid_founder", name = "Robo School") {
  seedUser(uid);
  const res = await call(createSchool as Handler, uid, { name, location: "Hyderabad" });
  expect(res.status).toBe(201);
  return { schoolId: (res.body.school as { id: string }).id, uid };
}

/** Mints an invite and returns its one-shot credentials. */
async function mint(uid: string, body: Record<string, unknown>) {
  const res = await call(createInvite as Handler, uid, body);
  return res;
}

beforeEach(() => {
  fakeDb.reset();
  vi.mocked(verifyIdToken).mockReset();
});

// ==========================================================================
describe("SCHOOL — a new school onboards itself", () => {
  it("SCHOOL-01 an authenticated account can create a school", async () => {
    seedUser("uid_a");
    const res = await call(createSchool as Handler, "uid_a", {
      name: "Robo School",
      location: "Hyderabad",
      schoolType: "k12",
      academicYear: "2026-27",
    });

    expect(res.status).toBe(201);
    const school = res.body.school as { id: string; name: string };
    expect(school.name).toBe("Robo School");

    const stored = await fakeDb.collection("schools").doc(school.id).get();
    expect(stored.data()?.name).toBe("Robo School");
    expect(stored.data()?.createdBy).toBe("uid_a");
  });

  it("SCHOOL-02 the creator receives a server-written school-admin grant", async () => {
    const { schoolId, uid } = await foundSchool("uid_b");
    const profile = await userDoc(uid);

    // The grant, not the role, is what every authorization check reads.
    expect(profile.principalOfSchoolId).toBe(schoolId);
    expect(profile.schoolId).toBe(schoolId);
    expect(profile.role).toBe("principal");
  });

  it("rejects an unauthenticated request", async () => {
    const res = await call(createSchool as Handler, null, { name: "Ghost School" });
    expect(res.status).toBe(401);
    expect(await fakeDb.collection("schools").get()).toHaveProperty("empty", true);
  });

  it("refuses a second school for an account that already belongs to one", async () => {
    const { uid } = await foundSchool("uid_c");
    const res = await call(createSchool as Handler, uid, { name: "Second School" });
    expect(res.status).toBe(409);
  });

  it("rejects an empty school name rather than creating a nameless school", async () => {
    seedUser("uid_d");
    const res = await call(createSchool as Handler, "uid_d", { name: " " });
    expect(res.status).toBe(400);
  });
});

// ==========================================================================
describe("INVITE — issuing", () => {
  it("SCHOOL-03/04 a school admin can mint a teacher invite with a QR secret and a typed code", async () => {
    const { uid } = await foundSchool("uid_admin");
    const res = await mint(uid, { kind: "school_teacher" });

    expect(res.status).toBe(201);
    expect(typeof res.body.secret).toBe("string");
    expect((res.body.secret as string).length).toBeGreaterThan(20);
    // XXXXX-XXXXX from an alphabet with no O/0/I/1.
    expect(res.body.humanCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
  });

  it("stores only a hash — the raw secret never reaches the database", async () => {
    const { uid } = await foundSchool("uid_admin2");
    const res = await mint(uid, { kind: "school_teacher" });
    const secret = res.body.secret as string;

    const stored = await fakeDb.collection("invites").doc(hashSecret(secret)).get();
    expect(stored.exists).toBe(true);
    expect(JSON.stringify(stored.data())).not.toContain(secret);
    expect(stored.data()?.tokenHash).toBe(hashSecret(secret));
  });

  it("INVITE-01 the invite's role comes from its kind, not from the request", async () => {
    const { uid } = await foundSchool("uid_admin3");
    // A caller trying to smuggle a role in gets it ignored: the field is not
    // in the schema, and targetRole is looked up from a constant map.
    const res = await mint(uid, { kind: "school_teacher", targetRole: "principal", role: "principal" });
    expect(res.status).toBe(201);

    const stored = await fakeDb.collection("invites").doc((res.body.invite as { id: string }).id).get();
    expect(stored.data()?.targetRole).toBe("teacher");
  });

  it("a non-member cannot mint anything", async () => {
    seedUser("uid_outsider");
    const res = await mint("uid_outsider", { kind: "school_teacher" });
    expect(res.status).toBe(403);
  });

  it("SECURITY-02 a teacher cannot mint a school-admin invite", async () => {
    const { schoolId, uid: adminUid } = await foundSchool("uid_admin4");
    const teacherInvite = await mint(adminUid, { kind: "school_teacher" });
    seedUser("uid_teacher");
    await call(redeemInvite as Handler, "uid_teacher", { token: teacherInvite.body.secret });

    const attempt = await mint("uid_teacher", { kind: "school_admin" });
    expect(attempt.status).toBe(403);

    // And the grant did not appear by any other route.
    const profile = await userDoc("uid_teacher");
    expect(profile.principalOfSchoolId).toBeUndefined();
    expect(profile.schoolId).toBe(schoolId);
  });
});

// ==========================================================================
describe("INVITE — redeeming", () => {
  it("INVITE-02 a teacher joins by QR token and receives the teacher grant", async () => {
    const { schoolId, uid: adminUid } = await foundSchool("uid_admin5");
    const invite = await mint(adminUid, { kind: "school_teacher" });

    seedUser("uid_newteacher");
    const res = await call(redeemInvite as Handler, "uid_newteacher", { token: invite.body.secret });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("teacher");

    const profile = await userDoc("uid_newteacher");
    expect(profile.teacherId).toBe("uid_newteacher");
    expect(profile.schoolId).toBe(schoolId);
    expect(profile.role).toBe("teacher");
    expect(profile.principalOfSchoolId).toBeUndefined();
  });

  it("INVITE-03 the same invitation can also be joined by typing its code", async () => {
    const { uid: adminUid } = await foundSchool("uid_admin6");
    const invite = await mint(adminUid, { kind: "school_teacher" });

    seedUser("uid_typer");
    // Typed lower-case and without the dash, as someone actually would.
    const raw = (invite.body.humanCode as string).replace("-", "").toLowerCase();
    const res = await call(redeemInvite as Handler, "uid_typer", { code: raw });

    expect(res.status).toBe(200);
    expect((await userDoc("uid_typer")).teacherId).toBe("uid_typer");
  });

  it("INVITE-04 an invitation that never existed is refused", async () => {
    seedUser("uid_guess");
    const res = await call(redeemInvite as Handler, "uid_guess", { token: generateInviteSecret() });
    expect(res.status).toBe(404);
    expect((await userDoc("uid_guess")).schoolId).toBe("");
  });

  it("INVITE-05 an expired invitation is refused", async () => {
    const { uid: adminUid } = await foundSchool("uid_admin7");
    const invite = await mint(adminUid, { kind: "school_teacher" });
    const id = hashSecret(invite.body.secret as string);
    await fakeDb.collection("invites").doc(id).set(
      { expiresAt: "2020-01-01T00:00:00.000Z" },
      { merge: true }
    );

    seedUser("uid_late");
    const res = await call(redeemInvite as Handler, "uid_late", { token: invite.body.secret });
    expect(res.status).toBe(410);
    expect((await userDoc("uid_late")).teacherId).toBeUndefined();
  });

  it("INVITE-06 a revoked invitation is refused, by QR and by code", async () => {
    const { uid: adminUid } = await foundSchool("uid_admin8");
    const invite = await mint(adminUid, { kind: "school_teacher" });
    const inviteId = hashSecret(invite.body.secret as string);

    const revoked = await call(manageInvites as Handler, adminUid, { action: "revoke", inviteId });
    expect(revoked.status).toBe(200);

    seedUser("uid_revoked1");
    expect((await call(redeemInvite as Handler, "uid_revoked1", { token: invite.body.secret })).status).toBe(410);

    // Revocation must kill the typed code too, or a dead QR stays joinable.
    seedUser("uid_revoked2");
    expect((await call(redeemInvite as Handler, "uid_revoked2", { code: invite.body.humanCode })).status).toBe(404);
  });

  it("SECURITY-06 a single-use invitation cannot be replayed by a second account", async () => {
    const { uid: adminUid } = await foundSchool("uid_admin9");
    const invite = await mint(adminUid, { kind: "school_teacher", usageLimit: 1 });

    seedUser("uid_first");
    expect((await call(redeemInvite as Handler, "uid_first", { token: invite.body.secret })).status).toBe(200);

    seedUser("uid_second");
    const replay = await call(redeemInvite as Handler, "uid_second", { token: invite.body.secret });
    expect(replay.status).toBe(410);
    expect((await userDoc("uid_second")).teacherId).toBeUndefined();
  });

  it("redeeming twice from the SAME account is a no-op, not a second consumption", async () => {
    const { uid: adminUid } = await foundSchool("uid_admin10");
    const invite = await mint(adminUid, { kind: "school_teacher", usageLimit: 1 });

    seedUser("uid_doubletap");
    await call(redeemInvite as Handler, "uid_doubletap", { token: invite.body.secret });
    const again = await call(redeemInvite as Handler, "uid_doubletap", { token: invite.body.secret });

    expect(again.status).toBe(200);
    expect(again.body.alreadyRedeemed).toBe(true);
    const stored = await fakeDb.collection("invites").doc(hashSecret(invite.body.secret as string)).get();
    expect(stored.data()?.usedCount).toBe(1);
  });
});

// ==========================================================================
describe("CLASS and STUDENT", () => {
  async function schoolWithTeacher() {
    const { schoolId, uid: adminUid } = await foundSchool("uid_sadmin");
    const invite = await mint(adminUid, { kind: "school_teacher" });
    seedUser("uid_t");
    await call(redeemInvite as Handler, "uid_t", { token: invite.body.secret });
    return { schoolId, adminUid, teacherUid: "uid_t" };
  }

  it("CLASS-01 a verified teacher creates a class and becomes its teacher", async () => {
    const { schoolId, teacherUid } = await schoolWithTeacher();
    const res = await call(createClass as Handler, teacherUid, { className: "Class 10", section: "A" });

    expect(res.status).toBe(201);
    const created = res.body.class as { id: string; className: string };
    expect(created.className).toBe("Class 10 - A");

    const stored = await fakeDb.collection("classes").doc(created.id).get();
    expect(stored.data()?.teacherId).toBe(teacherUid);
    expect(stored.data()?.schoolId).toBe(schoolId);
  });

  it("an account with no teacher grant cannot create a class", async () => {
    seedUser("uid_nobody", { schoolId: "sch_x" });
    const res = await call(createClass as Handler, "uid_nobody", { className: "Class 1" });
    expect(res.status).toBe(403);
  });

  it("CLASS-02/03 the class invite carries a QR secret and a typed code", async () => {
    const { teacherUid } = await schoolWithTeacher();
    const cls = await call(createClass as Handler, teacherUid, { className: "Class 10", section: "A" });
    const classId = (cls.body.class as { id: string }).id;

    const invite = await mint(teacherUid, { kind: "class_student", classId });
    expect(invite.status).toBe(201);
    expect(invite.body.secret).toBeTruthy();
    expect(invite.body.humanCode).toBeTruthy();
  });

  it("STUDENT-01 a student joins the class and gets a student record, not a teacher grant", async () => {
    const { schoolId, teacherUid } = await schoolWithTeacher();
    const cls = await call(createClass as Handler, teacherUid, { className: "Class 10", section: "A" });
    const classId = (cls.body.class as { id: string }).id;
    const invite = await mint(teacherUid, { kind: "class_student", classId });

    seedUser("uid_student");
    const res = await call(redeemInvite as Handler, "uid_student", { token: invite.body.secret });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("student");

    const profile = await userDoc("uid_student");
    expect(profile.role).toBe("student");
    expect(profile.schoolId).toBe(schoolId);
    expect(profile.classIds).toEqual([classId]);
    expect(typeof profile.studentId).toBe("string");
    // The three grants a class invite must never be able to produce.
    expect(profile.teacherId).toBeUndefined();
    expect(profile.principalOfSchoolId).toBeUndefined();
    expect(profile.linkedStudentIds).toBeUndefined();

    const student = await fakeDb.collection("students").doc(profile.studentId as string).get();
    expect(student.data()?.classId).toBe(classId);
    expect(student.data()?.schoolId).toBe(schoolId);
  });

  it("a teacher cannot mint a student invite for a class they do not teach", async () => {
    const { adminUid, teacherUid } = await schoolWithTeacher();

    // A second teacher at the same school, with their own class.
    const invite2 = await mint(adminUid, { kind: "school_teacher" });
    seedUser("uid_t2");
    await call(redeemInvite as Handler, "uid_t2", { token: invite2.body.secret });
    const otherClass = await call(createClass as Handler, "uid_t2", { className: "Class 9", section: "B" });
    const otherClassId = (otherClass.body.class as { id: string }).id;

    const attempt = await mint(teacherUid, { kind: "class_student", classId: otherClassId });
    expect(attempt.status).toBe(403);
  });
});

// ==========================================================================
describe("PARENT", () => {
  async function classWithStudent() {
    const { schoolId, uid: adminUid } = await foundSchool("uid_padmin");
    const tInvite = await mint(adminUid, { kind: "school_teacher" });
    seedUser("uid_pteacher");
    await call(redeemInvite as Handler, "uid_pteacher", { token: tInvite.body.secret });

    const cls = await call(createClass as Handler, "uid_pteacher", { className: "Class 10", section: "A" });
    const classId = (cls.body.class as { id: string }).id;

    const sInvite = await mint("uid_pteacher", { kind: "class_student", classId });
    seedUser("uid_child");
    await call(redeemInvite as Handler, "uid_child", { token: sInvite.body.secret });
    const studentId = (await userDoc("uid_child")).studentId as string;

    return { schoolId, adminUid, teacherUid: "uid_pteacher", classId, studentId };
  }

  it("PARENT-01 a teacher mints a parent link for a student in their own class", async () => {
    const { teacherUid, studentId } = await classWithStudent();
    const res = await mint(teacherUid, { kind: "parent_link", studentId });

    expect(res.status).toBe(201);
    const stored = await fakeDb.collection("invites").doc(hashSecret(res.body.secret as string)).get();
    expect(stored.data()?.targetRole).toBe("parent");
    expect(stored.data()?.studentId).toBe(studentId);
    // Single use by default: a reusable parent link is a way to give a
    // stranger a named child's attendance.
    expect(stored.data()?.usageLimit).toBe(1);
  });

  it("PARENT-02 the parent joins and is linked to exactly that child", async () => {
    const { schoolId, teacherUid, studentId, classId } = await classWithStudent();
    const invite = await mint(teacherUid, { kind: "parent_link", studentId });

    seedUser("uid_parent");
    const res = await call(redeemInvite as Handler, "uid_parent", { token: invite.body.secret });

    expect(res.status).toBe(200);
    const profile = await userDoc("uid_parent");
    expect(profile.role).toBe("parent");
    expect(profile.schoolId).toBe(schoolId);
    expect(profile.linkedStudentIds).toEqual([studentId]);
    expect(profile.classIds).toEqual([classId]);
    expect(profile.teacherId).toBeUndefined();
    expect(profile.principalOfSchoolId).toBeUndefined();
    expect(profile.studentId).toBeUndefined();
  });

  it("PARENT-03 the parent is linked to no other child in the same class", async () => {
    const { teacherUid, studentId, classId } = await classWithStudent();

    // A second child joins the same class.
    const sInvite2 = await mint(teacherUid, { kind: "class_student", classId });
    seedUser("uid_child2");
    await call(redeemInvite as Handler, "uid_child2", { token: sInvite2.body.secret });
    const otherStudentId = (await userDoc("uid_child2")).studentId as string;

    const invite = await mint(teacherUid, { kind: "parent_link", studentId });
    seedUser("uid_parent2");
    await call(redeemInvite as Handler, "uid_parent2", { token: invite.body.secret });

    const linked = (await userDoc("uid_parent2")).linkedStudentIds as string[];
    expect(linked).toEqual([studentId]);
    expect(linked).not.toContain(otherStudentId);
  });
});

// ==========================================================================
describe("SECURITY — the attacks the brief names", () => {
  it("SECURITY-01/03 a student token never yields staff privilege", async () => {
    const { uid: adminUid } = await foundSchool("uid_secadmin");
    const tInvite = await mint(adminUid, { kind: "school_teacher" });
    seedUser("uid_st");
    await call(redeemInvite as Handler, "uid_st", { token: tInvite.body.secret });
    const cls = await call(createClass as Handler, "uid_st", { className: "Class 8" });
    const classId = (cls.body.class as { id: string }).id;
    const sInvite = await mint("uid_st", { kind: "class_student", classId });

    seedUser("uid_ambitious");
    // Every privilege field the attacker could hope to set, sent explicitly.
    await call(redeemInvite as Handler, "uid_ambitious", {
      token: sInvite.body.secret,
      role: "principal",
      targetRole: "principal",
      principalOfSchoolId: "sch_anything",
      teacherId: "uid_ambitious",
    });

    const profile = await userDoc("uid_ambitious");
    expect(profile.role).toBe("student");
    expect(profile.principalOfSchoolId).toBeUndefined();
    expect(profile.teacherId).toBeUndefined();
  });

  it("SECURITY-04 a teacher cannot redeem a parent token into a teacher grant", async () => {
    const { uid: adminUid } = await foundSchool("uid_secadmin2");
    const tInvite = await mint(adminUid, { kind: "school_teacher" });
    seedUser("uid_greedy");
    await call(redeemInvite as Handler, "uid_greedy", { token: tInvite.body.secret });

    const cls = await call(createClass as Handler, "uid_greedy", { className: "Class 7" });
    const classId = (cls.body.class as { id: string }).id;
    const sInvite = await mint("uid_greedy", { kind: "class_student", classId });
    seedUser("uid_kid");
    await call(redeemInvite as Handler, "uid_kid", { token: sInvite.body.secret });
    const studentId = (await userDoc("uid_kid")).studentId as string;

    const pInvite = await mint("uid_greedy", { kind: "parent_link", studentId });

    // The teacher redeems the PARENT token. The token decides the role, so
    // this demotes them to parent for that link — it cannot ADD privilege.
    const res = await call(redeemInvite as Handler, "uid_greedy", { token: pInvite.body.secret });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("parent");
    const profile = await userDoc("uid_greedy");
    expect(profile.principalOfSchoolId).toBeUndefined();
  });

  it("SECURITY-05 a token from another school is refused for an existing member", async () => {
    const a = await foundSchool("uid_school_a", "School A");
    const b = await foundSchool("uid_school_b", "School B");

    const inviteB = await mint(b.uid, { kind: "school_teacher" });

    // Someone already at School A tries School B's token.
    const teacherA = await mint(a.uid, { kind: "school_teacher" });
    seedUser("uid_crosser");
    await call(redeemInvite as Handler, "uid_crosser", { token: teacherA.body.secret });
    expect((await userDoc("uid_crosser")).schoolId).toBe(a.schoolId);

    const res = await call(redeemInvite as Handler, "uid_crosser", { token: inviteB.body.secret });
    expect(res.status).toBe(410);
    expect((await userDoc("uid_crosser")).schoolId).toBe(a.schoolId);
  });

  it("SECURITY-07 a modified token matches nothing", async () => {
    const { uid: adminUid } = await foundSchool("uid_secadmin3");
    const invite = await mint(adminUid, { kind: "school_teacher" });
    const tampered = `${(invite.body.secret as string).slice(0, -1)}X`;

    seedUser("uid_tamper");
    const res = await call(redeemInvite as Handler, "uid_tamper", { token: tampered });
    expect(res.status).toBe(404);
  });

  it("SECURITY-08/09/10 forged schoolId/classId/studentId in the body are ignored", async () => {
    const { schoolId, uid: adminUid } = await foundSchool("uid_secadmin4");
    const tInvite = await mint(adminUid, { kind: "school_teacher" });
    seedUser("uid_forge");

    const res = await call(redeemInvite as Handler, "uid_forge", {
      token: tInvite.body.secret,
      schoolId: "sch_victim",
      classId: "cls_victim",
      studentId: "stu_victim",
      linkedStudentIds: ["stu_victim"],
    });

    expect(res.status).toBe(200);
    const profile = await userDoc("uid_forge");
    // Every value came from the invite document, none from the request.
    expect(profile.schoolId).toBe(schoolId);
    expect(profile.classIds ?? []).toEqual([]);
    expect(profile.studentId).toBeUndefined();
    expect(profile.linkedStudentIds).toBeUndefined();
  });

  it("a teacher can only list invitations they issued themselves", async () => {
    const { uid: adminUid } = await foundSchool("uid_listadmin");
    await mint(adminUid, { kind: "school_teacher", label: "admin's invite" });

    const tInvite = await mint(adminUid, { kind: "school_teacher" });
    seedUser("uid_lister");
    await call(redeemInvite as Handler, "uid_lister", { token: tInvite.body.secret });

    const listed = await call(manageInvites as Handler, "uid_lister", { action: "list" });
    expect(listed.status).toBe(200);
    expect(listed.body.invites).toEqual([]);
  });

  it("a listing never returns a secret or a typed code", async () => {
    const { uid: adminUid } = await foundSchool("uid_listadmin2");
    const invite = await mint(adminUid, { kind: "school_teacher" });

    const listed = await call(manageInvites as Handler, adminUid, { action: "list" });
    const serialized = JSON.stringify(listed.body);
    expect(serialized).not.toContain(invite.body.secret as string);
    expect(serialized).not.toContain(invite.body.humanCode as string);
  });

  it("a teacher cannot revoke another school's invitation", async () => {
    const a = await foundSchool("uid_rev_a", "School A");
    const b = await foundSchool("uid_rev_b", "School B");
    const inviteB = await mint(b.uid, { kind: "school_teacher" });
    const inviteId = hashSecret(inviteB.body.secret as string);

    const res = await call(manageInvites as Handler, a.uid, { action: "revoke", inviteId });
    expect(res.status).toBe(404);
    const stored = await fakeDb.collection("invites").doc(inviteId).get();
    expect(stored.data()?.status).toBe("active");
  });
});

// ==========================================================================
describe("PREVIEW — unauthenticated, and deliberately thin", () => {
  it("describes a valid invitation without requiring a sign-in", async () => {
    const { uid: adminUid } = await foundSchool("uid_prevadmin", "Robo School");
    const invite = await mint(adminUid, { kind: "school_teacher" });

    const res = await call(previewInvite as Handler, null, { token: invite.body.secret });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.schoolName).toBe("Robo School");
    expect(res.body.roleLabel).toBe("Teacher invitation");
  });

  it("leaks nothing beyond what is printed on the QR card itself", async () => {
    const { schoolId, uid: adminUid } = await foundSchool("uid_prevadmin2");
    const invite = await mint(adminUid, { kind: "school_teacher" });

    const res = await call(previewInvite as Handler, null, { token: invite.body.secret });
    const serialized = JSON.stringify(res.body);

    expect(serialized).not.toContain(schoolId);
    expect(serialized).not.toContain(adminUid);
    expect(res.body).not.toHaveProperty("usedCount");
    expect(res.body).not.toHaveProperty("createdBy");
    expect(res.body).not.toHaveProperty("expiresAt");
    expect(res.body).not.toHaveProperty("studentId");
  });

  it("reveals only a child's FIRST name on a parent invitation", async () => {
    const { uid: adminUid } = await foundSchool("uid_prevadmin3");
    const tInvite = await mint(adminUid, { kind: "school_teacher" });
    seedUser("uid_prevteacher");
    await call(redeemInvite as Handler, "uid_prevteacher", { token: tInvite.body.secret });
    const cls = await call(createClass as Handler, "uid_prevteacher", { className: "Class 6" });
    const classId = (cls.body.class as { id: string }).id;

    fakeDb.load({
      students: {
        stu_named: { fullName: "Rahul Verma", classId, schoolId: (await userDoc("uid_prevteacher")).schoolId, rollNumber: "17" },
      },
    });
    const pInvite = await mint("uid_prevteacher", { kind: "parent_link", studentId: "stu_named" });

    const res = await call(previewInvite as Handler, null, { token: pInvite.body.secret });
    expect(res.body.childFirstName).toBe("Rahul");
    expect(JSON.stringify(res.body)).not.toContain("Verma");
    expect(JSON.stringify(res.body)).not.toContain("17");
  });

  it("refuses an unknown invitation without saying why it is unknown", async () => {
    const res = await call(previewInvite as Handler, null, { token: generateInviteSecret() });
    expect(res.status).toBe(404);
    expect(res.body.valid).toBe(false);
  });

  it("reports a revoked invitation as gone rather than as never having existed", async () => {
    const { uid: adminUid } = await foundSchool("uid_prevadmin4");
    const invite = await mint(adminUid, { kind: "school_teacher" });
    await call(manageInvites as Handler, adminUid, {
      action: "revoke",
      inviteId: hashSecret(invite.body.secret as string),
    });

    const res = await call(previewInvite as Handler, null, { token: invite.body.secret });
    expect(res.status).toBe(410);
  });
});

// ==========================================================================
describe("token primitives", () => {
  it("secrets are unguessable and never repeat", () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateInviteSecret()));
    expect(seen.size).toBe(500);
    expect([...seen][0].length).toBeGreaterThanOrEqual(26);
  });

  it("human codes avoid the characters people misread", () => {
    for (let i = 0; i < 300; i += 1) {
      const code = generateHumanCode();
      expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
      expect(code).not.toMatch(/[O0I1]/);
    }
  });

  it("normalises however someone types a code", () => {
    expect(normalizeHumanCode("abcde fghjk")).toBe("ABCDE-FGHJK");
    expect(normalizeHumanCode("ABCDEFGHJK")).toBe("ABCDE-FGHJK");
    expect(normalizeHumanCode("abcde-fghjk")).toBe("ABCDE-FGHJK");
  });

  it("checkInvite names the reason rather than returning a bare boolean", () => {
    const base = {
      tokenHash: "x",
      kind: "school_teacher",
      targetRole: "teacher",
      schoolId: "s",
      humanCode: "AAAAA-BBBBB",
      createdBy: "u",
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: null,
      usageLimit: null,
      usedCount: 0,
      status: "active",
      usedBy: [],
      label: "",
    } satisfies InviteDoc;

    expect(checkInvite({ ...base })).toBeNull();
    expect(checkInvite({ ...base, status: "revoked" })).toBe("revoked");
    expect(checkInvite({ ...base, expiresAt: "2020-01-01T00:00:00.000Z" })).toBe("expired");
    expect(checkInvite({ ...base, usageLimit: 1, usedCount: 1 })).toBe("exhausted");
  });
});
