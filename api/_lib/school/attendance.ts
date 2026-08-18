// ==========================================================================
// School Service — Attendance
// --------------------------------------------------------------------------
// Part of the authorized School API layer that sits between EDVIA's tool
// layer and Firestore. Tools NEVER touch Firestore directly; they validate
// + authorize, then call one of these functions. The same functions back
// the non-AI UI routes (api/attendance/mark.ts), so a record written by a
// teacher tapping "Save Attendance" and one written by EDVIA's
// markAttendance tool are byte-identical.
//
// Idempotency: attendance is keyed by `${studentId}_${date}`, not an
// auto-id. Re-marking the same student on the same day UPDATES that day's
// record instead of appending a second one — without this, saving a class
// twice would silently halve everyone's attendance percentage.
// ==========================================================================
import { adminDb } from "../firebaseAdmin";
import {
  tallyAttendance,
  rollUpPercentage,
  type AttendanceStatusValue,
  type AttendanceTally,
} from "../../../src/lib/attendanceMath";

export interface AttendanceRecordDoc {
  studentId: string;
  classId: string;
  schoolId: string;
  status: AttendanceStatusValue;
  date: string; // ISO yyyy-mm-dd
  markedBy: string;
  markedAt: string;
  /** Previous status when a record was amended — powers the audit trail. */
  previousStatus?: AttendanceStatusValue | null;
}

export function attendanceDocId(studentId: string, date: string): string {
  return studentId + "_" + date;
}

export interface PeriodBounds {
  start: string;
  end: string;
}

export interface StudentAttendanceResult extends AttendanceTally {
  studentId: string;
  studentName?: string;
  period: PeriodBounds;
  /**
   * True when the window contains no records at all — the caller must say
   * "no records for that period" rather than reporting a confident 0%.
   */
  noRecords: boolean;
}

export async function getStudentAttendance(
  studentId: string,
  bounds: PeriodBounds
): Promise<StudentAttendanceResult> {
  const snap = await adminDb()
    .collection("attendance")
    .where("studentId", "==", studentId)
    .where("date", ">=", bounds.start)
    .where("date", "<=", bounds.end)
    .get();
  const statuses = snap.docs.map((d) => (d.data() as AttendanceRecordDoc).status);
  return {
    studentId,
    period: bounds,
    noRecords: statuses.length === 0,
    ...tallyAttendance(statuses),
  };
}

