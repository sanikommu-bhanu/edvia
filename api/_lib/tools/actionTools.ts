// ==========================================================================
// Action Tools — the only tools allowed to change data or contact a person
// --------------------------------------------------------------------------
// All of these have requiresConfirmation: true. The orchestrator will not
// execute them on the model turn that first requests them: it calls
// preview() to find out what would actually change, shows the user a
// plain-language confirmation built from that, and only runs handler()
// after an explicit "yes" in a following turn.
//
// preview() is what makes the confirmation honest. Without it the
// assistant can only say "shall I mark Rahul absent?"; with it, it can say
// "Rahul is currently marked present — shall I change that to absent?",
// which is the difference between a scripted demo and a system that read
// the record first.
// ==========================================================================
import { z } from "zod";
import type { ToolDefinition } from "./registry";
import { ToolAuthorizationError } from "./registry";
import * as attendanceService from "../school/attendance";
import * as support from "../school/support";
import { resolveSubjectStudent } from "./readTools";
import type { TrustedUserContext } from "../userContext";

const TODAY = () => new Date().toISOString().slice(0, 10);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface ActionPreview {
  /** Plain-language question shown to the user before anything is written. */
  summary: string;
  /** Structured facts about the pending change, for the audit trail. */
  details: Record<string, unknown>;
  /** True when running the action would change nothing. */
  noOp?: boolean;
}

/** Action tools carry an extra preview() step beyond the base contract. */
export interface ActionToolDefinition<Input = unknown, Output = unknown>
  extends ToolDefinition<Input, Output> {
  preview: (ctx: TrustedUserContext, input: Input) => Promise<ActionPreview>;
}

// ---- markAttendance ---------------------------------------------------------

const markAttendanceInput = z.object({
  studentName: z.string().min(1).max(80),
  status: z.enum(["present", "absent", "leave"]),
  date: z
    .string()
    .regex(ISO_DATE, "Date must be in YYYY-MM-DD form")
    .optional()
    .describe("ISO date; defaults to today"),
});

type MarkAttendanceArgs = z.infer<typeof markAttendanceInput>;

/**
 * Resolves the target student and date once, so preview() and handler()
 * can never disagree about who/what is being changed. Runs the same
 * teacher-scope check both times.
 */
async function resolveMarkTarget(ctx: TrustedUserContext, input: MarkAttendanceArgs) {
  const student = await resolveSubjectStudent(ctx, input.studentName);
  if (!(ctx.teacherClassIds ?? []).includes(student.classId)) {
    throw new ToolAuthorizationError(
      `${student.fullName} isn't in one of your assigned classes — I can only mark attendance for your own students.`
    );
  }
  const date = input.date ?? TODAY();
  if (date > TODAY()) {
    throw new ToolAuthorizationError("I can't mark attendance for a future date.");
  }
  const existing = await attendanceService.getAttendanceForDate(student.id, date);
  return { student, date, existing };
}

export const markAttendance: ActionToolDefinition<MarkAttendanceArgs, unknown> = {
  name: "markAttendance",
  description:
    "Mark or correct one student's attendance for a date (defaults to today). Only for students in the teacher's own assigned classes.",
  inputSchema: markAttendanceInput,
  allowedRoles: ["teacher"],
  requiresConfirmation: true,
  auditAction: "write:attendance",
  authorize: async (ctx) => ({
    allowed: (ctx.teacherClassIds?.length ?? 0) > 0,
    reason: "You have no assigned classes.",
  }),
  preview: async (ctx, input) => {
    const { student, date, existing } = await resolveMarkTarget(ctx, input);
    const when = date === TODAY() ? "today" : date;

    if (existing && existing.status === input.status) {
      return {
        summary: `${student.fullName} is already marked ${input.status} for ${when}. Would you like me to re-save it anyway?`,
        details: { studentId: student.id, studentName: student.fullName, date, from: existing.status, to: input.status },
        noOp: true,
      };
    }
    const summary = existing
      ? `${student.fullName} is currently marked ${existing.status} for ${when}. Would you like me to change that to ${input.status}?`
      : `${student.fullName} hasn't been marked for ${when} yet. Would you like me to mark them ${input.status}?`;

    return {
      summary,
      details: {
        studentId: student.id,
        studentName: student.fullName,
        className: student.className,
        date,
        from: existing?.status ?? null,
        to: input.status,
      },
    };
  },
  handler: async (ctx, input) => {
    const { student, date } = await resolveMarkTarget(ctx, input);
    const result = await attendanceService.markAttendance({
      studentId: student.id,
      classId: student.classId,
      schoolId: ctx.schoolId,
      status: input.status,
      date,
      markedBy: ctx.uid,
    });
    return {
      studentId: student.id,
      studentName: student.fullName,
      className: student.className,
      date: result.date,
      status: result.status,
      previousStatus: result.previousStatus,
      changed: result.changed,
    };
  },
};

