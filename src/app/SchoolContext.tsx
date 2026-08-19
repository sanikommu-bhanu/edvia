import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/app/AuthContext";
import { getSchool, getStudent, listLinkedChildren, listClassesForUser } from "@/services/school/school.service";
import type { ClassRecord, School, StudentRecord } from "@/types";

// ==========================================================================
// SchoolContext — "who is this user, at which school, in which class?"
// ==========================================================================
// Every screen used to answer that question by hardcoding `cls_10a` and the
// string "Class 10 - A". That made the app work for exactly one seeded
// account and quietly show one student's class to everybody else.
//
// This provider resolves the answer ONCE, from the authenticated profile:
//
//   student   → their own student record and its class
//   parent    → their linked children, one of them active at a time
//   teacher   → the classes assigned to them, one of them active
//   principal → every class in their school
//
// Screens read from here instead of embedding ids, so the same code renders
// correctly for any valid account — which is also what makes the demo
// reproducible with a freshly seeded database rather than one magic user.
//
// Nothing here is an authorization decision. It shapes what the UI asks for;
// firestore.rules decides what it is allowed to receive, and the AI tool
// layer re-derives scope independently from the ID token.
// ==========================================================================

export interface SchoolScope {
  school: School | null;
  /** The student currently in focus: self for a student, the active child for a parent. */
  student: StudentRecord | null;
  /** All children linked to a parent account; empty for other roles. */
  children: StudentRecord[];
  selectChild: (studentId: string) => void;
  /** Classes this user may see. */
  classes: ClassRecord[];
  activeClass: ClassRecord | null;
  activeClassId: string | null;
  selectClass: (classId: string) => void;
  /** True when the account has no student/class linkage yet (invite code not redeemed). */
  needsLinking: boolean;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const SchoolContext = createContext<SchoolScope | undefined>(undefined);

export function SchoolProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [school, setSchool] = useState<School | null>(null);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);
  const [activeClassId, setActiveClassId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!user?.schoolId) {
      setSchool(null);
      setStudents([]);
      setClasses([]);
      setActiveStudentId(null);
      setActiveClassId(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const [schoolRecord, resolvedStudents, resolvedClasses] = await Promise.all([
        getSchool(user.schoolId),
        resolveStudents(user.role, user.studentId, user.linkedStudentIds),
        listClassesForUser(user),
      ]);
      if (cancelled) return;

      setSchool(schoolRecord);
      setStudents(resolvedStudents);
      setClasses(sortClasses(resolvedClasses));

      // Keep the current selection if it's still valid, so a reload doesn't
      // yank a teacher back to their first class mid-task.
      setActiveStudentId((current) =>
        current && resolvedStudents.some((s) => s.id === current) ? current : (resolvedStudents[0]?.id ?? null)
      );
      setActiveClassId((current) => {
        if (current && resolvedClasses.some((c) => c.id === current)) return current;
        // A student or parent is anchored to their own class, not a picker.
        const anchored = resolvedStudents[0]?.classId;
        if (anchored && resolvedClasses.some((c) => c.id === anchored)) return anchored;
        return sortClasses(resolvedClasses)[0]?.id ?? anchored ?? null;
      });
      setLoading(false);
    })().catch((err: unknown) => {
      if (cancelled) return;
      console.error("Failed to resolve school context", err);
      setError("We couldn't retrieve your school details. Please try again.");
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [user, nonce]);

  const selectChild = useCallback((studentId: string) => {
    setActiveStudentId(studentId);
    setStudents((current) => {
      const next = current.find((s) => s.id === studentId);
      // Switching child also switches the class their content is read from.
      if (next) setActiveClassId(next.classId);
      return current;
    });
  }, []);

  const selectClass = useCallback((classId: string) => setActiveClassId(classId), []);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const value = useMemo<SchoolScope>(() => {
    const student = students.find((s) => s.id === activeStudentId) ?? students[0] ?? null;
    const activeClass = classes.find((c) => c.id === activeClassId) ?? null;
    const expectsLinking = user ? user.role !== "principal" : false;

    return {
      school,
      student,
      children: user?.role === "parent" ? students : [],
      selectChild,
      classes,
      activeClass,
      activeClassId: activeClassId ?? student?.classId ?? null,
      selectClass,
      needsLinking: Boolean(user) && expectsLinking && !loading && students.length === 0 && classes.length === 0,
      loading,
      error,
      reload,
    };
  }, [school, students, classes, activeStudentId, activeClassId, user, loading, error, selectChild, selectClass, reload]);

  return <SchoolContext.Provider value={value}>{children}</SchoolContext.Provider>;
}

export function useSchoolScope(): SchoolScope {
  const ctx = useContext(SchoolContext);
  if (!ctx) throw new Error("useSchoolScope must be used within SchoolProvider");
  return ctx;
}

/** A student sees themself; a parent sees their linked children; staff neither. */
async function resolveStudents(
  role: string,
  studentId: string | undefined,
  linkedStudentIds: string[] | undefined
): Promise<StudentRecord[]> {
  if (role === "student" && studentId) {
    const record = await getStudent(studentId);
    return record ? [record] : [];
  }
  if (role === "parent") {
    return listLinkedChildren(linkedStudentIds ?? []);
  }
  return [];
}

/** "Class 9 - A" before "Class 10 - A": natural order, not lexicographic. */
function sortClasses(classes: ClassRecord[]): ClassRecord[] {
  return [...classes].sort((a, b) =>
    a.className.localeCompare(b.className, undefined, { numeric: true, sensitivity: "base" })
  );
}
