import { collection, getDocs, query, where } from "firebase/firestore";
import { requireFirebase } from "@/services/firebase/config";
import { apiPost } from "@/services/apiClient";
import {
  aggregateBy,
  bandLabel,
  weightedAggregate,
} from "@/lib/gradeMath";
import type { ExamResult, StudentGrades, SubjectPerformance } from "@/types";

// ==========================================================================
// Grades — client reads, server-mediated writes
// --------------------------------------------------------------------------
// Reads hit the SAME `examResults` collection EDVIA's AI tools query through
// the Admin SDK, and aggregate with the SAME functions the server uses
// (src/lib/gradeMath). The percentage a student reads on the Grades screen
// and the percentage EDVIA speaks in chat come from one implementation, so
// they cannot drift.
//
// Writes never go direct: firestore.rules deny all client writes to
// `examResults`, so saving marks goes through api/grades/record.ts, which
// re-verifies the teacher's class assignment and every studentId before
// touching anything.
//
// What the browser is ALLOWED to read is decided by firestore.rules, not by
// this file: a student's query for another student's marks does not return
// an empty list, it fails. That is deliberate — a client-side filter would
// mean the rows had already crossed the wire.
// ==========================================================================

export async function listStudentResults(studentId: string): Promise<ExamResult[]> {
  const { db } = requireFirebase();
  const snap = await getDocs(query(collection(db, "examResults"), where("studentId", "==", studentId)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as ExamResult)
    .sort((a, b) => (b.examDate ?? "").localeCompare(a.examDate ?? ""));
}

export async function listClassResults(classId: string): Promise<ExamResult[]> {
  const { db } = requireFirebase();
  const snap = await getDocs(query(collection(db, "examResults"), where("classId", "==", classId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ExamResult);
}

/** Results already recorded for one paper, keyed by student. */
export async function getExamResultsByStudent(examId: string): Promise<Record<string, ExamResult>> {
  const { db } = requireFirebase();
  const snap = await getDocs(query(collection(db, "examResults"), where("examId", "==", examId)));
  const byStudent: Record<string, ExamResult> = {};
  snap.docs.forEach((d) => {
    const result = { id: d.id, ...d.data() } as ExamResult;
    byStudent[result.studentId] = result;
  });
  return byStudent;
}

/**
 * The aggregate one Grades screen renders.
 *
 * Uses weightedAggregate rather than averaging the per-paper percentages, so
 * a 100-mark term paper counts for more than a 10-mark class test — matching
 * the server, the AI answer and the school's own report card.
 */
export function summariseResults(studentId: string, results: ExamResult[]): StudentGrades {
  const overall = weightedAggregate(results);
  const bySubject: SubjectPerformance[] = aggregateBy(results, (r) => r.subject)
    .map((group) => ({
      subject: group.key,
      percentage: group.percentage,
      totalScore: group.totalScore,
      totalMax: group.totalMax,
      count: group.count,
    }))
    .sort((a, b) => b.percentage - a.percentage);

  return {
    studentId,
    studentName: results[0]?.studentName,
    overall,
    bySubject,
    results: results.map((r) => ({
      examId: r.examId,
      examTitle: r.examTitle,
      subject: r.subject,
      score: r.score,
      maxScore: r.maxScore,
      percentage: r.percentage,
      examDate: r.examDate,
    })),
    noRecords: results.length === 0,
  };
}

export async function getStudentGrades(studentId: string): Promise<StudentGrades> {
  return summariseResults(studentId, await listStudentResults(studentId));
}

export interface RecordMarksInput {
  examId: string;
  maxScore: number;
  entries: { studentId: string; score: number }[];
}

export interface RecordMarksResponse {
  success: true;
  count: number;
  amended: number;
}

export async function recordExamMarks(input: RecordMarksInput): Promise<RecordMarksResponse> {
  return apiPost("/api/grades/record", input);
}

export { bandLabel };
