import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { requireFirebase } from "@/services/firebase/config";
import type { School, StudentRecord, ClassSubject, Role } from "@/types";

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

// Principal analytics summary — backed by the schoolAnalytics/{schoolId}
// document (the same source api/_lib/tools/readTools.ts's getSchoolAnalytics
// reads via the Admin SDK), so the dashboard and EDVIA's AI answers agree.
export async function schoolSummary(schoolId: string) {
  const { db } = requireFirebase();
  const snap = await getDoc(doc(db, "schoolAnalytics", schoolId));
  if (!snap.exists()) {
    return { totalStudents: 0, totalTeachers: 0, totalClasses: 0, overallAttendancePercent: 0 };
  }
  const data = snap.data();
  return {
    totalStudents: data.totalStudents ?? 0,
    totalTeachers: data.totalTeachers ?? 0,
    totalClasses: data.totalClasses ?? 0,
    overallAttendancePercent: data.overallAttendancePercent ?? 0,
  };
}

export function roleHomePath(role: Role): string {
  switch (role) {
    case "student": return "/student";
    case "parent": return "/parent";
    case "teacher": return "/teacher";
    case "principal": return "/principal";
  }
}