// ---- createTeacherCallRequest -----------------------------------------------

const callRequestInput = z.object({
  message: z.string().min(1).max(1000),
  childName: z.string().max(80).optional(),
});

type CallRequestArgs = z.infer<typeof callRequestInput>;

/** Parents/students escalating: resolve which child the request concerns. */
async function subjectForEscalation(ctx: TrustedUserContext, childName?: string) {
  if (ctx.role === "teacher") return null;
  try {
    return await resolveSubjectStudent(ctx, childName);
  } catch {
    // A parent with several children who hasn't named one still gets to
    // file the request — it routes to the office rather than being blocked.
    return null;
  }
}

export const createTeacherCallRequest: ActionToolDefinition<CallRequestArgs, unknown> = {
  name: "createTeacherCallRequest",
  description:
    "Submit a request for the class teacher to call the parent or student back. Use this whenever someone asks to speak to, be called by, or escalate to their teacher.",
  inputSchema: callRequestInput,
  allowedRoles: ["student", "parent"],
  requiresConfirmation: true,
  auditAction: "write:support_request_teacher",
  authorize: async () => ({ allowed: true }),
  preview: async (ctx, input) => {
    const student = await subjectForEscalation(ctx, input.childName);
    return {
      summary: student
        ? `I can submit a call request to ${student.fullName}'s class teacher. Would you like me to send it now?`
        : "I can submit a call request to your teacher. Would you like me to send it now?",
      details: { studentId: student?.id ?? null, recipientType: "teacher" },
    };
  },
  handler: async (ctx, input) => {
    const student = await subjectForEscalation(ctx, input.childName);
    const created = await support.createTeacherCallRequest({
      requestedBy: ctx.uid,
      requestedByRole: ctx.role,
      schoolId: ctx.schoolId,
      recipientType: "teacher",
      message: input.message,
      studentId: student?.id,
      studentContext: student ? `${student.fullName} · ${student.className}` : undefined,
    });
    return {
      requestId: created.id,
      status: created.status,
      routedTo: created.routedToLabel,
      createdAt: created.createdAt,
    };
  },
};

// ---- createManagementSupportRequest -----------------------------------------

export const createManagementSupportRequest: ActionToolDefinition<CallRequestArgs, unknown> = {
  name: "createManagementSupportRequest",
  description:
    "Submit a request for school management/administration to follow up. Use for escalations beyond the classroom teacher.",
  inputSchema: callRequestInput,
  allowedRoles: ["student", "parent", "teacher"],
  requiresConfirmation: true,
  auditAction: "write:support_request_management",
  authorize: async () => ({ allowed: true }),
  preview: async () => ({
    summary: "I can submit a request for school management to follow up with you. Would you like me to send it now?",
    details: { recipientType: "management" },
  }),
  handler: async (ctx, input) => {
    const student = await subjectForEscalation(ctx, input.childName);
    const created = await support.createManagementSupportRequest({
      requestedBy: ctx.uid,
      requestedByRole: ctx.role,
      schoolId: ctx.schoolId,
      recipientType: "management",
      message: input.message,
      studentId: student?.id,
      studentContext: student ? `${student.fullName} · ${student.className}` : undefined,
    });
    return {
      requestId: created.id,
      status: created.status,
      routedTo: created.routedToLabel,
      createdAt: created.createdAt,
    };
  },
};

export const ACTION_TOOLS = [
  markAttendance,
  createTeacherCallRequest,
  createManagementSupportRequest,
] as unknown as ToolDefinition<never, unknown>[];

/** Type guard used by the orchestrator to reach preview() safely. */
/**
 * Generic over the tool's own Input/Output rather than pinned to `never`.
 *
 * The previous signature only accepted ToolDefinition<never, unknown> — the
 * erased type the catalogue stores. Because a tool's input type is in
 * contravariant position, that made the guard reject every CONCRETE tool
 * (markAttendance and friends), so nothing outside execute.ts could use it.
 */
export function isActionTool<Input, Output>(
  tool: ToolDefinition<Input, Output>
): tool is ActionToolDefinition<Input, Output> {
  return typeof (tool as ActionToolDefinition<Input, Output>).preview === "function";
}

export type { MarkAttendanceArgs };
