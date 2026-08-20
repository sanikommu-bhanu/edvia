// ==========================================================================
// School Service — Grades / exam results
// --------------------------------------------------------------------------
// Same contract as the other services in this folder: every function takes
// an ALREADY-AUTHORIZED scope (a studentId, classId or schoolId the caller
// has been proven to have access to). Nothing here derives scope from a
// model-supplied argument, and nothing here consults a role — that decision
// belongs to the tool layer and the API routes, which know the caller's
// real identity.
//
// The data model deliberately does NOT hang a single `score` field off the
// exam document. An exam is shared by a whole class; one score field on it
// would mean every student in Class 10-A has the same mark, which is how
// the old `exams.score` field made the Exams tab look right for exactly one
// seeded student. Results live in their own `examResults` collection, one
// document per student per paper.
//
// Idempotency mirrors attendance: the document id is `${examId}_${studentId}`
// (gradeMath.examResultId), so re-recording a mark AMENDS it instead of
// appending a duplicate that would silently skew every average.
// ==========================================================================
import { adminDb } from "../firebaseAdmin.js";
import {
  aggregateBy,
  bandFor,
  examResultId,
  percentageFor,
  validateScore,
  weightedAggregate,
  type PerformanceBand,
} from "../../../src/lib/gradeMath.js";
import { resolveClassNames } from "./attendance.js";

export interface ExamResultDoc {
  id: string;
  examId: string;
  examTitle: string;
  studentId: string;
  studentName: string;
  classId: string;
  schoolId: string;
  subject: string;
  score: number;
  maxScore: number;
  /** Stored as well as derived: a stored figure is what the school signed off. */
  percentage: number;
  examDate: string;
  createdAt: string;
  updatedAt: string;
  recordedBy: string;
  /** Previous mark when a result was amended — powers the audit trail. */
  previousScore?: number | null;
}

export interface SubjectPerformance {
  subject: string;
  percentage: number;
  totalScore: number;
  totalMax: number;
  count: number;
  band: PerformanceBand;
}

export interface StudentGradesResult {
  studentId: string;
  studentName?: string;
  classId?: string;
  overall: { percentage: number; totalScore: number; totalMax: number; count: number };
  band: PerformanceBand;
  bySubject: SubjectPerformance[];
  results: {
    examId: string;
    examTitle: string;
    subject: string;
    score: number;
    maxScore: number;
    percentage: number;
    examDate: string;
  }[];
  /**
   * True when nothing has been recorded. The caller MUST say "no results
   * recorded yet" rather than reporting a confident 0% — the two statements
   * are not the same, and only one of them is true.
   */
  noRecords: boolean;
}

// --------------------------------------------------------------------------
// Reads
// --------------------------------------------------------------------------

async function fetchStudentResults(studentId: string, subject?: string): Promise<ExamResultDoc[]> {
  let query: FirebaseFirestore.Query = adminDb()
    .collection("examResults")
    .where("studentId", "==", studentId);
  if (subject) query = query.where("subject", "==", subject);
  const snap = await query.get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<ExamResultDoc, "id">) }))
    .sort((a, b) => (b.examDate ?? "").localeCompare(a.examDate ?? ""));
}

/**
 * Everything recorded for one student, aggregated.
 *
 * `schoolId` is passed and checked rather than assumed: a studentId that
 * resolved correctly at the tool layer could still, in a future refactor,
 * belong to another school. Filtering here means a cross-school result can
 * never reach a caller even if the layer above stops checking.
 */
export async function getStudentGrades(
  studentId: string,
  schoolId: string,
  options: { subject?: string } = {}
): Promise<StudentGradesResult> {
  const raw = (await fetchStudentResults(studentId, options.subject)).filter(
    (r) => r.schoolId === schoolId
  );

  const overall = weightedAggregate(raw);
  const bySubject = aggregateBy(raw, (r) => r.subject)
    .map((group) => ({
      subject: group.key,
      percentage: group.percentage,
      totalScore: group.totalScore,
      totalMax: group.totalMax,
      count: group.count,
      band: bandFor(group.percentage),
    }))
    .sort((a, b) => b.percentage - a.percentage);

  return {
    studentId,
    studentName: raw[0]?.studentName,
    classId: raw[0]?.classId,
    overall,
    band: bandFor(overall.percentage),
    bySubject,
    results: raw.map((r) => ({
      examId: r.examId,
      examTitle: r.examTitle,
      subject: r.subject,
      score: r.score,
      maxScore: r.maxScore,
      percentage: r.percentage,
      examDate: r.examDate,
    })),
    noRecords: raw.length === 0,
  };
}

/**
 * The parent-facing entry point, named for the caller rather than the row.
 *
 * Identical mechanics to getStudentGrades — the difference that matters is
 * upstream: getChildGrades is only ever reached after the tool layer has
 * intersected the requested child with the caller's OWN linkedStudentIds
 * (see readTools.resolveSubjectStudent). Naming it separately keeps that
 * contract visible at every call site instead of relying on a comment.
 */
