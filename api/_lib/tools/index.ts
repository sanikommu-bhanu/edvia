import { READ_TOOLS } from "./readTools";
import { ACTION_TOOLS } from "./actionTools";
import { getSchoolPolicy } from "./policyTools";
import type { ToolDefinition } from "./registry";

export const ALL_TOOLS: ToolDefinition<never, unknown>[] = [
  ...READ_TOOLS,
  getSchoolPolicy as unknown as ToolDefinition<never, unknown>,
  ...ACTION_TOOLS,
];

export const TOOL_BY_NAME: Record<string, ToolDefinition<never, unknown>> = Object.fromEntries(
  ALL_TOOLS.map((t) => [t.name, t])
);

// ---- Gemini function-declaration shapes ----------------------------------
// Hand-written JSON-schema "parameters" per tool (kept in lockstep with each
// tool's Zod input schema above) since the model needs plain JSON Schema,
// not a Zod object. If a tool's Zod schema changes, update its declaration
// here in the same commit.
const PERIOD_SCHEMA = { type: "string", enum: ["today", "this_week", "last_week", "this_month", "last_month", "this_term", "all_time"] };

export const GEMINI_TOOL_DECLARATIONS = [
  { name: "getStudentProfile", description: TOOL_BY_NAME.getStudentProfile.description, parameters: { type: "object", properties: { studentName: { type: "string" } } } },
  { name: "getStudentAttendance", description: TOOL_BY_NAME.getStudentAttendance.description, parameters: { type: "object", properties: { period: PERIOD_SCHEMA }, required: ["period"] } },
  { name: "getChildAttendance", description: TOOL_BY_NAME.getChildAttendance.description, parameters: { type: "object", properties: { childName: { type: "string" }, period: PERIOD_SCHEMA }, required: ["period"] } },
  { name: "getClassAttendance", description: TOOL_BY_NAME.getClassAttendance.description, parameters: { type: "object", properties: { classId: { type: "string" }, period: PERIOD_SCHEMA }, required: ["classId", "period"] } },
  { name: "getSchoolAttendance", description: TOOL_BY_NAME.getSchoolAttendance.description, parameters: { type: "object", properties: { period: PERIOD_SCHEMA }, required: ["period"] } },
  { name: "getAssignments", description: TOOL_BY_NAME.getAssignments.description, parameters: { type: "object", properties: { status: { type: "string", enum: ["pending", "submitted", "overdue", "completed"] } } } },
  { name: "getExams", description: TOOL_BY_NAME.getExams.description, parameters: { type: "object", properties: { status: { type: "string", enum: ["upcoming", "completed"] } } } },
  { name: "getSchedule", description: TOOL_BY_NAME.getSchedule.description, parameters: { type: "object", properties: {} } },
  { name: "getAnnouncements", description: TOOL_BY_NAME.getAnnouncements.description, parameters: { type: "object", properties: { category: { type: "string", enum: ["school", "class", "important"] } } } },
  { name: "getResources", description: TOOL_BY_NAME.getResources.description, parameters: { type: "object", properties: { subject: { type: "string" } } } },
  { name: "getSchoolAnalytics", description: TOOL_BY_NAME.getSchoolAnalytics.description, parameters: { type: "object", properties: {} } },
  { name: "getSupportRequests", description: TOOL_BY_NAME.getSupportRequests.description, parameters: { type: "object", properties: {} } },
  { name: "getNotifications", description: TOOL_BY_NAME.getNotifications.description, parameters: { type: "object", properties: { unreadOnly: { type: "boolean" } } } },
  { name: "getSchoolPolicy", description: TOOL_BY_NAME.getSchoolPolicy.description, parameters: { type: "object", properties: { topic: { type: "string" } }, required: ["topic"] } },
  { name: "markAttendance", description: TOOL_BY_NAME.markAttendance.description, parameters: { type: "object", properties: { studentName: { type: "string" }, status: { type: "string", enum: ["present", "absent", "leave"] }, date: { type: "string" } }, required: ["studentName", "status"] } },
  { name: "createTeacherSupportRequest", description: TOOL_BY_NAME.createTeacherSupportRequest.description, parameters: { type: "object", properties: { message: { type: "string" }, studentContext: { type: "string" } }, required: ["message"] } },
  { name: "createManagementSupportRequest", description: TOOL_BY_NAME.createManagementSupportRequest.description, parameters: { type: "object", properties: { message: { type: "string" }, studentContext: { type: "string" } }, required: ["message"] } },
];

export type { ToolDefinition } from "./registry";
