// ==========================================================================
// AIOrchestrator — EDVIA's intelligence layer
// --------------------------------------------------------------------------
// One turn, in order:
//
//   user input
//     → screening (injection / extraction attempts)
//     → language detection            (deterministic, pre-model)
//     → conversation memory load      (ownership-checked)
//     → pending-confirmation branch   (yes / no / changed-the-subject)
//     → role-filtered tool catalogue  (the model only SEES what it may ask for)
//     → model turn: intent + entity extraction via function calling
//     → server-side authorization     (execute.ts — the real boundary)
//     → School Service → Firestore
//     → validated result, fenced, fed back
//     → grounded natural-language answer, streamed
//     → memory update
//
// The model chooses WHICH tool to ask for. It never decides whether it is
// allowed — that answer is computed from a verified Firebase ID token
// without consulting the model at all. A perfect jailbreak still cannot
// read another family's child's attendance.
//
// The turn is an async generator so the UI can show what is genuinely
// happening (verifying access, checking attendance, preparing your answer)
// instead of a spinner that guesses. Every activity event corresponds to
// work actually in flight — see AVATAR STATES in docs/ARCHITECTURE.md.
// ==========================================================================
import { geminiClient, isGeminiConfigured } from "./gemini";
import { AI_CONFIG } from "./config";
import { buildSystemInstruction } from "./persona";
import { TOOL_BY_NAME, GEMINI_TOOL_DECLARATIONS } from "./tools";
import { roleAllowed } from "./tools/registry";
import { authorizeAndExecuteTool, type ExecuteToolResult } from "./tools/execute";
import { writeAuditLog } from "./audit";
import {
  getOwnedMemory,
  initMemory,
  updateMemory,
  appendMessage,
  recentMessages,
  deriveMemoryPatch,
} from "./memory";
import {
  screenUntrustedText,
  fenceUntrustedContent,
  classifyExtractionAttempt,
  refusalMessage,
  redactSensitive,
} from "./security";
import { detectLanguage } from "./language";
import { getSchoolName } from "./school/people";
import type { TrustedUserContext } from "./userContext";
import type { AISource, PendingConfirmation, AIIntent, AIAgentState, LanguageCode } from "../../src/types";
import type { Content, FunctionDeclaration } from "@google/genai";

export interface OrchestratorResult {
  message: string;
  intent: AIIntent | null;
  toolUsed: string | null;
  sources: AISource[];
  suggestedActions: string[];
  requiresConfirmation: PendingConfirmation | null;
  language: LanguageCode;
}

export type OrchestratorEvent =
  /** Real, currently-executing work. Drives the avatar and the activity line. */
  | { type: "activity"; state: AIAgentState; label: string }
  /** Incremental answer text. */
  | { type: "delta"; text: string }
  /** Discard any streamed text so far — the model changed course to a tool call. */
  | { type: "reset" }
  /** Terminal event; exactly one per turn. */
  | { type: "final"; result: OrchestratorResult };

/**
 * Confirmation and refusal, in every language EDVIA supports.
 *
 * The trailing guard is `(?![\p{L}\p{N}])` with the /u flag, NOT `\b`.
 * JavaScript's `\b` is defined over [A-Za-z0-9_] only, so a boundary after
 * a Devanagari, Tamil or Arabic-script word never matches — every
 * non-Latin alternative in this pattern would have been dead code, and a
 * parent confirming with "हाँ" would have been silently ignored. The
 * Unicode-property lookahead means "yes" still won't match inside "yesterday"
 * while "हाँ" matches at the end of a string.
 */
