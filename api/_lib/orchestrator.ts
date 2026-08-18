// ==========================================================================
// AIOrchestrator — the heart of EDVIA's intelligence layer
// --------------------------------------------------------------------------
// Implements the flow from the spec:
//   user context → conversation manager → intent/entity (via Gemini
//   function calling) → role/school context → tool decision → server-side
//   authorization → tool execution → result validation → response
//
// The model NEVER executes a tool directly. It requests one by name; this
// orchestrator authorizes, executes, and only then lets the model see the
// result to phrase a natural reply. Write tools additionally require an
// explicit user confirmation turn before they ever run.
// ==========================================================================
import { geminiClient } from "./gemini";
import { AI_CONFIG } from "./config";
import { buildSystemInstruction } from "./persona";
import { TOOL_BY_NAME, GEMINI_TOOL_DECLARATIONS } from "./tools";
import { roleAllowed } from "./tools/registry";
import { authorizeAndExecuteTool } from "./tools/execute";
import { writeAuditLog } from "./audit";
import { getOwnedMemory, initMemory, updateMemory, appendMessage, recentMessages } from "./memory";
import { screenUntrustedText, fenceUntrustedContent, isSystemPromptExtractionAttempt } from "./security";
import { adminDb } from "./firebaseAdmin";
import type { TrustedUserContext } from "./userContext";
import type { AISource, PendingConfirmation, AIIntent } from "../../src/types";

export interface OrchestratorResult {
  message: string;
  intent: AIIntent | null;
  toolUsed: string | null;
  sources: AISource[];
  suggestedActions: string[];
  requiresConfirmation: PendingConfirmation | null;
}

