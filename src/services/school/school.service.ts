import { collection, doc, documentId, getDoc, getDocs, query, where } from "firebase/firestore";
import { requireFirebase } from "@/services/firebase/config";
import type { School, StudentRecord, ClassSubject, ClassRecord, Role, UserProfile } from "@/types";

// `schools` is readable by any signed-in user (see firestore.rules) so
// onboarding's school picker works before the user has a schoolId yet.
export async function listSchools(searchQuery = ""): Promise<School[]> {
  const { db } = requireFirebase();
  const snap = await getDocs(collection(db, "schools"));
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as School);
  const q = searchQuery.trim().toLowerCase();
  return q ? all.filter((s) => s.name.toLowerCase().includes(q)) : all;
}

export async function getSchool(schoolId: string): Promise<School | null> {
  const { db } = requireFirebase();
  const snap = await getDoc(doc(db, "schools", schoolId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as School) : null;
}

export async function getStudent(studentId: string): Promise<StudentRecord | null> {
  const { db } = requireFirebase();
  const snap = await getDoc(doc(db, "students", studentId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as StudentRecord) : null;
}

export async function listLinkedChildren(studentIds: string[]): Promise<StudentRecord[]> {
  if (!studentIds.length) return [];
  const results = await Promise.all(studentIds.map((id) => getStudent(id)));
  return results.filter((s): s is StudentRecord => s !== null);
}

export async function getClass(classId: string): Promise<ClassRecord | null> {
  const { db } = requireFirebase();
  const snap = await getDoc(doc(db, "classes", classId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as ClassRecord) : null;
}

/**
 * The classes this user may actually see, resolved from their authenticated
 * profile — never from a hardcoded id.
 *
 * Principals read their whole school; everyone else reads exactly the
 * classIds written onto their profile server-side during invite redemption.
 * These two branches mirror the two branches in firestore.rules, so a query
 * that succeeds here is one the rules were written to allow.
 */
export async function listClassesForUser(user: UserProfile): Promise<ClassRecord[]> {
  const { db } = requireFirebase();

  if (user.role === "principal") {
    const snap = await getDocs(query(collection(db, "classes"), where("schoolId", "==", user.schoolId)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ClassRecord);
  }

  const ids = user.classIds ?? [];
  if (ids.length === 0) return [];

  // documentId() `in` queries are capped at 30 ids; chunk rather than
  // silently truncating a teacher with a heavy timetable.
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));

  const results = await Promise.all(
    chunks.map((chunk) => getDocs(query(collection(db, "classes"), where(documentId(), "in", chunk))))
  );
  return results.flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ClassRecord));
}

export async function listClassSubjects(classId: string): Promise<ClassSubject[]> {
  const { db } = requireFirebase();
  const snap = await getDocs(query(collection(db, "classSubjects"), where("classId", "==", classId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ClassSubject);
}

export async function listClassStudents(classId: string): Promise<StudentRecord[]> {
  const { db } = requireFirebase();
  const snap = await getDocs(query(collection(db, "students"), where("classId", "==", classId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StudentRecord);
}

export function roleHomePath(role: Role): string {
  switch (role) {
    case "student": return "/student";
    case "parent": return "/parent";
    case "teacher": return "/teacher";
    case "principal": return "/principal";
  }
}