/** Non-present dates within a window — backs "when was he absent?" follow-ups. */
export async function getAbsenceDates(
  studentId: string,
  bounds: PeriodBounds
): Promise<{ date: string; status: AttendanceStatusValue }[]> {
  const snap = await adminDb()
    .collection("attendance")
    .where("studentId", "==", studentId)
    .where("date", ">=", bounds.start)
    .where("date", "<=", bounds.end)
    .get();
  return snap.docs
    .map((d) => d.data() as AttendanceRecordDoc)
    .filter((r) => r.status !== "present")
    .map((r) => ({ date: r.date, status: r.status }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** A single day's record, or null if that day was never marked. */
export async function getAttendanceForDate(
  studentId: string,
  date: string
): Promise<AttendanceRecordDoc | null> {
  const snap = await adminDb().collection("attendance").doc(attendanceDocId(studentId, date)).get();
  return snap.exists ? (snap.data() as AttendanceRecordDoc) : null;
}

export interface MarkAttendanceInput {
  studentId: string;
  classId: string;
  schoolId: string;
  status: AttendanceStatusValue;
  date: string;
  markedBy: string;
}

export interface MarkAttendanceResult {
  studentId: string;
  date: string;
  status: AttendanceStatusValue;
  previousStatus: AttendanceStatusValue | null;
  /** False when the record already had this exact status — nothing changed. */
  changed: boolean;
}

/** Creates or amends exactly one student-day record. */
export async function markAttendance(input: MarkAttendanceInput): Promise<MarkAttendanceResult> {
  const ref = adminDb().collection("attendance").doc(attendanceDocId(input.studentId, input.date));
  const existing = await ref.get();
  const previousStatus = existing.exists
    ? ((existing.data() as AttendanceRecordDoc).status ?? null)
    : null;

  const record: AttendanceRecordDoc = {
    studentId: input.studentId,
    classId: input.classId,
    schoolId: input.schoolId,
    status: input.status,
    date: input.date,
    markedBy: input.markedBy,
    markedAt: new Date().toISOString(),
    previousStatus,
  };
  await ref.set(record, { merge: true });

  return {
    studentId: input.studentId,
    date: input.date,
    status: input.status,
    previousStatus,
    changed: previousStatus !== input.status,
  };
}

/** Whole-class save from the teacher's Mark Attendance screen. */
export async function markClassAttendance(
  entries: MarkAttendanceInput[]
): Promise<{ written: number; amended: number }> {
  if (entries.length === 0) return { written: 0, amended: 0 };
  const db = adminDb();
  const refs = entries.map((e) => db.collection("attendance").doc(attendanceDocId(e.studentId, e.date)));
  const existing = await db.getAll(...refs);

  const batch = db.batch();
  let amended = 0;
  entries.forEach((entry, i) => {
    const prev = existing[i].exists ? ((existing[i].data() as AttendanceRecordDoc).status ?? null) : null;
    if (prev !== null && prev !== entry.status) amended += 1;
    const record: AttendanceRecordDoc = {
      studentId: entry.studentId,
      classId: entry.classId,
      schoolId: entry.schoolId,
      status: entry.status,
      date: entry.date,
      markedBy: entry.markedBy,
      markedAt: new Date().toISOString(),
      previousStatus: prev,
    };
    batch.set(refs[i], record, { merge: true });
  });
  await batch.commit();
  return { written: entries.length, amended };
}

export interface ClassAttendanceResult extends AttendanceTally {
  classId: string;
  className?: string;
  period: PeriodBounds;
  noRecords: boolean;
}

export async function getClassAttendance(
  classId: string,
  bounds: PeriodBounds
): Promise<ClassAttendanceResult> {
  const snap = await adminDb()
    .collection("attendance")
    .where("classId", "==", classId)
    .where("date", ">=", bounds.start)
    .where("date", "<=", bounds.end)
    .get();
  const statuses = snap.docs.map((d) => (d.data() as AttendanceRecordDoc).status);
  const names = await resolveClassNames([classId]);
  return {
    classId,
    className: names[classId],
    period: bounds,
    noRecords: statuses.length === 0,
    ...tallyAttendance(statuses),
  };
}

export interface SchoolAttendanceResult {
  schoolId: string;
  period: PeriodBounds;
  overallPercentage: number;
  totalRecords: number;
  perClass: { classId: string; className: string; percentage: number; total: number }[];
  classesNeedingAttention: { classId: string; className: string; percentage: number }[];
  noRecords: boolean;
}

/**
 * School-wide roll-up. Percentages are re-derived from raw record counts
 * (see rollUpPercentage) rather than averaging per-class percentages, so a
 * 6-student class can't swing the school number as hard as a 40-student one.
 */
export async function getSchoolAttendanceAnalytics(
  schoolId: string,
  bounds: PeriodBounds
): Promise<SchoolAttendanceResult> {
  const snap = await adminDb()
    .collection("attendance")
    .where("schoolId", "==", schoolId)
    .where("date", ">=", bounds.start)
    .where("date", "<=", bounds.end)
    .get();

  const byClass = new Map<string, AttendanceStatusValue[]>();
  snap.docs.forEach((d) => {
    const r = d.data() as AttendanceRecordDoc;
    const bucket = byClass.get(r.classId) ?? [];
    bucket.push(r.status);
    byClass.set(r.classId, bucket);
  });

  const classNames = await resolveClassNames(Array.from(byClass.keys()));
  const perClass = Array.from(byClass.entries())
    .map(([classId, statuses]) => {
      const t = tallyAttendance(statuses);
      return {
        classId,
        className: classNames[classId] ?? classId,
        percentage: t.percentage,
        total: t.total,
        present: t.present,
        leave: t.leave,
      };
    })
    .sort((a, b) => a.percentage - b.percentage);

  return {
    schoolId,
    period: bounds,
    overallPercentage: rollUpPercentage(perClass),
    totalRecords: snap.size,
    perClass: perClass.map((c) => ({
      classId: c.classId,
      className: c.className,
      percentage: c.percentage,
      total: c.total,
    })),
    classesNeedingAttention: perClass
      .filter((c) => c.percentage < 85)
      .slice(0, 3)
      .map((c) => ({ classId: c.classId, className: c.className, percentage: c.percentage })),
    noRecords: snap.empty,
  };
}

export async function resolveClassNames(classIds: string[]): Promise<Record<string, string>> {
  if (classIds.length === 0) return {};
  const refs = classIds.map((id) => adminDb().collection("classes").doc(id));
  const snaps = await adminDb().getAll(...refs);
  return Object.fromEntries(
    snaps.filter((s) => s.exists).map((s) => [s.id, (s.data()?.className as string) ?? s.id])
  );
}