const AFFIRMATION = /^(yes|yeah|yep|sure|go ahead|do it|confirm|okay|ok|please do)\b/i;
const NEGATION = /^(no|nope|cancel|don'?t|stop|never ?mind)\b/i;

export async function handleConversationTurn(
  ctx: TrustedUserContext,
  conversationId: string,
  userMessage: string,
  schoolName: string
): Promise<OrchestratorResult> {
  // --- 1. Conversation manager: load or create compact memory -------------
  // getOwnedMemory throws ForbiddenError if conversationId belongs to another
  // user (see memory.ts) — that propagates up to the handler as a 403 rather
  // than silently reusing or overwriting someone else's conversation memory.
  let memory = await getOwnedMemory(conversationId, ctx.uid);
  if (!memory) memory = await initMemory(conversationId, ctx.uid, ctx.role, ctx.language);

  const screened = screenUntrustedText(userMessage);
  if (screened.flagged) {
    await writeAuditLog(ctx, { action: "security:prompt_injection_flagged", result: "denied", reason: screened.reasons.join("; ") });
  }
  if (isSystemPromptExtractionAttempt(userMessage)) {
    return {
      message: "I can't share my internal configuration, but I'm happy to help with anything school-related!",
      intent: null, toolUsed: null, sources: [], suggestedActions: [], requiresConfirmation: null,
    };
  }

  // --- 2. Pending confirmation handling ------------------------------------
  if (memory.pendingConfirmation) {
    if (AFFIRMATION.test(userMessage.trim())) {
      return executeConfirmedTool(ctx, conversationId, memory.pendingConfirmation, schoolName);
    }
    if (NEGATION.test(userMessage.trim())) {
      await updateMemory(conversationId, { pendingConfirmation: null });
      await appendMessage(conversationId, { role: "user", content: userMessage, timestamp: new Date().toISOString() });
      const cancelled = "No problem — I won't go ahead with that.";
      await appendMessage(conversationId, { role: "assistant", content: cancelled, timestamp: new Date().toISOString() });
      return { message: cancelled, intent: null, toolUsed: null, sources: [], suggestedActions: [], requiresConfirmation: null };
    }
    // Anything else clears the stale confirmation and falls through to a normal turn
    // (e.g. the user changed topic instead of answering yes/no).
    await updateMemory(conversationId, { pendingConfirmation: null });
  }

  await appendMessage(conversationId, { role: "user", content: screened.clean, timestamp: new Date().toISOString() });

  // --- 3. Build compact context for the model ------------------------------
  const history = await recentMessages(conversationId, AI_CONFIG.maxHistoryMessages);
  const systemInstruction = buildSystemInstruction(ctx.role, ctx.language, schoolName);
  const memoryNote = fenceUntrustedContent(
    "CONVERSATION MEMORY",
    JSON.stringify({ currentTopic: memory.currentTopic, currentStudentId: memory.currentStudentId, recentEntities: memory.recentEntities, lastIntent: memory.lastIntent })
  );

  const ai = geminiClient();
  const allowedDeclarations = GEMINI_TOOL_DECLARATIONS.filter((d) => roleAllowed(ctx, TOOL_BY_NAME[d.name].allowedRoles));

  const contents = [
    ...history.map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] })),
  ];

  let toolUsed: string | null = null;
  let intent: AIIntent | null = null;
  const sources: AISource[] = [];
  let pendingConfirmation: PendingConfirmation | null = null;
  let finalText = "";

  for (let round = 0; round < AI_CONFIG.maxToolCallsPerTurn; round++) {
    const response = await ai.models.generateContent({
      model: AI_CONFIG.geminiModel,
      contents,
      config: {
        systemInstruction: `${systemInstruction}\n\n${memoryNote}`,
        tools: allowedDeclarations.length ? [{ functionDeclarations: allowedDeclarations }] : undefined,
      },
    });

    const functionCalls = response.functionCalls ?? [];
    if (functionCalls.length === 0) {
      finalText = response.text ?? "";
      break;
    }

    const call = functionCalls[0]; // one tool per round keeps behavior predictable and auditable
    const tool = TOOL_BY_NAME[call.name as string];
    if (!tool) {
      finalText = "I tried to look that up but hit an internal error. Could you rephrase?";
      break;
    }

    // --- 4. Write tools stop here for confirmation --------------------------
    if (tool.requiresConfirmation) {
      const parsed = tool.inputSchema.safeParse(call.args ?? {});
      if (!parsed.success) {
        finalText = "I need a bit more detail before I can do that — could you clarify?";
        break;
      }
      const summary = describeAction(tool.name, parsed.data as Record<string, unknown>);
      pendingConfirmation = { toolName: tool.name, args: parsed.data as Record<string, unknown>, summary };
      finalText = summary;
      toolUsed = tool.name;
      break;
    }

    // --- 5. Read tools: validate → authorize → execute → validate result ---
    // (routed through the same authorizeAndExecuteTool() path voice uses —
    // one security boundary for every channel)
    const execResult = await authorizeAndExecuteTool(ctx, tool.name, call.args ?? {}, true);
    let toolResultText: string;
    if (!execResult.ok) {
      if (execResult.error === "MULTIPLE_CHILDREN") {
        finalText = "Sure — which child would you like me to check?";
        break;
      }
      toolResultText = JSON.stringify({ error: execResult.error ?? "Not authorized for this request." });
    } else {
      toolUsed = tool.name;
      intent = inferIntent(tool.name);
      if (isRecordWithSource(execResult.result)) sources.push(execResult.result.source);
      toolResultText = JSON.stringify(execResult.result);
    }

    // Feed the (validated, fenced) tool result back for the model's next turn.
    contents.push({ role: "model", parts: [{ functionCall: { name: tool.name, args: call.args } }] } as never);
    contents.push({
      role: "function" as never,
      parts: [{ functionResponse: { name: tool.name, response: { result: fenceUntrustedContent("TOOL RESULT", toolResultText) } } }],
    } as never);
  }

  if (!finalText) finalText = "I wasn't able to put together an answer for that — could you try asking a different way?";

  await appendMessage(conversationId, { role: "assistant", content: finalText, timestamp: new Date().toISOString() });
  await updateMemory(conversationId, {
    currentTopic: intent ?? memory.currentTopic,
    lastIntent: intent ?? memory.lastIntent,
    pendingConfirmation,
  });

  return {
    message: finalText,
    intent,
    toolUsed,
    sources,
    suggestedActions: suggestedActionsFor(ctx.role, intent),
    requiresConfirmation: pendingConfirmation,
  };
}

