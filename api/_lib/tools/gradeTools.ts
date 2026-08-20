// ==========================================================================
// Grade Tools — academic results, read and write
// --------------------------------------------------------------------------
// Same contract as every other tool file: a Zod input schema, an allow-list
// of roles, an authorize() predicate, and a handler that calls the School
// Service layer. No handler here touches Firestore directly, and no handler
// accepts a studentId, classId or examId straight from the model — every id
// is RESOLVED from something the caller has been proven to own.
//
// Why grades need this said twice: marks are the most sensitive record a
// school holds after safeguarding notes. "Show me Priya's marks" from a
// classmate's account is the exact request this file has to refuse, and it
// refuses it structurally — a student's tool resolves to their own record
// regardless of the name argument, so there is no phrasing that widens it.
// ==========================================================================
import { z } from "zod";
import type { ToolDefinition } from "./registry.js";
import { ToolAuthorizationError, AmbiguousEntityError, NoDataError } from "./registry.js";
import type { ActionToolDefinition } from "./actionTools.js";
import { resolveSubjectStudent, resolveClassIdForCaller } from "./readTools.js";
import * as grades from "../school/grades.js";
import { validateScore } from "../../../src/lib/gradeMath.js";
import { isVerifiedManagement, type TrustedUserContext } from "../userContext.js";
import type { AISource } from "../../../src/types/index.js";

const ACADEMIC_SOURCE: AISource = { id: "academic-records", title: "Academic Records", kind: "academic" };

const SUBJECT = z
  .string()
  .max(40)
  .optional()
  .describe("Subject name to narrow to, e.g. 'Mathematics'. Omit for every subject.");

// --------------------------------------------------------------------------
// Reads
// --------------------------------------------------------------------------

export const getStudentGrades: ToolDefinition<{ subject?: string }, unknown> = {
  name: "getStudentGrades",
  description:
    "Get the signed-in student's own exam results: overall percentage, per-subject performance and each individual paper. Use this for any question about marks, results, grades or how they are doing academically.",
  inputSchema: z.object({ subject: SUBJECT }),
  allowedRoles: ["student"],
  requiresConfirmation: false,
  auditAction: "read:own_grades",
  authorize: async (ctx) => ({
    allowed: Boolean(ctx.studentId),
    reason: "This account isn't linked to a student record yet.",
  }),
  handler: async (ctx, input) => {
    // Resolves to the caller themself. A studentName argument does not exist
    // on this schema at all, so there is nothing for a jailbreak to set.
    const student = await resolveSubjectStudent(ctx);
    const result = await grades.getStudentGrades(student.id, ctx.schoolId, { subject: input.subject });
    if (result.noRecords) {
      throw new NoDataError(
        input.subject
          ? `No ${input.subject} results have been recorded for you yet.`
          : "No exam results have been recorded for you yet."
      );
    }
    return { studentName: student.fullName, className: student.className, ...result, source: ACADEMIC_SOURCE };
  },
};

export const getChildGrades: ToolDefinition<{ childName?: string; subject?: string }, unknown> = {
  name: "getChildGrades",
  description:
    "Get a parent's child's exam results: overall percentage, per-subject performance and each paper. Omit childName to use the child already being discussed; if the parent has several children and none is established yet, this asks which one.",
  inputSchema: z.object({ childName: z.string().max(80).optional(), subject: SUBJECT }),
  allowedRoles: ["parent"],
  requiresConfirmation: false,
  auditAction: "read:child_grades",
  authorize: async (ctx) => ({
    allowed: (ctx.linkedStudentIds?.length ?? 0) > 0,
    reason: "This account isn't linked to a child yet.",
  }),
  handler: async (ctx, input) => {
    // resolveSubjectStudent intersects the requested name with THIS parent's
    // linkedStudentIds — a name that isn't one of their children is refused
    // without revealing whether such a student exists at the school.
    const child = await resolveSubjectStudent(ctx, input.childName);
    const result = await grades.getChildGrades(child.id, ctx.schoolId, { subject: input.subject });
    if (result.noRecords) {
      throw new NoDataError(`No exam results have been recorded for ${child.fullName} yet.`);
    }
    return {
      studentName: child.fullName,
      className: child.className,
      ...result,
      source: ACADEMIC_SOURCE,
    };
  },
};

