// ==========================================================================
// Read Tools
// --------------------------------------------------------------------------
// A tool is: a Zod input schema + an allow-list of roles + an authorize()
// predicate + a handler that calls the School Service layer
// (api/_lib/school/*). No handler in this file touches Firestore directly,
// and no handler derives its scope from a model-supplied id without first
// proving that id belongs to something the caller may see.
//
// Reading order for reviewers: allowedRoles is the coarse gate, authorize()
// is the per-call ownership/school-boundary gate, and the handler is
// already inside both.
// ==========================================================================
import { z } from "zod";
import type { ToolDefinition } from "./registry.js";
import { ToolAuthorizationError, AmbiguousEntityError, NoDataError } from "./registry.js";
import { resolvePeriod, type Period } from "./dateRange.js";
import * as attendanceService from "../school/attendance.js";
import * as people from "../school/people.js";
import * as academics from "../school/academics.js";
import * as support from "../school/support.js";
import { isVerifiedManagement, type TrustedUserContext } from "../userContext.js";
import type { AISource } from "../../../src/types/index.js";

const PERIOD_ENUM = z.enum([
  "today",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "this_term",
  "all_time",
]);

const ATTENDANCE_SOURCE: AISource = {
  id: "attendance-records",
  title: "Attendance Records",
  kind: "attendance",
};
const ACADEMIC_SOURCE: AISource = { id: "academic-records", title: "Academic Records", kind: "academic" };
const SCHOOL_SOURCE: AISource = { id: "school-records", title: "School Records", kind: "school" };

// --------------------------------------------------------------------------
// Shared subject resolution
// --------------------------------------------------------------------------

/**
 * Which student is this request actually about?
 *
 * Students resolve to themselves, full stop — a studentName argument from
 * the model is ignored rather than honoured, so "show me Priya's
 * attendance" from a student account can never widen scope.
 *
 * Parents resolve ONLY within their own linkedStudentIds. Name matching
 * happens against that list, never against the school roster, so a parent
 * can't even probe whether a given child exists at the school.
 *
 * `conversationStudentId` is the child established earlier in this same
 * conversation (see memory.ts). It is still intersected with
 * linkedStudentIds below, so conversational context can only ever narrow
 * the answer, never widen it — Part 8's "memory must never override
 * authorization" rule enforced in code, not in the prompt.
 */
async function resolveSubjectStudent(
  ctx: TrustedUserContext,
  requestedName?: string
): Promise<people.StudentDoc> {
  if (ctx.role === "student") {
    if (!ctx.studentId) throw new ToolAuthorizationError("This account isn't linked to a student record yet.");
    const student = await people.getStudentInSchool(ctx.studentId, ctx.schoolId);
    if (!student) throw new NoDataError("I couldn't find your student record.");
    return student;
  }

  if (ctx.role === "parent") {
    const linkedIds = ctx.linkedStudentIds ?? [];
    if (linkedIds.length === 0) {
      throw new ToolAuthorizationError("This account isn't linked to a child yet.");
    }
    const children = (await people.getStudents(linkedIds)).filter((c) => c.schoolId === ctx.schoolId);
    if (children.length === 0) throw new NoDataError("I couldn't find your child's record.");

    if (requestedName) {
      const needle = requestedName.trim().toLowerCase();
      const matches = children.filter(
        (c) => c.fullName.toLowerCase().includes(needle) || c.fullName.toLowerCase().split(" ")[0] === needle
      );
      if (matches.length === 1) return matches[0];
      if (matches.length > 1) throw new AmbiguousEntityError(matches.map((m) => m.fullName));
      throw new ToolAuthorizationError(
        "I can only look up children linked to your account. Could you tell me which of your children you mean?"
      );
    }

    if (ctx.conversationStudentId && linkedIds.includes(ctx.conversationStudentId)) {
      const fromContext = children.find((c) => c.id === ctx.conversationStudentId);
      if (fromContext) return fromContext;
    }
    if (children.length === 1) return children[0];
    throw new AmbiguousEntityError(children.map((c) => c.fullName));
  }

  // Teacher / principal: a name is required, and the search scope is their
  // own classes (teacher) or their own school (principal).
  if (!requestedName) throw new AmbiguousEntityError([]);
  // `undefined` scope means "anywhere in this school" and is only ever valid
  // for VERIFIED management. Without this guard a self-declared principal
  // could resolve any student in the school by name.
  if (ctx.role === "principal" && !isVerifiedManagement(ctx)) {
    throw new ToolAuthorizationError(
      "School-wide student lookup is available to verified school management only."
    );
  }
  const scope = ctx.role === "teacher" ? (ctx.teacherClassIds ?? []) : undefined;
  const lookup = await people.findStudentByName(ctx.schoolId, requestedName, scope);
  if (lookup.kind === "ambiguous") throw new AmbiguousEntityError(lookup.candidates.map((c) => c.fullName));
  if (lookup.kind === "none") {
    throw new ToolAuthorizationError(
      ctx.role === "teacher"
        ? `I couldn't find a student named "${requestedName}" in the classes you teach.`
        : `I couldn't find a student named "${requestedName}" at your school.`
    );
  }
  return lookup.student;
}