async function executeConfirmedTool(
  ctx: TrustedUserContext,
  conversationId: string,
  pending: PendingConfirmation,
  _schoolName: string
): Promise<OrchestratorResult> {
  const tool = TOOL_BY_NAME[pending.toolName];
  await appendMessage(conversationId, { role: "user", content: "(confirmed)", timestamp: new Date().toISOString() });
  await updateMemory(conversationId, { pendingConfirmation: null });

  const execResult = await authorizeAndExecuteTool(ctx, tool.name, pending.args, true);
  const message = execResult.ok
    ? confirmationSuccessMessage(tool.name, execResult.result)
    : `I wasn't able to complete that: ${execResult.error ?? "unknown error"}.`;

  await appendMessage(conversationId, { role: "assistant", content: message, timestamp: new Date().toISOString() });
  return {
    message,
    intent: execResult.ok ? inferIntent(tool.name) : null,
    toolUsed: execResult.ok ? tool.name : null,
    sources: [],
    suggestedActions: [],
    requiresConfirmation: null,
  };
}

function describeAction(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case "markAttendance":
      return `Just to confirm — mark ${args.studentName} as ${args.status} for ${args.date ?? "today"}?`;
    case "createTeacherSupportRequest":
      return "I can submit a request for your teacher to reach out. Should I send it now?";
    case "createManagementSupportRequest":
      return "I can submit a request for school management to reach out. Should I send it now?";
    default:
      return "Should I go ahead with that?";
  }
}

function confirmationSuccessMessage(toolName: string, result: unknown): string {
  const r = result as Record<string, unknown>;
  switch (toolName) {
    case "markAttendance":
      return `Done. ${r.studentName} has been marked ${r.status} for ${r.date}.`;
    case "createTeacherSupportRequest":
      return "Your request has been submitted to the teacher. They'll follow up with you soon.";
    case "createManagementSupportRequest":
      return "Your request has been submitted to school management. They'll follow up with you soon.";
    default:
      return "Done.";
  }
}

function inferIntent(toolName: string): AIIntent | null {
  const map: Record<string, AIIntent> = {
    getStudentAttendance: "GET_STUDENT_ATTENDANCE", getChildAttendance: "GET_CHILD_ATTENDANCE",
    getClassAttendance: "GET_CLASS_ATTENDANCE", getSchoolAttendance: "GET_SCHOOL_ATTENDANCE",
    getAssignments: "GET_ASSIGNMENTS", getExams: "GET_EXAMS", getSchedule: "GET_SCHEDULE",
    getAnnouncements: "GET_ANNOUNCEMENTS", getResources: "GET_RESOURCES", getSchoolPolicy: "GET_POLICY",
    getStudentProfile: "GET_STUDENT_PROFILE", getSchoolAnalytics: "GET_ANALYTICS", markAttendance: "MARK_ATTENDANCE",
    createTeacherSupportRequest: "CREATE_TEACHER_REQUEST", createManagementSupportRequest: "CREATE_MANAGEMENT_REQUEST",
  };
  return map[toolName] ?? null;
}

function suggestedActionsFor(role: string, intent: AIIntent | null): string[] {
  if (intent === "GET_STUDENT_ATTENDANCE" || intent === "GET_CHILD_ATTENDANCE") return ["Show last month too", "Any classes I'm missing?"];
  if (intent === "GET_ASSIGNMENTS") return ["Explain this one", "What's due next?"];
  if (intent === "GET_POLICY") return ["Anything else in the handbook?"];
  if (role === "principal") return ["Which class needs attention?", "Show the attendance trend"];
  return [];
}

function isRecordWithSource(value: unknown): value is { source: AISource } {
  return typeof value === "object" && value !== null && "source" in value;
}

export async function ensureSchoolName(schoolId: string): Promise<string> {
  const snap = await adminDb().collection("schools").doc(schoolId).get();
  return (snap.data()?.name as string) ?? "your school";
}
