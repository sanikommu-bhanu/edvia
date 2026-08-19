// ==========================================================================
// School Service — People (students, classes, schools)
// --------------------------------------------------------------------------
// Name resolution lives here rather than inside individual tools, because
// "which Rahul?" is a shared correctness problem: a substring match that
// silently picks the first hit is how an assistant ends up marking the
// wrong child absent. Every lookup is school-scoped, and every ambiguous
// match is reported as ambiguous rather than guessed.
// ==========================================================================
import { adminDb } from "../firebaseAdmin";

export interface StudentDoc {
  id: string;
  fullName: string;
  rollNumber: string;
  classId: string;
  className: string;
  section: string;
  schoolId: string;
  photoUrl?: string;
}

export interface ClassDoc {
  id: string;
  className: string;
  schoolId: string;
  teacherId?: string;
}

export type StudentLookup =
  | { kind: "found"; student: StudentDoc }
  | { kind: "none" }
  | { kind: "ambiguous"; candidates: StudentDoc[] };

/**
 * Resolves a spoken/typed student name inside an explicit scope.
 *
 * `classScope` is the caller's OWN permitted class list (a teacher's
 * assigned classes). Passing undefined means "anywhere in this school" and
 * is only valid for callers already authorized school-wide (principal) or
 * whose result is intersected with their own links afterwards (parent).
 */
export async function findStudentByName(
  schoolId: string,
  name: string,
  classScope?: string[]
): Promise<StudentLookup> {
  const students = await listStudents(schoolId, classScope);
  const needle = normalize(name);
  if (!needle) return { kind: "none" };

  const exact = students.filter((s) => normalize(s.fullName) === needle);
  const startsWith = students.filter((s) => normalize(s.fullName).startsWith(needle));
  const contains = students.filter((s) => normalize(s.fullName).includes(needle));
  const firstNameMatch = students.filter((s) => normalize(s.fullName).split(" ")[0] === needle);

  const tiers = [exact, firstNameMatch, startsWith, contains];
  for (const tier of tiers) {
    if (tier.length === 1) return { kind: "found", student: tier[0] };
    if (tier.length > 1) return { kind: "ambiguous", candidates: tier.slice(0, 5) };
  }
  return { kind: "none" };
}

export async function listStudents(schoolId: string, classScope?: string[]): Promise<StudentDoc[]> {
  if (classScope && classScope.length === 0) return [];

  // Firestore caps `in` at 30 values; chunk so a large teacher load still
  // resolves rather than silently truncating to the first 10 classes.
  if (classScope) {
    const chunks = chunk(classScope, 30);
    const results = await Promise.all(
      chunks.map((ids) =>
        adminDb()
          .collection("students")
          .where("schoolId", "==", schoolId)
          .where("classId", "in", ids)
          .get()
      )
    );
    return results.flatMap((snap) => snap.docs.map(toStudent));
  }

  const snap = await adminDb().collection("students").where("schoolId", "==", schoolId).get();
  return snap.docs.map(toStudent);
}

export async function getStudent(studentId: string): Promise<StudentDoc | null> {
  const snap = await adminDb().collection("students").doc(studentId).get();
  return snap.exists ? toStudent(snap) : null;
}

export async function getStudents(studentIds: string[]): Promise<StudentDoc[]> {
  if (studentIds.length === 0) return [];
  const refs = studentIds.map((id) => adminDb().collection("students").doc(id));
  const snaps = await adminDb().getAll(...refs);
  return snaps.filter((s) => s.exists).map(toStudent);
}

/** Student record with the school boundary enforced, or null if out of scope. */
export async function getStudentInSchool(studentId: string, schoolId: string): Promise<StudentDoc | null> {
  const student = await getStudent(studentId);
  if (!student || student.schoolId !== schoolId) return null;
  return student;
}

export async function getClass(classId: string): Promise<ClassDoc | null> {
  const snap = await adminDb().collection("classes").doc(classId).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  return {
    id: snap.id,
    className: (data.className as string) ?? snap.id,
    schoolId: data.schoolId as string,
    teacherId: data.teacherId as string | undefined,
  };
}

export async function listClassesForTeacher(teacherUid: string): Promise<ClassDoc[]> {
  const snap = await adminDb().collection("classes").where("teacherId", "==", teacherUid).get();
  return snap.docs.map((d) => ({
    id: d.id,
    className: (d.data().className as string) ?? d.id,
    schoolId: d.data().schoolId as string,
    teacherId: d.data().teacherId as string | undefined,
  }));
}

export async function listClassesInSchool(schoolId: string): Promise<ClassDoc[]> {
  const snap = await adminDb().collection("classes").where("schoolId", "==", schoolId).get();
  return snap.docs.map((d) => ({
    id: d.id,
    className: (d.data().className as string) ?? d.id,
    schoolId: d.data().schoolId as string,
    teacherId: d.data().teacherId as string | undefined,
  }));
}

export interface SchoolDoc {
  id: string;
  name: string;
  location?: string;
  logoUrl?: string;
}

export async function getSchool(schoolId: string): Promise<SchoolDoc | null> {
  const snap = await adminDb().collection("schools").doc(schoolId).get();
  if (!snap.exists) return null;
  return { id: snap.id, name: (snap.data()?.name as string) ?? "your school", location: snap.data()?.location };
}

export async function getSchoolName(schoolId: string): Promise<string> {
  const school = await getSchool(schoolId);
  return school?.name ?? "your school";
}

function toStudent(doc: FirebaseFirestore.DocumentSnapshot): StudentDoc {
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    fullName: (data.fullName as string) ?? "",
    rollNumber: (data.rollNumber as string) ?? "",
    classId: (data.classId as string) ?? "",
    className: (data.className as string) ?? "",
    section: (data.section as string) ?? "",
    schoolId: (data.schoolId as string) ?? "",
    photoUrl: data.photoUrl as string | undefined,
  };
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
