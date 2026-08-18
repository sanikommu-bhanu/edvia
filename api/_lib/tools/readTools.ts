// ==========================================================================
// Read Tools
// --------------------------------------------------------------------------
// Every handler filters by ctx.schoolId first (multi-tenant boundary), then
// by role-specific ownership before ever touching Firestore for the record
// itself. Nothing here trusts an id the client/model supplied without
// checking it belongs to a resource this user may see.
// ==========================================================================
import { z } from "zod";
import { adminDb } from "../firebaseAdmin";
import type { ToolDefinition } from "./registry";
import { resolvePeriod, type Period } from "./dateRange";

const PERIOD_ENUM = z.enum(["today", "this_week", "last_week", "this_month", "last_month", "this_term", "all_time"]);

async function resolveStudentIdByName(schoolId: string, classScope: string[] | undefined, name: string): Promise<string | null> {
  let query = adminDb().collection("students").where("schoolId", "==", schoolId) as FirebaseFirestore.Query;
  if (classScope) query = query.where("classId", "in", classScope.slice(0, 10));
  const snap = await query.get();
  const match = snap.docs.find((d) => (d.data().fullName as string)?.toLowerCase().includes(name.toLowerCase()));
  return match?.id ?? null;
}

async function attendanceSummaryFor(studentId: string, start: string, end: string) {
  const snap = await adminDb()
    .collection("attendance")
    .where("studentId", "==", studentId)
    .where("date", ">=", start)
    .where("date", "<=", end)
    .get();
  const records = snap.docs.map((d) => d.data() as { status: "present" | "absent" | "leave"; date: string });
  const present = records.filter((r) => r.status === "present").length;
  const leave = records.filter((r) => r.status === "leave").length;
  const absent = records.filter((r) => r.status === "absent").length;
  const total = records.length || 1;
  const percentage = Math.round(((present + leave * 0.5) / total) * 100);
  return { present, absent, leave, total: records.length, percentage };
}

// ---- getStudentProfile ---------------------------------------------------
export const getStudentProfile: ToolDefinition<{ studentName?: string }, unknown> = {
  name: "getStudentProfile",
  description: "Look up a student's basic profile (class, section, roll number). For the caller's own linked student(s) only, unless the caller is a teacher/principal at the same school.",
  inputSchema: z.object({ studentName: z.string().optional().describe("Student's name if not the caller themself") }),
  allowedRoles: ["student", "parent", "teacher", "principal"],
  requiresConfirmation: false,
  auditAction: "read:student_profile",
  authorize: async () => ({ allowed: true }), // ownership resolved inside handler based on role
  handler: async (ctx, input) => {
    let studentId = ctx.studentId;
    if (ctx.role === "parent") {
      const children = ctx.linkedStudentIds ?? [];
      if (input.studentName && children.length > 1) {
        const resolved = await resolveStudentIdByName(ctx.schoolId, undefined, input.studentName);
        studentId = resolved && children.includes(resolved) ? resolved : undefined;
      } else {
        studentId = children[0];
      }
      if (!studentId) throw new Error("I can only look up your own linked child. Could you tell me which one?");
    } else if (ctx.role === "teacher" || ctx.role === "principal") {
      if (!input.studentName) throw new Error("Which student would you like me to look up?");
      const scope = ctx.role === "teacher" ? ctx.teacherClassIds : undefined;
      const resolved = await resolveStudentIdByName(ctx.schoolId, scope, input.studentName);
      if (!resolved) throw new Error(`I couldn't find a student named "${input.studentName}" in your records.`);
      studentId = resolved;
    }
    const snap = await adminDb().collection("students").doc(studentId!).get();
    if (!snap.exists) throw new Error("Student record not found.");
    return { id: snap.id, ...snap.data() };
  },
};