export async function getChildGrades(
  childStudentId: string,
  schoolId: string,
  options: { subject?: string } = {}
): Promise<StudentGradesResult> {
  return getStudentGrades(childStudentId, schoolId, options);
}

export interface ClassGradesResult {
  classId: string;
  className?: string;
  overallPercentage: number;
  resultCount: number;
  bySubject: SubjectPerformance[];
  /** Per-student roll-up, weakest first — the list a teacher actually acts on. */
  students: {
    studentId: string;
    studentName: string;
    percentage: number;
    count: number;
    band: PerformanceBand;
  }[];
  noRecords: boolean;
}

export async function getClassGrades(
  classId: string,
  schoolId: string,
  options: { examId?: string } = {}
): Promise<ClassGradesResult> {
  let query: FirebaseFirestore.Query = adminDb()
    .collection("examResults")
    .where("classId", "==", classId);
  if (options.examId) query = query.where("examId", "==", options.examId);
  const snap = await query.get();
  const raw = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<ExamResultDoc, "id">) }))
    .filter((r) => r.schoolId === schoolId);

  const names = await resolveClassNames([classId]);
  const overall = weightedAggregate(raw);

  const byStudent = aggregateBy(raw, (r) => r.studentId).map((group) => {
    const first = raw.find((r) => r.studentId === group.key);
    return {
      studentId: group.key,
      studentName: first?.studentName ?? group.key,
      percentage: group.percentage,
      count: group.count,
      band: bandFor(group.percentage),
    };
  });

  return {
    classId,
    className: names[classId],
    overallPercentage: overall.percentage,
    resultCount: raw.length,
    bySubject: aggregateBy(raw, (r) => r.subject)
      .map((g) => ({
        subject: g.key,
        percentage: g.percentage,
        totalScore: g.totalScore,
        totalMax: g.totalMax,
        count: g.count,
        band: bandFor(g.percentage),
      }))
      .sort((a, b) => b.percentage - a.percentage),
    students: byStudent.sort((a, b) => a.percentage - b.percentage),
    noRecords: raw.length === 0,
  };
}

export interface SchoolPerformanceResult {
  schoolId: string;
  overallPercentage: number;
  resultCount: number;
  perClass: { classId: string; className: string; percentage: number; count: number }[];
  bySubject: { subject: string; percentage: number; count: number }[];
  classesNeedingAttention: { classId: string; className: string; percentage: number }[];
  noRecords: boolean;
}

/**
 * School-wide academic roll-up.
 *
 * Percentages are re-derived from raw marks (weightedAggregate) rather than
 * averaged from per-class percentages, for the same reason the attendance
 * roll-up is: a six-student class must not swing the school figure as hard
 * as a forty-student one.
 */
export async function getSchoolPerformanceAnalytics(schoolId: string): Promise<SchoolPerformanceResult> {
  const snap = await adminDb().collection("examResults").where("schoolId", "==", schoolId).get();
  const raw = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ExamResultDoc, "id">) }));

  const overall = weightedAggregate(raw);
  const perClassRaw = aggregateBy(raw, (r) => r.classId);
  const names = await resolveClassNames(perClassRaw.map((c) => c.key));

  const perClass = perClassRaw
    .map((group) => ({
      classId: group.key,
      className: names[group.key] ?? group.key,
      percentage: group.percentage,
      count: group.count,
    }))
    .sort((a, b) => a.percentage - b.percentage);

  return {
    schoolId,
    overallPercentage: overall.percentage,
    resultCount: raw.length,
    perClass,
    bySubject: aggregateBy(raw, (r) => r.subject)
      .map((g) => ({ subject: g.key, percentage: g.percentage, count: g.count }))
      .sort((a, b) => a.percentage - b.percentage),
    classesNeedingAttention: perClass.filter((c) => c.percentage < 60).slice(0, 3),
    noRecords: raw.length === 0,
  };
}

/** One student's result for one paper, or null if it was never recorded. */
export async function getExamResult(examId: string, studentId: string): Promise<ExamResultDoc | null> {
  const snap = await adminDb().collection("examResults").doc(examResultId(examId, studentId)).get();
  return snap.exists ? ({ id: snap.id, ...(snap.data() as Omit<ExamResultDoc, "id">) }) : null;
}

export interface ExamDescriptor {
  id: string;
  title: string;
  subject: string;
  date: string;
  classId: string;
  schoolId: string;
}

/** The exam document, used to prove a paper belongs to the caller's class. */
export async function getExam(examId: string): Promise<ExamDescriptor | null> {
  const snap = await adminDb().collection("exams").doc(examId).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  return {
    id: snap.id,
    title: (data.title as string) ?? snap.id,
    subject: (data.subject as string) ?? "",
    date: (data.date as string) ?? "",
    classId: (data.classId as string) ?? "",
    schoolId: (data.schoolId as string) ?? "",
  };
}

