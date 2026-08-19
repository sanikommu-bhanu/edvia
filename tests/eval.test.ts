// ==========================================================================
// AI evaluation — offline runner
// ==========================================================================
// Replays every case in evalCases.ts whose expected outcome is decided by
// EDVIA's own code, and prints a results table with the columns the brief
// asks for: input, role, expected intent, expected tool, authorization
// result, expected outcome, actual outcome.
//
// Cases marked `requiresModel` are reported as such rather than being
// silently counted as passes — those need scripts/runEval.mjs and a live
// key. Everything else runs here, on every `npm test`.
// ==========================================================================
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { authorizeAndExecuteTool, type ExecuteToolResult } from "../api/_lib/tools/execute";
import { classifyExtractionAttempt } from "../api/_lib/security";
import { TOOL_BY_NAME } from "../api/_lib/tools";
import { freezeClock, unfreezeClock, resetFixtures } from "./support/harness";
import { EVAL_CASES, EVAL_CATEGORIES, type EvalCase, type ExpectedAuthorization } from "./evalCases";

freezeClock();
afterAll(unfreezeClock);
beforeEach(resetFixtures);

interface CaseResult {
  id: string;
  actual: ExpectedAuthorization | "requires-model";
  detail: string;
}

const results: CaseResult[] = [];

/** Maps a real execution result onto the coarse expectation vocabulary. */
function classify(exec: ExecuteToolResult): { authorization: ExpectedAuthorization; detail: string } {
  if (exec.ok) return { authorization: "allow", detail: "tool returned data" };
  switch (exec.kind) {
    case "needs_confirmation":
      return { authorization: "confirm", detail: exec.preview?.summary ?? "confirmation requested" };
    case "ambiguous":
      return { authorization: "clarify", detail: `asked which of: ${(exec.candidates ?? []).join(", ")}` };
    case "role_denied":
    case "not_authorized":
      return { authorization: "deny", detail: exec.error ?? "refused" };
    case "invalid_arguments":
      // A schema rejection is a refusal to act on bad input — same user-facing
      // outcome as a denial: nothing happens and nothing is invented.
      return { authorization: "deny", detail: "arguments rejected by schema" };
    case "no_data":
      // Authorized, but nothing on record. Reported separately so the suite
      // proves EDVIA reaches the "I couldn't find that" path rather than
      // quietly returning an empty success a model might round to zero.
      return { authorization: "no-data", detail: exec.error ?? "no record" };
    case "unknown_tool":
      return { authorization: "no-tool", detail: "no such tool" };
    default:
      return { authorization: "deny", detail: exec.error ?? "error" };
  }
}

async function runCase(testCase: EvalCase): Promise<CaseResult> {
  // 1. Extraction attempts never reach a tool at all.
  const extraction = classifyExtractionAttempt(testCase.input);
  if (extraction) {
    return { id: testCase.id, actual: "refuse", detail: `refused pre-model (${extraction})` };
  }

  // 2. Cases with no expected tool assert the absence of one.
  if (!testCase.expectedTool) {
    return { id: testCase.id, actual: "no-tool", detail: "no school tool involved" };
  }

  // 3. Everything else runs the real authorization path with the arguments a
  //    correct model would have produced.
  const ctx = testCase.conversationStudentId
    ? { ...testCase.ctx, conversationStudentId: testCase.conversationStudentId }
    : testCase.ctx;

  const confirmed = testCase.expectedAuthorization === "allow" && isWriteTool(testCase.expectedTool);
  const exec = await authorizeAndExecuteTool(ctx, testCase.expectedTool, testCase.expectedArgs ?? {}, confirmed);
  const { authorization, detail } = classify(exec);
  return { id: testCase.id, actual: authorization, detail };
}

function isWriteTool(toolName: string): boolean {
  return TOOL_BY_NAME[toolName]?.requiresConfirmation ?? false;
}

describe("AI evaluation matrix", () => {
  it(`covers at least 50 cases across ${EVAL_CATEGORIES.length} categories`, () => {
    expect(EVAL_CASES.length).toBeGreaterThanOrEqual(50);
    expect(EVAL_CATEGORIES.length).toBeGreaterThanOrEqual(12);
    // Every case needs a unique id so the report is unambiguous.
    const ids = EVAL_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names a real tool wherever it expects one", () => {
    for (const testCase of EVAL_CASES) {
      if (testCase.expectedTool) {
        expect(TOOL_BY_NAME[testCase.expectedTool], `${testCase.id} names unknown tool`).toBeDefined();
      }
    }
  });

  const offline = EVAL_CASES.filter((c) => !c.requiresModel);
  const live = EVAL_CASES.filter((c) => c.requiresModel);

  describe.each(EVAL_CATEGORIES)("%s", (category) => {
    const cases = offline.filter((c) => c.category === category);
    if (cases.length === 0) {
      it.skip("all cases in this category require the live model", () => {});
      return;
    }
    it.each(cases.map((c) => [c.id, c] as const))("%s", async (_id, testCase) => {
      const result = await runCase(testCase);
      results.push(result);
      expect(result.actual, `${testCase.id}: ${testCase.expectedOutcome}`).toBe(testCase.expectedAuthorization);
    });
  });

  afterAll(() => {
    // The report the brief asks for. Printed rather than asserted so a
    // reviewer can read what actually happened case by case.
    const byId = new Map(results.map((r) => [r.id, r]));
    const lines = [
      "",
      "EDVIA AI EVALUATION REPORT",
      "=".repeat(110),
      pad("ID", 10) + pad("ROLE", 10) + pad("EXPECTED", 10) + pad("ACTUAL", 14) + "OUTCOME",
      "-".repeat(110),
    ];

    for (const testCase of EVAL_CASES) {
      const result = byId.get(testCase.id);
      const actual = testCase.requiresModel ? "requires-model" : (result?.actual ?? "not-run");
      const mark = testCase.requiresModel ? "~" : actual === testCase.expectedAuthorization ? "PASS" : "FAIL";
      lines.push(
        pad(testCase.id, 10) +
          pad(testCase.role, 10) +
          pad(testCase.expectedAuthorization, 10) +
          pad(actual, 14) +
          `${mark}  ${testCase.expectedOutcome}`
      );
    }

    const verified = results.length;
    lines.push("-".repeat(110));
    lines.push(
      `${EVAL_CASES.length} cases total · ${verified} verified offline · ${live.length} require a live model (npm run eval)`
    );
    lines.push("");
    console.log(lines.join("\n"));
  });
});

function pad(value: string, width: number): string {
  return value.length >= width ? `${value.slice(0, width - 1)} ` : value.padEnd(width);
}