/** The class whose shared content (assignments/exams/schedule) the caller may see. */
async function resolveScopeClassId(ctx: TrustedUserContext): Promise<string | undefined> {
  if (ctx.role === "teacher") return (ctx.teacherClassIds ?? [])[0];
  if (ctx.role === "student" || ctx.role === "parent") {
    const student = await resolveSubjectStudent(ctx);
    return student.classId;
  }
  return undefined;
}

// --------------------------------------------------------------------------
// Profile
// --------------------------------------------------------------------------

export const getStudentProfile: ToolDefinition<{ studentName?: string }, unknown> = {
  name: "getStudentProfile",
  description:
    "Look up a student's basic profile: full name, class, section and roll number. Students get their own record; parents get one of their linked children; teachers and principals must name a student within their own scope.",
  inputSchema: z.object({
    studentName: z.string().max(80).optional().describe("Student's name — omit when the caller means themself or their only child"),
  }),
  allowedRoles: ["student", "parent", "teacher", "principal"],
  requiresConfirmation: false,
  auditAction: "read:student_profile",
  authorize: async () => ({ allowed: true }), // subject resolution below is the real ownership check
  handler: async (ctx, input) => {
    const student = await resolveSubjectStudent(ctx, input.studentName);
    return {
      studentId: student.id,
      fullName: student.fullName,
      className: student.className,
      section: student.section,
      rollNumber: student.rollNumber,
      source: SCHOOL_SOURCE,
    };
  },
};

// --------------------------------------------------------------------------
// Attendance
// --------------------------------------------------------------------------

export const getStudentAttendance: ToolDefinition<{ period: Period }, unknown> = {
  name: "getStudentAttendance",
  description:
    "Get the signed-in student's own attendance summary for a period (present/absent/leave counts and percentage).",
  inputSchema: z.object({ period: PERIOD_ENUM }),
  allowedRoles: ["student"],
  requiresConfirmation: false,
  auditAction: "read:own_attendance",
  authorize: async (ctx) => ({
    allowed: Boolean(ctx.studentId),
    reason: ctx.studentId ? undefined : "This account isn't linked to a student record yet.",
  }),
  handler: async (ctx, input) => {
    const student = await resolveSubjectStudent(ctx);
    const summary = await attendanceService.getStudentAttendance(student.id, resolvePeriod(input.period));
    return { studentName: student.fullName, ...summary, source: ATTENDANCE_SOURCE };
  },
};

export const getChildAttendance: ToolDefinition<{ childName?: string; period: Period }, unknown> = {
  name: "getChildAttendance",
  description:
    "Get a parent's child's attendance summary for a period. Omit childName to use the child already being discussed; if the parent has several children and none is established yet, this asks which one.",
  inputSchema: z.object({ childName: z.string().max(80).optional(), period: PERIOD_ENUM }),
  allowedRoles: ["parent"],
  requiresConfirmation: false,
  auditAction: "read:child_attendance",
  authorize: async (ctx) => ({
    allowed: (ctx.linkedStudentIds?.length ?? 0) > 0,
    reason: "This account isn't linked to a child yet.",
  }),
  handler: async (ctx, input) => {
    const child = await resolveSubjectStudent(ctx, input.childName);
    const summary = await attendanceService.getStudentAttendance(child.id, resolvePeriod(input.period));
    return {
      ...summary,
      studentId: child.id,
      studentName: child.fullName,
      className: child.className,
      source: ATTENDANCE_SOURCE,
    };
  },
};