export const getClassGrades: ToolDefinition<{ className?: string; examTitle?: string }, unknown> = {
  name: "getClassGrades",
  description:
    "Get academic performance for one class: the class average, a per-subject breakdown and each student's aggregate, weakest first. Teachers may only query classes they are assigned to; verified management only classes in their own school.",
  inputSchema: z.object({
    className: z
      .string()
      .max(60)
      .optional()
      .describe("Class name such as 'Class 10 - A'; omit for the teacher's own first class"),
    examTitle: z.string().max(80).optional().describe("Narrow to one paper, e.g. 'Science Test'"),
  }),
  allowedRoles: ["teacher", "principal"],
  requiresConfirmation: false,
  auditAction: "read:class_grades",
  authorize: async (ctx) => ({
    allowed: isVerifiedManagement(ctx) || (ctx.teacherClassIds?.length ?? 0) > 0,
    reason: "You have no assigned classes.",
  }),
  handler: async (ctx, input) => {
    const classId = await resolveClassIdForCaller(ctx, input.className);
    const examId = input.examTitle ? (await resolveExamInClass(classId, input.examTitle)).id : undefined;
    const result = await grades.getClassGrades(classId, ctx.schoolId, { examId });
    if (result.noRecords) {
      throw new NoDataError("No exam results have been recorded for that class yet.");
    }
    return { ...result, source: ACADEMIC_SOURCE };
  },
};

export const getSchoolPerformance: ToolDefinition<Record<string, never>, unknown> = {
  name: "getSchoolPerformance",
  description:
    "Get school-wide academic performance for verified management: the overall average across every recorded paper, a per-class ranking, a per-subject breakdown and the classes falling behind.",
  inputSchema: z.object({}),
  allowedRoles: ["principal"],
  requiresConfirmation: false,
  auditAction: "read:school_performance",
  // Gated on the server-written GRANT, never on `role` — the same predicate
  // getSchoolAttendance and getSchoolAnalytics use. See userContext.ts.
  authorize: async (ctx) => ({
    allowed: isVerifiedManagement(ctx),
    reason: "School-wide performance is available to verified school management only.",
  }),
  handler: async (ctx) => {
    const result = await grades.getSchoolPerformanceAnalytics(ctx.schoolId);
    if (result.noRecords) {
      throw new NoDataError("No exam results have been recorded for your school yet.");
    }
    return { ...result, source: ACADEMIC_SOURCE };
  },
};

// --------------------------------------------------------------------------
// Write
// --------------------------------------------------------------------------

const recordExamResultInput = z.object({
  studentName: z.string().min(1).max(80),
  examTitle: z
    .string()
    .min(1)
    .max(80)
    .describe("The paper's title as the school records it, e.g. 'Science Test'"),
  score: z.number().min(0).max(1000).describe("Marks obtained"),
  maxScore: z.number().gt(0).max(1000).describe("Maximum marks for the paper"),
});

type RecordExamResultArgs = z.infer<typeof recordExamResultInput>;

/**
 * Resolves the exam by title WITHIN a class the caller already owns.
 *
 * The model never supplies an examId. It supplies words a teacher said, and
 * those words are matched against the papers belonging to a class the
 * teacher is assigned to — so the worst a confused (or steered) model can do
 * is name a paper that doesn't exist in their own class, which is refused.
 */
async function resolveExamInClass(classId: string, examTitle: string): Promise<grades.ExamDescriptor> {
  const exams = await grades.listExamsForClass(classId);
  if (exams.length === 0) throw new NoDataError("There are no exams recorded for that class yet.");

  const needle = examTitle.trim().toLowerCase().replace(/\s+/g, " ");
  const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");

  const exact = exams.filter((e) => norm(e.title) === needle);
  const contains = exams.filter((e) => norm(e.title).includes(needle));
  const bySubject = exams.filter((e) => norm(e.subject) === needle);

  for (const tier of [exact, bySubject, contains]) {
    if (tier.length === 1) return tier[0];
    if (tier.length > 1) throw new AmbiguousEntityError(tier.slice(0, 5).map((e) => e.title));
  }
  throw new NoDataError(`I couldn't find an exam called "${examTitle}" for that class.`);
}