/** Exams belonging to a class, most recent first. Used by the marks entry UI. */
export async function listExamsForClass(classId: string): Promise<ExamDescriptor[]> {
  const snap = await adminDb().collection("exams").where("classId", "==", classId).get();
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        title: (data.title as string) ?? d.id,
        subject: (data.subject as string) ?? "",
        date: (data.date as string) ?? "",
        classId: (data.classId as string) ?? "",
        schoolId: (data.schoolId as string) ?? "",
      };
    })
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

// --------------------------------------------------------------------------
// Writes
// --------------------------------------------------------------------------

export interface RecordExamResultInput {
  examId: string;
  examTitle: string;
  examDate: string;
  subject: string;
  studentId: string;
  studentName: string;
  classId: string;
  schoolId: string;
  score: number;
  maxScore: number;
  recordedBy: string;
}

export interface RecordExamResultOutcome {
  id: string;
  examId: string;
  studentId: string;
  score: number;
  maxScore: number;
  percentage: number;
  previousScore: number | null;
  /** False when the record already carried this exact mark — nothing changed. */
  changed: boolean;
}

/**
 * Creates or amends exactly one student-exam result.
 *
 * Score validation is repeated here even though the tool schema and the API
 * route both check it. Three layers, one rule (gradeMath.validateScore) —
 * a future caller reaching this function directly still cannot write a mark
 * above the maximum.
 */
export async function recordExamResult(input: RecordExamResultInput): Promise<RecordExamResultOutcome> {
  const validation = validateScore(input.score, input.maxScore);
  if (!validation.valid) throw new InvalidScoreError(validation.reason ?? "That mark isn't valid.");

  const id = examResultId(input.examId, input.studentId);
  const ref = adminDb().collection("examResults").doc(id);
  const existing = await ref.get();
  const previous = existing.exists ? ((existing.data() as ExamResultDoc).score ?? null) : null;
  const now = new Date().toISOString();

  const record: Omit<ExamResultDoc, "id"> = {
    examId: input.examId,
    examTitle: input.examTitle,
    studentId: input.studentId,
    studentName: input.studentName,
    classId: input.classId,
    schoolId: input.schoolId,
    subject: input.subject,
    score: input.score,
    maxScore: input.maxScore,
    percentage: percentageFor(input.score, input.maxScore),
    examDate: input.examDate,
    createdAt: existing.exists ? ((existing.data() as ExamResultDoc).createdAt ?? now) : now,
    updatedAt: now,
    recordedBy: input.recordedBy,
    previousScore: previous,
  };
  await ref.set(record, { merge: true });

  return {
    id,
    examId: input.examId,
    studentId: input.studentId,
    score: input.score,
    maxScore: input.maxScore,
    percentage: record.percentage,
    previousScore: previous,
    changed: previous !== input.score,
  };
}

/** Whole-class marks entry from the teacher's Enter Marks screen. */
export async function recordClassExamResults(
  entries: RecordExamResultInput[]
): Promise<{ written: number; amended: number }> {
  if (entries.length === 0) return { written: 0, amended: 0 };
  for (const entry of entries) {
    const validation = validateScore(entry.score, entry.maxScore);
    if (!validation.valid) throw new InvalidScoreError(validation.reason ?? "That mark isn't valid.");
  }

  const db = adminDb();
  const refs = entries.map((e) => db.collection("examResults").doc(examResultId(e.examId, e.studentId)));
  const existing = await db.getAll(...refs);
  const now = new Date().toISOString();

  const batch = db.batch();
  let amended = 0;
  entries.forEach((entry, i) => {
    const prevDoc = existing[i].exists ? (existing[i].data() as ExamResultDoc) : null;
    const previous = prevDoc?.score ?? null;
    if (previous !== null && previous !== entry.score) amended += 1;

    const record: Omit<ExamResultDoc, "id"> = {
      examId: entry.examId,
      examTitle: entry.examTitle,
      studentId: entry.studentId,
      studentName: entry.studentName,
      classId: entry.classId,
      schoolId: entry.schoolId,
      subject: entry.subject,
      score: entry.score,
      maxScore: entry.maxScore,
      percentage: percentageFor(entry.score, entry.maxScore),
      examDate: entry.examDate,
      createdAt: prevDoc?.createdAt ?? now,
      updatedAt: now,
      recordedBy: entry.recordedBy,
      previousScore: previous,
    };
    batch.set(refs[i], record, { merge: true });
  });
  await batch.commit();

  return { written: entries.length, amended };
}

/** A mark outside 0..maxScore. Surfaced to the user verbatim — it is safe. */
export class InvalidScoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidScoreError";
  }
}