const AFFIRMATION =
  /^\s*(?:yes|yeah|yep|yup|sure|okay|ok|go ahead|do it|please do|confirmed|confirm|correct|that'?s right|haan|haa|ஆம்|சரி|అవును|हाँ|हां|ठीक|होय|হ্যাঁ|હા|ਹਾਂ|ಹೌದು|അതെ|جی ہاں|جی|ہاں)(?![\p{L}\p{N}])/iu;

/** Offer lifetime, matching the voice relay in api/ai/tool-call.ts. */
const CONFIRMATION_TTL_MS = 2 * 60 * 1000;

const NEGATION =
  /^\s*(?:no|nope|nah|cancel|don'?t|do not|stop|never ?mind|leave it|नहीं|नको|इल्लै|இல்லை|కాదు|వద్దు|না|ના|ਨਹੀਂ|ಇಲ್ಲ|ഇല്ല|نہیں)(?![\p{L}\p{N}])/iu;

// --------------------------------------------------------------------------
// Public entry points
// --------------------------------------------------------------------------

/** Non-streaming wrapper — used by tests and any caller that wants one object. */
export async function handleConversationTurn(
  ctx: TrustedUserContext,
  conversationId: string,
  userMessage: string,
  schoolName: string
): Promise<OrchestratorResult> {
  let final: OrchestratorResult | null = null;
  for await (const event of streamConversationTurn(ctx, conversationId, userMessage, schoolName)) {
    if (event.type === "final") final = event.result;
  }
  if (!final) throw new Error("Orchestrator produced no final result");
  return final;
}

export async function* streamConversationTurn(
  ctx: TrustedUserContext,
  conversationId: string,
  userMessage: string,
  schoolName: string
): AsyncGenerator<OrchestratorEvent> {
  yield activity("thinking", "Understanding your request…");

  // --- 1. Screen the input -------------------------------------------------
  const screened = screenUntrustedText(userMessage);
  if (screened.flagged) {
    // Recorded, not blocked. A role claim in particular is answered normally
    // using the caller's REAL role — see the ROLE_CLAIM note in security.ts.
    await writeAuditLog(ctx, {
      action: "security:input_flagged",
      result: screened.claimsRole ? "success" : "denied",
      reason: screened.reasons.join(","),
    });
  }

  const extraction = classifyExtractionAttempt(userMessage);
  if (extraction) {
    await writeAuditLog(ctx, {
      action: `security:${extraction}_extraction_attempt`,
      result: "denied",
      reason: extraction,
    });
    const text = refusalMessage(extraction);
    yield { type: "delta", text };
    yield {
      type: "final",
      result: {
        message: text,
        intent: null,
        toolUsed: null,
        sources: [],
        suggestedActions: [],
        requiresConfirmation: null,
        language: ctx.language,
      },
    };
    return;
  }

  // --- 2. Language detection (deterministic, before any model call) --------
  const detection = detectLanguage(screened.clean, ctx.language);
  const language = detection.language;

  // --- 3. Load conversation memory (ownership-checked) ---------------------
  let memory = await getOwnedMemory(conversationId, ctx.uid);
  if (!memory) memory = await initMemory(conversationId, ctx.uid, ctx.role, language);
  let seq = memory.turnCount ? memory.turnCount * 2 : 0;

  // Memory can only narrow, never widen: the tool layer re-checks this id
  // against the caller's real links before using it.
  const turnCtx: TrustedUserContext = { ...ctx, conversationStudentId: memory.currentStudentId, language };

  // --- 4. Pending confirmation branch --------------------------------------
  if (memory.pendingConfirmation) {
    const pending = memory.pendingConfirmation;
    const trimmed = screened.clean.trim();
    const expired = Boolean(pending.expiresAt && Date.parse(pending.expiresAt) < Date.now());

    if (expired) {
      // Drop it and handle this as an ordinary turn. Saying "yes" to a
      // question EDVIA asked ten minutes ago must not write anything.
      await updateMemory(conversationId, { pendingConfirmation: null });
    } else if (AFFIRMATION.test(trimmed)) {
      yield* executeConfirmed(turnCtx, conversationId, pending, seq, language, memory.currentStudentName);
      return;
    } else if (NEGATION.test(trimmed)) {
      await updateMemory(conversationId, { pendingConfirmation: null });
      await appendMessage(conversationId, { role: "user", content: trimmed, timestamp: nowIso() }, seq++);
      const cancelled = "No problem — I haven't made any changes.";
      await appendMessage(conversationId, { role: "assistant", content: cancelled, timestamp: nowIso() }, seq++);
      await writeAuditLog(turnCtx, {
        action: pending.toolName,
        toolName: pending.toolName,
        result: "denied",
        reason: "user_declined",
      });
      yield { type: "delta", text: cancelled };
      yield {
        type: "final",
        result: {
          message: cancelled,
          intent: null,
          toolUsed: null,
          sources: [],
          suggestedActions: [],
          requiresConfirmation: null,
          language,
        },
      };
      return;
    } else {
      // The user changed the subject rather than answering. Drop the pending
      // action — never carry it silently into a later "yes" — and handle
      // this as a normal turn.
      await updateMemory(conversationId, { pendingConfirmation: null });
    }
  }

  await appendMessage(conversationId, { role: "user", content: screened.clean, timestamp: nowIso() }, seq++);

  // --- 5. Gemini availability ----------------------------------------------
  if (!isGeminiConfigured()) {
    const text =
      "EDVIA AI is temporarily unavailable. You can still use your school dashboard for attendance, assignments and notices.";
    yield { type: "delta", text };
    yield {
      type: "final",
      result: {
        message: text,
        intent: null,
        toolUsed: null,
        sources: [],
        suggestedActions: [],
        requiresConfirmation: null,
        language,
      },
    };
    return;
  }

  // --- 6. Build the model turn ---------------------------------------------
  const history = await recentMessages(conversationId, AI_CONFIG.maxHistoryMessages);
  const systemInstruction = buildSystemInstruction({
    role: ctx.role,
    language,
    schoolName,
    today: today(),
    subjectName: memory.currentStudentName,
    languageSwitched: detection.switchedFromProfile,
  });

  // The model is only shown the tools this role may use. A student's model
  // turn does not even contain a declaration for markAttendance, so the
  // most common failure mode (asking for a tool it can't have) disappears.
  const allowedDeclarations: FunctionDeclaration[] = GEMINI_TOOL_DECLARATIONS.filter((d) =>
    roleAllowed(ctx, TOOL_BY_NAME[d.name as string].allowedRoles)
  );

  const contents: Content[] = history.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));

  const ai = geminiClient();
  const sources: AISource[] = [];
  let toolUsed: string | null = null;
  let intent: AIIntent | null = null;
  let pendingConfirmation: PendingConfirmation | null = null;
  let subjectStudentId: string | undefined;
  let subjectStudentName: string | undefined;
  let finalText = "";
  let streamedAny = false;

  try {
    for (let round = 0; round < AI_CONFIG.maxToolCallsPerTurn; round++) {
      let roundText = "";
      let call: { name: string; args: Record<string, unknown> } | null = null;

      const stream = await ai.models.generateContentStream({
        model: AI_CONFIG.geminiModel,
        contents,
        config: {
          systemInstruction,
          temperature: AI_CONFIG.temperature,
          tools: allowedDeclarations.length ? [{ functionDeclarations: allowedDeclarations }] : undefined,
        },
      });

      for await (const chunk of stream) {
        const calls = chunk.functionCalls ?? [];
        if (calls.length > 0 && !call) {
          // One tool per round keeps behaviour predictable and auditable.
          call = { name: String(calls[0].name), args: (calls[0].args ?? {}) as Record<string, unknown> };
          if (streamedAny || roundText) {
            // The model started talking and then decided to look something
            // up. Tell the client to discard what it has shown so far
            // rather than leaving a half-sentence stranded above the answer.
            yield { type: "reset" };
            streamedAny = false;
            roundText = "";
          }
          continue;
        }
        const text = chunk.text;
        if (text && !call) {
          roundText += text;
          streamedAny = true;
          yield { type: "delta", text };
        }
      }

      if (!call) {
        finalText = roundText;
        break;
      }

      // --- 7. Tool requested -------------------------------------------------
      const tool = TOOL_BY_NAME[call.name];
      if (!tool) {
        finalText = "I tried to look that up but couldn't. Could you rephrase?";
        break;
      }

      yield activity("verifying", "Verifying access…");
      yield activity("tool_execution", activityLabel(tool.name));

      const exec = await authorizeAndExecuteTool(turnCtx, tool.name, call.args, false);

      // A write tool stops here. Nothing has been changed yet; the preview
      // was produced by reading the live record, so the question EDVIA asks
      // reflects the real current value.
      if (exec.kind === "needs_confirmation" && exec.preview) {
        pendingConfirmation = {
          toolName: tool.name,
          args: call.args,
          summary: exec.preview.summary,
          details: exec.preview.details,
          noOp: exec.preview.noOp,
          // Time-boxed like the voice path: the preview quoted a live value,
          // and a "yes" arriving long afterwards would be confirming a
          // statement that may no longer be true.
          expiresAt: new Date(Date.now() + CONFIRMATION_TTL_MS).toISOString(),
        };
        finalText = exec.preview.summary;
        toolUsed = tool.name;
        intent = intentFor(tool.name);
        if (!streamedAny) yield { type: "delta", text: finalText };
        break;
      }

      if (exec.ok) {
        toolUsed = tool.name;
        intent = intentFor(tool.name);
        const subject = extractSubject(exec.result);
        if (subject.studentId) subjectStudentId = subject.studentId;
        if (subject.studentName) subjectStudentName = subject.studentName;
        const source = extractSource(exec.result);
        if (source && !sources.some((s) => s.id === source.id)) sources.push(source);
      }

      yield activity("thinking", "Preparing your answer…");

      contents.push({ role: "model", parts: [{ functionCall: { name: tool.name, args: call.args } }] });
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: tool.name,
              response: { result: fenceUntrustedContent("TOOL RESULT", JSON.stringify(toolResponsePayload(exec))) },
            },
          },
        ],
      });
    }
  } catch (err) {
    console.error("Gemini turn failed", err);
    await writeAuditLog(turnCtx, { action: "ai:turn_failed", result: "error", reason: errorName(err) });
    const text =
      "EDVIA AI is temporarily unavailable. You can continue using your school dashboard, or try asking again in a moment.";
    if (streamedAny) yield { type: "reset" };
    yield { type: "delta", text };
    yield {
      type: "final",
      result: {
        message: text,
        intent: null,
        toolUsed: null,
        sources: [],
        suggestedActions: [],
        requiresConfirmation: null,
        language,
      },
    };
    return;
  }

  if (!finalText.trim()) {
    finalText = "I wasn't able to put an answer together for that — could you try asking a different way?";
    if (!streamedAny) yield { type: "delta", text: finalText };
  }
  finalText = redactSensitive(finalText);

  await appendMessage(
    conversationId,
    { role: "assistant", content: finalText, timestamp: nowIso(), toolUsed },
    seq++
  );
  await updateMemory(conversationId, {
    ...deriveMemoryPatch(memory, {
      intent,
      studentId: subjectStudentId,
      studentName: subjectStudentName,
      language,
    }),
    pendingConfirmation,
  });

  yield activity(pendingConfirmation ? "idle" : "success", pendingConfirmation ? "Waiting for your confirmation" : "Done");
  yield {
    type: "final",
    result: {
      message: finalText,
      intent,
      toolUsed,
      sources,
      suggestedActions: pendingConfirmation ? [] : suggestedActionsFor(ctx.role, intent, language),
      requiresConfirmation: pendingConfirmation,
      language,
    },
  };
}