export const getAttendanceDetail: ToolDefinition<{ studentName?: string; period: Period }, unknown> = {
  name: "getAttendanceDetail",
  description:
    "List the specific days a student was absent or on leave in a period, with the recorded status for each. Use this for follow-ups like 'which days?', 'was he absent today?' or 'why is it low?'.",
  inputSchema: z.object({ studentName: z.string().max(80).optional(), period: PERIOD_ENUM }),
  allowedRoles: ["student", "parent", "teacher"],
  requiresConfirmation: false,
  auditAction: "read:attendance_detail",
  authorize: async () => ({ allowed: true }),
  handler: async (ctx, input) => {
    const student = await resolveSubjectStudent(ctx, input.studentName);
    const bounds = resolvePeriod(input.period);
    const days = await attendanceService.getAbsenceDates(student.id, bounds);
    return {
      studentId: student.id,
      studentName: student.fullName,
      period: bounds,
      nonPresentDays: days,
      count: days.length,
      source: ATTENDANCE_SOURCE,
    };
  },
};

export const getClassAttendance: ToolDefinition<{ className?: string; period: Period }, unknown> = {
  name: "getClassAttendance",
  description:
    "Get aggregate attendance for one class. Teachers may only query classes they are assigned to; principals only classes in their own school.",
  inputSchema: z.object({
    className: z.string().max(60).optional().describe("Class name such as 'Class 10 - A'; omit for the teacher's own first class"),
    period: PERIOD_ENUM,
  }),
  allowedRoles: ["teacher", "principal"],
  requiresConfirmation: false,
  auditAction: "read:class_attendance",
  authorize: async (ctx) => ({
    // Verified management may query any class in their own school; a teacher
    // only classes they are actually assigned to. An unverified principal
    // satisfies neither.
    allowed: isVerifiedManagement(ctx) || (ctx.teacherClassIds?.length ?? 0) > 0,
    reason: "You have no assigned classes.",
  }),
  handler: async (ctx, input) => {
    const classId = await resolveClassIdForCaller(ctx, input.className);
    const summary = await attendanceService.getClassAttendance(classId, resolvePeriod(input.period));
    return { ...summary, source: ATTENDANCE_SOURCE };
  },
};

/**
 * Turns a spoken class name into an id the caller is actually allowed to
 * query. The candidate set is the caller's own classes (teacher) or their
 * own school's classes (principal) — a classId is never accepted straight
 * from the model, which is what made the previous version leakable.
 */
async function resolveClassIdForCaller(ctx: TrustedUserContext, className?: string): Promise<string> {
  const candidates =
    ctx.role === "teacher"
      ? (await people.listClassesForTeacher(ctx.uid)).filter((c) => c.schoolId === ctx.schoolId)
      : await people.listClassesInSchool(ctx.schoolId);

  if (candidates.length === 0) {
    throw new NoDataError("There are no classes set up for you yet.");
  }
  if (!className) {
    if (candidates.length === 1) return candidates[0].id;
    if (ctx.role === "teacher") return candidates[0].id;
    throw new AmbiguousEntityError(candidates.map((c) => c.className));
  }

  const needle = className.trim().toLowerCase().replace(/\s+/g, " ");
  const matches = candidates.filter((c) => c.className.toLowerCase().replace(/\s+/g, " ").includes(needle));
  if (matches.length === 1) return matches[0].id;
  if (matches.length > 1) throw new AmbiguousEntityError(matches.map((c) => c.className));
  throw new ToolAuthorizationError(
    ctx.role === "teacher"
      ? `You're not assigned to a class called "${className}".`
      : `There's no class called "${className}" in your school.`
  );
}

export const getSchoolAttendance: ToolDefinition<{ period: Period }, unknown> = {
  name: "getSchoolAttendance",
  description:
    "Get school-wide attendance for the principal: an overall percentage plus a per-class breakdown and the classes falling behind.",
  inputSchema: z.object({ period: PERIOD_ENUM }),
  allowedRoles: ["principal"],
  requiresConfirmation: false,
  auditAction: "read:school_attendance",
  // Gated on the server-written GRANT, not on `role`. A self-declared
  // principal has no principalOfSchoolId and is refused here even if the
  // role allow-list above were somehow satisfied.
  authorize: async (ctx) => ({
    allowed: isVerifiedManagement(ctx),
    reason: "School-wide attendance is available to verified school management only.",
  }),
  handler: async (ctx, input) => {
    const result = await attendanceService.getSchoolAttendanceAnalytics(ctx.schoolId, resolvePeriod(input.period));
    return { ...result, source: ATTENDANCE_SOURCE };
  },
};

