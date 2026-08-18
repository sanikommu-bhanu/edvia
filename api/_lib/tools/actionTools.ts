// ==========================================================================
// Action Tools — the only tools allowed to write data
// --------------------------------------------------------------------------
// All of these have requiresConfirmation: true. The orchestrator (see
// orchestrator.ts) will not execute them on the first model turn that
// requests them — it surfaces a PendingConfirmation to the user and only
// calls the handler after the user explicitly confirms in a follow-up turn.
// ==========================================================================
import { z } from "zod";
import { adminDb } from "../firebaseAdmin";
import type { ToolDefinition } from "./registry";

const TODAY = () => new Date().toISOString().slice(0, 10);

// ---- markAttendance ---------------------------------------------------------
export const markAttendance: ToolDefinition<{ studentName: string; status: "present" | "absent" | "leave"; date?: string }, unknown> = {
  name: "markAttendance",
  description: "Mark a single student's attendance for a date (defaults to today). Teacher must be assigned to that student's class.",
  inputSchema: z.object({
    studentName: z.string(),
    status: z.enum(["present", "absent", "leave"]),
    date: z.string().optional().describe("ISO date, defaults to today"),
  }),
  allowedRoles: ["teacher"],
  requiresConfirmation: true,
  auditAction: "write:attendance",
  authorize: async (ctx) => ({ allowed: (ctx.teacherClassIds?.length ?? 0) > 0, reason: "You have no assigned classes." }),
  handler: async (ctx, input) => {
    const classScope = ctx.teacherClassIds ?? [];
    const studentsSnap = await adminDb().collection("students").where("schoolId", "==", ctx.schoolId).where("classId", "in", classScope.slice(0, 10)).get();
    const match = studentsSnap.docs.find((d) => (d.data().fullName as string)?.toLowerCase().includes(input.studentName.toLowerCase()));
    if (!match) throw new Error(`"${input.studentName}" isn't in one of your assigned classes — I can only mark attendance for your own students.`);

    const date = input.date ?? TODAY();
    const docRef = adminDb().collection("attendance").doc();
    await docRef.set({
      studentId: match.id,
      classId: match.data().classId,
      schoolId: ctx.schoolId,
      status: input.status,
      date,
      markedBy: ctx.uid,
      markedAt: new Date().toISOString(),
    });
    return { studentName: match.data().fullName, status: input.status, date };
  },
};

// ---- createTeacherSupportRequest --------------------------------------------
export const createTeacherSupportRequest: ToolDefinition<{ message: string; studentContext?: string }, unknown> = {
  name: "createTeacherSupportRequest",
  description: "Submit a request for the class teacher to reach out / call back. Use when a parent or student wants to escalate to their teacher.",
  inputSchema: z.object({ message: z.string(), studentContext: z.string().optional() }),
  allowedRoles: ["student", "parent"],
  requiresConfirmation: true,
  auditAction: "write:support_request_teacher",
  authorize: async () => ({ allowed: true }),
  handler: async (ctx, input) => {
    const docRef = adminDb().collection("supportRequests").doc();
    await docRef.set({
      recipientType: "teacher",
      message: input.message,
      studentContext: input.studentContext ?? null,
      status: "pending",
      createdAt: new Date().toISOString(),
      requestedBy: ctx.uid,
      schoolId: ctx.schoolId,
    });
    return { id: docRef.id, status: "pending" };
  },
};

// ---- createManagementSupportRequest -----------------------------------------
export const createManagementSupportRequest: ToolDefinition<{ message: string; studentContext?: string }, unknown> = {
  name: "createManagementSupportRequest",
  description: "Submit a request for school management/administration to reach out. Use for escalations beyond the classroom teacher.",
  inputSchema: z.object({ message: z.string(), studentContext: z.string().optional() }),
  allowedRoles: ["student", "parent", "teacher"],
  requiresConfirmation: true,
  auditAction: "write:support_request_management",
  authorize: async () => ({ allowed: true }),
  handler: async (ctx, input) => {
    const docRef = adminDb().collection("supportRequests").doc();
    await docRef.set({
      recipientType: "management",
      message: input.message,
      studentContext: input.studentContext ?? null,
      status: "pending",
      createdAt: new Date().toISOString(),
      requestedBy: ctx.uid,
      schoolId: ctx.schoolId,
    });
    return { id: docRef.id, status: "pending" };
  },
};

export const ACTION_TOOLS: ToolDefinition<never, unknown>[] = [
  markAttendance, createTeacherSupportRequest, createManagementSupportRequest,
] as unknown as ToolDefinition<never, unknown>[];