// --------------------------------------------------------------------------
// Confirmed action execution
// --------------------------------------------------------------------------

async function* executeConfirmed(
  ctx: TrustedUserContext,
  conversationId: string,
  pending: PendingConfirmation,
  startSeq: number,
  language: LanguageCode,
  subjectName?: string
): AsyncGenerator<OrchestratorEvent> {
  let seq = startSeq;
  await appendMessage(conversationId, { role: "user", content: "Yes", timestamp: nowIso() }, seq++);
  // Clear the pending action BEFORE executing, so a retry or a duplicate
  // "yes" can't run the same write twice.
  await updateMemory(conversationId, { pendingConfirmation: null });

  yield activity("verifying", "Verifying access…");
  yield activity("tool_execution", activityLabel(pending.toolName));

  const exec = await authorizeAndExecuteTool(ctx, pending.toolName, pending.args, true);

  // Only the tool's actual return value decides what EDVIA claims happened.
  const message = exec.ok
    ? successMessage(pending.toolName, exec.result)
    : failureMessage(pending.toolName, exec);

  await appendMessage(
    conversationId,
    { role: "assistant", content: message, timestamp: nowIso(), toolUsed: exec.ok ? pending.toolName : null },
    seq++
  );

  const subject = exec.ok ? extractSubject(exec.result) : {};
  await updateMemory(conversationId, {
    lastIntent: exec.ok ? (intentFor(pending.toolName) ?? undefined) : undefined,
    currentStudentId: subject.studentId,
    currentStudentName: subject.studentName ?? subjectName,
    turnCount: seq / 2,
  });

  yield activity(exec.ok ? "success" : "error", exec.ok ? "Done" : "Couldn't complete that");
  yield { type: "delta", text: message };
  yield {
    type: "final",
    result: {
      message,
      intent: exec.ok ? intentFor(pending.toolName) : null,
      toolUsed: exec.ok ? pending.toolName : null,
      sources: [],
      suggestedActions: [],
      requiresConfirmation: null,
      language,
    },
  };
}