// --------------------------------------------------------------------------
// Academics
// --------------------------------------------------------------------------

export const getAssignments: ToolDefinition<{ status?: string }, unknown> = {
  name: "getAssignments",
  description: "Get assignments for the caller's class (their own class, their child's class, or the class they teach).",
  inputSchema: z.object({ status: z.enum(["pending", "submitted", "overdue", "completed"]).optional() }),
  allowedRoles: ["student", "parent", "teacher"],
  requiresConfirmation: false,
  auditAction: "read:assignments",
  authorize: async () => ({ allowed: true }),
  handler: async (ctx, input) => {
    const classId = await resolveScopeClassId(ctx);
    if (!classId) throw new NoDataError("I couldn't work out which class to check.");
    const items = await academics.getAssignments(classId, input.status);
    return { classId, count: items.length, assignments: items, source: ACADEMIC_SOURCE };
  },
};

export const getExams: ToolDefinition<{ status?: string }, unknown> = {
  name: "getExams",
  description: "Get exams and tests for the caller's class, optionally filtered to upcoming or completed.",
  inputSchema: z.object({ status: z.enum(["upcoming", "completed"]).optional() }),
  allowedRoles: ["student", "parent", "teacher"],
  requiresConfirmation: false,
  auditAction: "read:exams",
  authorize: async () => ({ allowed: true }),
  handler: async (ctx, input) => {
    const classId = await resolveScopeClassId(ctx);
    if (!classId) throw new NoDataError("I couldn't work out which class to check.");
    const items = await academics.getExams(classId, input.status);
    return { classId, count: items.length, exams: items, source: ACADEMIC_SOURCE };
  },
};

export const getSchedule: ToolDefinition<Record<string, never>, unknown> = {
  name: "getSchedule",
  description: "Get the class timetable (subjects, teachers, rooms and times) for the caller's class.",
  inputSchema: z.object({}),
  allowedRoles: ["student", "parent", "teacher"],
  requiresConfirmation: false,
  auditAction: "read:schedule",
  authorize: async () => ({ allowed: true }),
  handler: async (ctx) => {
    const classId = await resolveScopeClassId(ctx);
    if (!classId) throw new NoDataError("I couldn't work out which class to check.");
    const periods = await academics.getSchedule(classId);
    return { classId, periods, source: ACADEMIC_SOURCE };
  },
};

export const getClassInformation: ToolDefinition<{ className?: string }, unknown> = {
  name: "getClassInformation",
  description:
    "Get information about a class: its name, class teacher and how many students are enrolled. Teachers and principals may name a class in their own scope; students and parents get their own class.",
  inputSchema: z.object({ className: z.string().max(60).optional() }),
  allowedRoles: ["student", "parent", "teacher", "principal"],
  requiresConfirmation: false,
  auditAction: "read:class_information",
  authorize: async () => ({ allowed: true }),
  handler: async (ctx, input) => {
    const classId =
      ctx.role === "teacher" || isVerifiedManagement(ctx)
        ? await resolveClassIdForCaller(ctx, input.className)
        : await resolveScopeClassId(ctx);
    if (!classId) throw new NoDataError("I couldn't work out which class to look up.");
    const klass = await people.getClass(classId);
    if (!klass || klass.schoolId !== ctx.schoolId) throw new NoDataError("I couldn't find that class.");
    const roster = await people.listStudents(ctx.schoolId, [classId]);
    return {
      classId: klass.id,
      className: klass.className,
      studentCount: roster.length,
      source: SCHOOL_SOURCE,
    };
  },
};

export const getSchoolInformation: ToolDefinition<Record<string, never>, unknown> = {
  name: "getSchoolInformation",
  description: "Get basic information about the caller's own school (name and location).",
  inputSchema: z.object({}),
  allowedRoles: ["student", "parent", "teacher", "principal"],
  requiresConfirmation: false,
  auditAction: "read:school_information",
  authorize: async () => ({ allowed: true }),
  handler: async (ctx) => {
    const school = await people.getSchool(ctx.schoolId);
    if (!school) throw new NoDataError("I couldn't find your school's record.");
    return { name: school.name, location: school.location, source: SCHOOL_SOURCE };
  },
};