/**
 * Resolves student + exam + validity once, so preview() and handler() can
 * never disagree about which mark is being written. Runs the same
 * teacher-scope check both times — exactly the shape resolveMarkTarget()
 * uses for attendance.
 */
async function resolveMarkEntryTarget(ctx: TrustedUserContext, input: RecordExamResultArgs) {
  const student = await resolveSubjectStudent(ctx, input.studentName);
  if (!(ctx.teacherClassIds ?? []).includes(student.classId)) {
    throw new ToolAuthorizationError(
      `${student.fullName} isn't in one of your assigned classes — I can only record marks for your own students.`
    );
  }

  const exam = await resolveExamInClass(student.classId, input.examTitle);
  if (exam.schoolId !== ctx.schoolId || exam.classId !== student.classId) {
    throw new ToolAuthorizationError("That paper doesn't belong to that student's class.");
  }

  const validation = validateScore(input.score, input.maxScore);
  if (!validation.valid) throw new ToolAuthorizationError(validation.reason ?? "That mark isn't valid.");

  const existing = await grades.getExamResult(exam.id, student.id);
  return { student, exam, existing };
}

export const recordExamResult: ActionToolDefinition<RecordExamResultArgs, unknown> = {
  name: "recordExamResult",
  description:
    "Record or correct one student's mark for one exam paper. Only for students in the teacher's own assigned classes. Always state both the marks obtained and the maximum marks.",
  inputSchema: recordExamResultInput,
  allowedRoles: ["teacher"],
  requiresConfirmation: true,
  auditAction: "write:exam_result",
  authorize: async (ctx) => ({
    allowed: (ctx.teacherClassIds?.length ?? 0) > 0,
    reason: "You have no assigned classes.",
  }),
  preview: async (ctx, input) => {
    const { student, exam, existing } = await resolveMarkEntryTarget(ctx, input);

    if (existing && existing.score === input.score && existing.maxScore === input.maxScore) {
      return {
        summary: `${student.fullName} is already recorded at ${input.score}/${input.maxScore} for ${exam.title}. Would you like me to re-save it anyway?`,
        details: {
          studentId: student.id,
          studentName: student.fullName,
          examId: exam.id,
          from: existing.score,
          to: input.score,
        },
        noOp: true,
      };
    }

    // Reads the live record first, so the question names the CURRENT mark
    // rather than asking the teacher to confirm in the dark.
    const summary = existing
      ? `${student.fullName} is currently recorded at ${existing.score}/${existing.maxScore} for ${exam.title}. Would you like me to change that to ${input.score}/${input.maxScore}?`
      : `${student.fullName} has no mark recorded for ${exam.title} yet. Would you like me to record ${input.score} out of ${input.maxScore}?`;

    return {
      summary,
      details: {
        studentId: student.id,
        studentName: student.fullName,
        className: student.className,
        examId: exam.id,
        examTitle: exam.title,
        subject: exam.subject,
        from: existing ? `${existing.score}/${existing.maxScore}` : null,
        to: `${input.score}/${input.maxScore}`,
      },
    };
  },
  handler: async (ctx, input) => {
    const { student, exam } = await resolveMarkEntryTarget(ctx, input);
    const outcome = await grades.recordExamResult({
      examId: exam.id,
      examTitle: exam.title,
      examDate: exam.date,
      subject: exam.subject,
      studentId: student.id,
      studentName: student.fullName,
      classId: student.classId,
      schoolId: ctx.schoolId,
      score: input.score,
      maxScore: input.maxScore,
      recordedBy: ctx.uid,
    });
    return {
      studentId: student.id,
      studentName: student.fullName,
      examTitle: exam.title,
      subject: exam.subject,
      score: outcome.score,
      maxScore: outcome.maxScore,
      percentage: outcome.percentage,
      previousScore: outcome.previousScore,
      changed: outcome.changed,
    };
  },
};

export const GRADE_READ_TOOLS = [
  getStudentGrades,
  getChildGrades,
  getClassGrades,
  getSchoolPerformance,
] as unknown as ToolDefinition<never, unknown>[];

export const GRADE_ACTION_TOOLS = [recordExamResult] as unknown as ToolDefinition<never, unknown>[];

export { resolveExamInClass };