// ---- getStudentAttendance (self) -----------------------------------------
export const getStudentAttendance: ToolDefinition<{ period: Period }, unknown> = {
  name: "getStudentAttendance",
  description: "Get the current student's own attendance summary for a time period.",
  inputSchema: z.object({ period: PERIOD_ENUM }),
  allowedRoles: ["student"],
  requiresConfirmation: false,
  auditAction: "read:own_attendance",
  authorize: async (ctx) => ({ allowed: Boolean(ctx.studentId), reason: ctx.studentId ? undefined : "No linked student record." }),
  handler: async (ctx, input) => {
    const { start, end } = resolvePeriod(input.period);
    return attendanceSummaryFor(ctx.studentId!, start, end);
  },
};

// ---- getChildAttendance (parent) -----------------------------------------
export const getChildAttendance: ToolDefinition<{ childName?: string; period: Period }, unknown> = {
  name: "getChildAttendance",
  description: "Get a parent's child's attendance summary. If the parent has multiple children and didn't specify one, this fails so EDVIA can ask which child.",
  inputSchema: z.object({ childName: z.string().optional(), period: PERIOD_ENUM }),
  allowedRoles: ["parent"],
  requiresConfirmation: false,
  auditAction: "read:child_attendance",
  authorize: async (ctx) => ({ allowed: (ctx.linkedStudentIds?.length ?? 0) > 0, reason: "No linked children found for this account." }),
  handler: async (ctx, input) => {
    const children = ctx.linkedStudentIds!;
    let studentId = children[0];
    if (children.length > 1) {
      if (!input.childName) throw new Error("MULTIPLE_CHILDREN"); // orchestrator turns this into a clarification, not an error message
      const resolved = await resolveStudentIdByName(ctx.schoolId, undefined, input.childName);
      if (!resolved || !children.includes(resolved)) throw new Error("I can only check attendance for your own linked children.");
      studentId = resolved;
    }
    const { start, end } = resolvePeriod(input.period);
    const summary = await attendanceSummaryFor(studentId, start, end);
    const studentSnap = await adminDb().collection("students").doc(studentId).get();
    return { student: studentSnap.data()?.fullName, ...summary };
  },
};

// ---- getClassAttendance (teacher/principal) -------------------------------
export const getClassAttendance: ToolDefinition<{ classId: string; period: Period }, unknown> = {
  name: "getClassAttendance",
  description: "Get aggregate attendance for a whole class. Teachers may only query classes they are assigned to.",
  inputSchema: z.object({ classId: z.string(), period: PERIOD_ENUM }),
  allowedRoles: ["teacher", "principal"],
  requiresConfirmation: false,
  auditAction: "read:class_attendance",
  authorize: async (ctx, input) => {
    if (ctx.role === "teacher") {
      const allowed = (ctx.teacherClassIds ?? []).includes(input.classId);
      return { allowed, reason: allowed ? undefined : "You're not assigned to that class." };
    }
    // Principal: still scoped to their own school — verified in the handler
    // against the classes/{classId} doc (a principal must not be able to read
    // another school's class attendance just by supplying its classId).
    const classSnap = await adminDb().collection("classes").doc(input.classId).get();
    if (!classSnap.exists) return { allowed: false, reason: "Class not found." };
    const allowed = classSnap.data()?.schoolId === ctx.schoolId;
    return { allowed, reason: allowed ? undefined : "That class isn't in your school." };
  },
  handler: async (_ctx, input) => {
    const { start, end } = resolvePeriod(input.period);
    const snap = await adminDb().collection("attendance").where("classId", "==", input.classId).where("date", ">=", start).where("date", "<=", end).get();
    const records = snap.docs.map((d) => d.data() as { status: string; date: string });
    const present = records.filter((r) => r.status === "present").length;
    const percentage = records.length ? Math.round((present / records.length) * 100) : 0;
    return { classId: input.classId, totalRecords: records.length, percentage };
  },
};