export const getAnnouncements: ToolDefinition<{ category?: string }, unknown> = {
  name: "getAnnouncements",
  description: "Get recent school notices and announcements for the caller's school.",
  inputSchema: z.object({ category: z.enum(["school", "class", "important"]).optional() }),
  allowedRoles: ["student", "parent", "teacher", "principal"],
  requiresConfirmation: false,
  auditAction: "read:notices",
  authorize: async () => ({ allowed: true }),
  handler: async (ctx, input) => {
    const notices = await academics.getAnnouncements(ctx.schoolId, input.category);
    return { count: notices.length, notices, source: SCHOOL_SOURCE };
  },
};

export const getResources: ToolDefinition<{ subject?: string }, unknown> = {
  name: "getResources",
  description: "Get the school's study resources and materials, optionally filtered by subject.",
  inputSchema: z.object({ subject: z.string().max(40).optional() }),
  allowedRoles: ["student", "parent", "teacher"],
  requiresConfirmation: false,
  auditAction: "read:resources",
  authorize: async () => ({ allowed: true }),
  handler: async (ctx, input) => {
    const resources = await academics.getResources(ctx.schoolId, input.subject);
    return { count: resources.length, resources, source: SCHOOL_SOURCE };
  },
};

export const getSchoolAnalytics: ToolDefinition<Record<string, never>, unknown> = {
  name: "getSchoolAnalytics",
  description:
    "Get the principal's school-wide analytics summary: student/teacher/class counts, overall attendance, performance and engagement.",
  inputSchema: z.object({}),
  allowedRoles: ["principal"],
  requiresConfirmation: false,
  auditAction: "read:analytics",
  // Same GRANT check as getSchoolAttendance — see the note there.
  authorize: async (ctx) => ({
    allowed: isVerifiedManagement(ctx),
    reason: "School analytics are available to verified school management only.",
  }),
  handler: async (ctx) => {
    const analytics = await academics.getSchoolAnalytics(ctx.schoolId);
    if (!analytics) throw new NoDataError("No analytics have been computed for this school yet.");
    return { ...analytics, source: SCHOOL_SOURCE };
  },
};

export const getSupportRequests: ToolDefinition<Record<string, never>, unknown> = {
  name: "getSupportRequests",
  description: "Get the caller's own submitted call-back / support requests and their current status.",
  inputSchema: z.object({}),
  allowedRoles: ["student", "parent", "teacher", "principal"],
  requiresConfirmation: false,
  auditAction: "read:support_requests",
  authorize: async () => ({ allowed: true }),
  handler: async (ctx) => {
    const requests = await support.listSupportRequests(ctx.uid);
    return {
      count: requests.length,
      requests: requests.map((r) => ({
        id: r.id,
        recipientType: r.recipientType,
        routedTo: r.routedToLabel,
        status: r.status,
        createdAt: r.createdAt,
      })),
      source: SCHOOL_SOURCE,
    };
  },
};

export const getNotifications: ToolDefinition<{ unreadOnly?: boolean }, unknown> = {
  name: "getNotifications",
  description: "Get the caller's own notifications.",
  inputSchema: z.object({ unreadOnly: z.boolean().optional() }),
  allowedRoles: ["student", "parent", "teacher", "principal"],
  requiresConfirmation: false,
  auditAction: "read:notifications",
  authorize: async () => ({ allowed: true }),
  handler: async (ctx, input) => {
    const notifications = await academics.getNotifications(ctx.uid, input.unreadOnly);
    return { count: notifications.length, notifications, source: SCHOOL_SOURCE };
  },
};

export const READ_TOOLS = [
  getStudentProfile,
  getStudentAttendance,
  getChildAttendance,
  getAttendanceDetail,
  getClassAttendance,
  getSchoolAttendance,
  getAssignments,
  getExams,
  getSchedule,
  getClassInformation,
  getSchoolInformation,
  getAnnouncements,
  getResources,
  getSchoolAnalytics,
  getSupportRequests,
  getNotifications,
] as unknown as ToolDefinition<never, unknown>[];

export { resolveSubjectStudent, resolveClassIdForCaller };