/**
 * Wording here is load-bearing. "Submitted to the teacher" is true — a
 * routed request row now exists. "The teacher has been contacted" would not
 * be, and is exactly the claim the challenge calls out as unacceptable.
 */
function successMessage(toolName: string, result: unknown): string {
  const r = (result ?? {}) as Record<string, unknown>;
  switch (toolName) {
    case "markAttendance": {
      const when = r.date === today() ? "today" : String(r.date);
      if (r.changed === false) return `${r.studentName} was already marked ${r.status} for ${when} — nothing changed.`;
      return r.previousStatus
        ? `Done — ${r.studentName} is now marked ${r.status} for ${when} (changed from ${r.previousStatus}).`
        : `Done — ${r.studentName} is marked ${r.status} for ${when}.`;
    }
    case "createTeacherCallRequest":
      return `Your call request has been submitted to ${r.routedTo ?? "the teacher"}. You'll get a notification when they respond.`;
    case "createManagementSupportRequest":
      return "Your request has been submitted to school management. You'll get a notification when they respond.";
    default:
      return "Done.";
  }
}

function failureMessage(toolName: string, exec: ExecuteToolResult): string {
  if (exec.kind === "not_authorized" || exec.kind === "role_denied") {
    return exec.error ?? "You're not able to do that.";
  }
  switch (toolName) {
    case "markAttendance":
      return "I couldn't save that attendance change right now. Nothing has been changed — please try again in a moment.";
    case "createTeacherCallRequest":
    case "createManagementSupportRequest":
      return "I couldn't submit the request right now. Please try again in a moment.";
    default:
      return exec.error ?? "The requested action couldn't be completed.";
  }
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/**
 * What the model is allowed to see about a failed call. Authorization
 * failures are reported as a plain refusal so the model doesn't narrate the
 * reason in a way that discloses whether the record exists.
 */
function toolResponsePayload(exec: ExecuteToolResult): unknown {
  if (exec.ok) return exec.result;
  switch (exec.kind) {
    case "ambiguous":
      return {
        status: "ambiguous",
        instruction: "Ask the user which one they mean. Do not guess.",
        options: exec.candidates ?? [],
      };
    case "no_data":
      return { status: "no_data", instruction: "Tell the user honestly that there is no record. Do not estimate.", detail: exec.error };
    case "not_authorized":
    case "role_denied":
      return { status: "not_authorized", instruction: "Decline warmly. Do not reveal whether the record exists.", detail: exec.error };
    default:
      return { status: "unavailable", instruction: "Say you couldn't retrieve it right now. Do not invent a value.", detail: exec.error };
  }
}

/** Safe, user-facing description of the work in flight — never chain-of-thought. */
function activityLabel(toolName: string): string {
  if (toolName.toLowerCase().includes("attendance")) return "Checking attendance records…";
  if (toolName === "getAssignments") return "Checking assignments…";
  if (toolName === "getExams") return "Checking the exam schedule…";
  if (toolName === "getSchedule") return "Checking the timetable…";
  if (toolName === "getSchoolPolicy") return "Looking up the school handbook…";
  if (toolName === "getAnnouncements") return "Checking school notices…";
  if (toolName === "getResources") return "Looking through study resources…";
  if (toolName === "getSchoolAnalytics") return "Pulling together school analytics…";
  if (toolName === "getNotifications") return "Checking your notifications…";
  if (toolName.startsWith("create")) return "Submitting your request…";
  return "Checking school records…";
}

function activity(state: AIAgentState, label: string): OrchestratorEvent {
  return { type: "activity", state, label };
}

function extractSource(result: unknown): AISource | null {
  if (typeof result !== "object" || result === null || !("source" in result)) return null;
  const source = (result as { source: unknown }).source;
  if (typeof source !== "object" || source === null) return null;
  const s = source as Partial<AISource>;
  return s.id && s.title && s.kind ? (source as AISource) : null;
}

function extractSubject(result: unknown): { studentId?: string; studentName?: string } {
  if (typeof result !== "object" || result === null) return {};
  const r = result as Record<string, unknown>;
  return {
    studentId: typeof r.studentId === "string" ? r.studentId : undefined,
    studentName: typeof r.studentName === "string" ? r.studentName : undefined,
  };
}

function intentFor(toolName: string): AIIntent | null {
  const map: Record<string, AIIntent> = {
    getStudentAttendance: "GET_STUDENT_ATTENDANCE",
    getChildAttendance: "GET_CHILD_ATTENDANCE",
    getAttendanceDetail: "GET_ATTENDANCE_DETAIL",
    getClassAttendance: "GET_CLASS_ATTENDANCE",
    getSchoolAttendance: "GET_SCHOOL_ATTENDANCE",
    getAssignments: "GET_ASSIGNMENTS",
    getExams: "GET_EXAMS",
    getSchedule: "GET_SCHEDULE",
    getAnnouncements: "GET_ANNOUNCEMENTS",
    getResources: "GET_RESOURCES",
    getSchoolPolicy: "GET_POLICY",
    getStudentProfile: "GET_STUDENT_PROFILE",
    getClassInformation: "GET_CLASS_INFORMATION",
    getSchoolInformation: "GET_SCHOOL_INFORMATION",
    getSchoolAnalytics: "GET_ANALYTICS",
    getNotifications: "GET_NOTIFICATIONS",
    getSupportRequests: "GET_SUPPORT_REQUESTS",
    markAttendance: "MARK_ATTENDANCE",
    createTeacherCallRequest: "CREATE_TEACHER_REQUEST",
    createManagementSupportRequest: "CREATE_MANAGEMENT_REQUEST",
  };
  return map[toolName] ?? null;
}

/**
 * Follow-up chips. Deliberately English-only: shipping machine-translated
 * UI strings into ten Indian languages without a native reviewer is a worse
 * experience than showing none, and the reply itself is always in the
 * user's language regardless. See docs/CHALLENGE_COMPLIANCE.md §Languages.
 */
function suggestedActionsFor(role: string, intent: AIIntent | null, language: LanguageCode): string[] {
  if (language !== "en") return [];
  switch (intent) {
    case "GET_STUDENT_ATTENDANCE":
    case "GET_CHILD_ATTENDANCE":
      return ["What about last month?", "Which days were missed?"];
    case "GET_ATTENDANCE_DETAIL":
      return ["What's the attendance policy?", "I'd like to talk to the teacher"];
    case "GET_ASSIGNMENTS":
      return ["What's due next?", "Explain the maths one"];
    case "GET_EXAMS":
      return ["What should I revise first?"];
    case "GET_POLICY":
      return ["Anything else in the handbook?"];
    case "GET_SCHOOL_ATTENDANCE":
    case "GET_ANALYTICS":
      return ["Which class needs attention?", "Show last month"];
    case "MARK_ATTENDANCE":
      return ["Show today's class attendance"];
    default:
      break;
  }
  switch (role) {
    case "student":
      return ["What's due this week?", "What's my attendance?"];
    case "parent":
      return ["How is my child's attendance?", "Any notices from school?"];
    case "teacher":
      return ["Show my class attendance", "What's due for my class?"];
    case "principal":
      return ["What's overall attendance?", "Which class needs attention?"];
    default:
      return [];
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function errorName(err: unknown): string {
  return err instanceof Error ? err.name : "unknown";
}

/** Kept as a named export: several routes need the school's display name. */
export async function ensureSchoolName(schoolId: string): Promise<string> {
  return getSchoolName(schoolId);
}