// ---- getSchoolAttendance (principal) --------------------------------------
export const getSchoolAttendance: ToolDefinition<{ period: Period }, unknown> = {
  name: "getSchoolAttendance",
  description: "Get school-wide attendance overview and a per-class breakdown, for identifying classes that need attention.",
  inputSchema: z.object({ period: PERIOD_ENUM }),
  allowedRoles: ["principal"],
  requiresConfirmation: false,
  auditAction: "read:school_attendance",
  authorize: async () => ({ allowed: true }),
  handler: async (ctx, input) => {
    const { start, end } = resolvePeriod(input.period);
    const snap = await adminDb().collection("attendance").where("schoolId", "==", ctx.schoolId).where("date", ">=", start).where("date", "<=", end).get();
    const byClass = new Map<string, { present: number; total: number }>();
    snap.docs.forEach((d) => {
      const data = d.data() as { classId: string; status: string };
      const bucket = byClass.get(data.classId) ?? { present: 0, total: 0 };
      bucket.total += 1;
      if (data.status === "present") bucket.present += 1;
      byClass.set(data.classId, bucket);
    });
    const perClass = Array.from(byClass.entries()).map(([classId, v]) => ({
      classId, percentage: v.total ? Math.round((v.present / v.total) * 100) : 0,
    })).sort((a, b) => a.percentage - b.percentage);
    const totalPresent = perClass.reduce((sum, c) => sum + c.percentage, 0);
    return { overallPercentage: perClass.length ? Math.round(totalPresent / perClass.length) : 0, classesNeedingAttention: perClass.slice(0, 3), perClass };
  },
};

// ---- getAssignments / getExams / getSchedule / getAnnouncements / getResources ----
export const getAssignments: ToolDefinition<{ status?: "pending" | "submitted" | "overdue" | "completed" }, unknown> = {
  name: "getAssignments",
  description: "Get assignments for the student's class (or the class a parent's child is in).",
  inputSchema: z.object({ status: z.enum(["pending", "submitted", "overdue", "completed"]).optional() }),
  allowedRoles: ["student", "parent", "teacher"],
  requiresConfirmation: false,
  auditAction: "read:assignments",
  authorize: async () => ({ allowed: true }),
  handler: async (ctx, input) => {
    let classId: string | undefined;
    if (ctx.role === "student") {
      const s = await adminDb().collection("students").doc(ctx.studentId!).get();
      classId = s.data()?.classId;
    } else if (ctx.role === "parent") {
      const s = await adminDb().collection("students").doc((ctx.linkedStudentIds ?? [])[0]).get();
      classId = s.data()?.classId;
    } else if (ctx.role === "teacher") {
      classId = (ctx.teacherClassIds ?? [])[0];
    }
    if (!classId) return [];
    let query: FirebaseFirestore.Query = adminDb().collection("assignments").where("classId", "==", classId);
    if (input.status) query = query.where("status", "==", input.status);
    const snap = await query.get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },
};

export const getExams: ToolDefinition<{ status?: "upcoming" | "completed" }, unknown> = {
  name: "getExams",
  description: "Get exams/tests for the student's class.",
  inputSchema: z.object({ status: z.enum(["upcoming", "completed"]).optional() }),
  allowedRoles: ["student", "parent", "teacher"],
  requiresConfirmation: false,
  auditAction: "read:exams",
  authorize: async () => ({ allowed: true }),
  handler: async (ctx, input) => {
    let classId: string | undefined;
    if (ctx.role === "student") classId = (await adminDb().collection("students").doc(ctx.studentId!).get()).data()?.classId;
    else if (ctx.role === "parent") classId = (await adminDb().collection("students").doc((ctx.linkedStudentIds ?? [])[0]).get()).data()?.classId;
    else if (ctx.role === "teacher") classId = (ctx.teacherClassIds ?? [])[0];
    if (!classId) return [];
    let query: FirebaseFirestore.Query = adminDb().collection("exams").where("classId", "==", classId);
    if (input.status) query = query.where("status", "==", input.status);
    const snap = await query.get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },
};

export const getSchedule: ToolDefinition<Record<string, never>, unknown> = {
  name: "getSchedule",
  description: "Get today's class schedule for the student.",
  inputSchema: z.object({}),
  allowedRoles: ["student", "teacher"],
  requiresConfirmation: false,
  auditAction: "read:schedule",
  authorize: async () => ({ allowed: true }),
  handler: async (ctx) => {
    const classId = ctx.role === "student"
      ? (await adminDb().collection("students").doc(ctx.studentId!).get()).data()?.classId
      : (ctx.teacherClassIds ?? [])[0];
    if (!classId) return [];
    const snap = await adminDb().collection("classSubjects").where("classId", "==", classId).get();
    return snap.docs.map((d) => d.data());
  },
};

export const getAnnouncements: ToolDefinition<{ category?: "school" | "class" | "important" }, unknown> = {
  name: "getAnnouncements",
  description: "Get school notices/announcements.",
  inputSchema: z.object({ category: z.enum(["school", "class", "important"]).optional() }),
  allowedRoles: ["student", "parent", "teacher", "principal"],
  requiresConfirmation: false,
  auditAction: "read:notices",
  authorize: async () => ({ allowed: true }),
  handler: async (ctx, input) => {
    let query: FirebaseFirestore.Query = adminDb().collection("notices").where("schoolId", "==", ctx.schoolId);
    if (input.category) query = query.where("category", "==", input.category);
    const snap = await query.orderBy("date", "desc").limit(10).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },
};

export const getResources: ToolDefinition<{ subject?: string }, unknown> = {
  name: "getResources",
  description: "Get school study resources/materials, optionally filtered by subject.",
  inputSchema: z.object({ subject: z.string().optional() }),
  allowedRoles: ["student", "parent", "teacher"],
  requiresConfirmation: false,
  auditAction: "read:resources",
  authorize: async () => ({ allowed: true }),
  handler: async (ctx, input) => {
    let query: FirebaseFirestore.Query = adminDb().collection("resources").where("schoolId", "==", ctx.schoolId);
    if (input.subject) query = query.where("subject", "==", input.subject);
    const snap = await query.limit(10).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },
};

// ---- getSchoolAnalytics (principal) ---------------------------------------
export const getSchoolAnalytics: ToolDefinition<Record<string, never>, unknown> = {
  name: "getSchoolAnalytics",
  description: "Get school-wide performance/engagement analytics summary for the principal dashboard.",
  inputSchema: z.object({}),
  allowedRoles: ["principal"],
  requiresConfirmation: false,
  auditAction: "read:analytics",
  authorize: async () => ({ allowed: true }),
  handler: async (ctx) => {
    const snap = await adminDb().collection("schoolAnalytics").doc(ctx.schoolId).get();
    if (!snap.exists) throw new Error("No analytics have been computed for this school yet.");
    return snap.data();
  },
};

// ---- getSupportRequests -----------------------------------------------------
export const getSupportRequests: ToolDefinition<Record<string, never>, unknown> = {
  name: "getSupportRequests",
  description: "Get the caller's own submitted support/escalation requests and their status.",
  inputSchema: z.object({}),
  allowedRoles: ["student", "parent", "teacher", "principal"],
  requiresConfirmation: false,
  auditAction: "read:support_requests",
  authorize: async () => ({ allowed: true }),
  handler: async (ctx) => {
    const snap = await adminDb().collection("supportRequests").where("requestedBy", "==", ctx.uid).orderBy("createdAt", "desc").limit(10).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },
};

// ---- getNotifications -------------------------------------------------------
export const getNotifications: ToolDefinition<{ unreadOnly?: boolean }, unknown> = {
  name: "getNotifications",
  description: "Get the caller's own notifications.",
  inputSchema: z.object({ unreadOnly: z.boolean().optional() }),
  allowedRoles: ["student", "parent", "teacher", "principal"],
  requiresConfirmation: false,
  auditAction: "read:notifications",
  authorize: async () => ({ allowed: true }),
  handler: async (ctx, input) => {
    let query: FirebaseFirestore.Query = adminDb().collection("notifications").where("userId", "==", ctx.uid);
    if (input.unreadOnly) query = query.where("read", "==", false);
    const snap = await query.orderBy("timestamp", "desc").limit(10).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },
};

export const READ_TOOLS: ToolDefinition<never, unknown>[] = [
  getStudentProfile, getStudentAttendance, getChildAttendance, getClassAttendance, getSchoolAttendance,
  getAssignments, getExams, getSchedule, getAnnouncements, getResources, getSchoolAnalytics,
  getSupportRequests, getNotifications,
] as unknown as ToolDefinition<never, unknown>[];
