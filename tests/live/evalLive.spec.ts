// ==========================================================================
// AI evaluation — live runner
// ==========================================================================
// Replays the SAME case table as the offline suite (tests/evalCases.ts)
// against a running EDVIA instance with a real Gemini key. This is the only
// way to judge the half the offline suite cannot: whether the model picks
// the right tool from natural language, extracts the right entities, and
// answers in the right language.
//
// It reuses the case table rather than duplicating it, so the two runners
// can never drift into testing different things.
//
//   npm run eval
//
// Required environment:
//   EDVIA_EVAL_BASE_URL          e.g. https://edvia.vercel.app
//   EDVIA_FIREBASE_API_KEY       Web API key, for the Auth REST sign-in
//   EDVIA_EVAL_<ROLE>_EMAIL      one seeded account per role
//   EDVIA_EVAL_<ROLE>_PASSWORD
//     ROLE ∈ STUDENT | PARENT | TEACHER | PRINCIPAL
//
// Without those, every case is skipped with a clear message rather than
// reported as a pass.
// ==========================================================================
import { describe, it, expect, beforeAll } from "vitest";
import { EVAL_CASES, type EvalCase } from "../evalCases";
import type { Role } from "../../src/types";

const BASE_URL = process.env.EDVIA_EVAL_BASE_URL;
const API_KEY = process.env.EDVIA_FIREBASE_API_KEY;

const CREDENTIALS: Record<Role, { email?: string; password?: string }> = {
  student: { email: process.env.EDVIA_EVAL_STUDENT_EMAIL, password: process.env.EDVIA_EVAL_STUDENT_PASSWORD },
  parent: { email: process.env.EDVIA_EVAL_PARENT_EMAIL, password: process.env.EDVIA_EVAL_PARENT_PASSWORD },
  teacher: { email: process.env.EDVIA_EVAL_TEACHER_EMAIL, password: process.env.EDVIA_EVAL_TEACHER_PASSWORD },
  principal: { email: process.env.EDVIA_EVAL_PRINCIPAL_EMAIL, password: process.env.EDVIA_EVAL_PRINCIPAL_PASSWORD },
};

const configured = Boolean(BASE_URL && API_KEY);
const tokens = new Map<Role, string>();

interface TurnResult {
  message: string;
  intent: string | null;
  toolUsed: string | null;
  language: string;
  requiresConfirmation: { summary: string } | null;
}

interface LiveOutcome {
  id: string;
  toolMatched: boolean;
  intentMatched: boolean;
  languageMatched: boolean;
  actualTool: string | null;
  actualIntent: string | null;
  message: string;
  error?: string;
}

const outcomes: LiveOutcome[] = [];

async function signIn(role: Role): Promise<string | null> {
  const creds = CREDENTIALS[role];
  if (!creds.email || !creds.password) return null;
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: creds.email, password: creds.password, returnSecureToken: true }),
    }
  );
  if (!res.ok) {
    console.warn(`Could not sign in the ${role} evaluation account.`);
    return null;
  }
  const data = (await res.json()) as { idToken: string };
  return data.idToken;
}

/** One non-streaming turn against the deployed chat endpoint. */
async function ask(role: Role, conversationId: string, message: string): Promise<TurnResult> {
  const token = tokens.get(role);
  if (!token) throw new Error(`No token for ${role}`);
  const res = await fetch(`${BASE_URL}/api/ai/chat?stream=0`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ conversationId, message }),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as TurnResult;
}

/** Expected reply language, derived the same way the server derives it. */
function expectedLanguage(testCase: EvalCase): string | null {
  if (testCase.category !== "multilingual") return null;
  const scripts: [RegExp, string][] = [
    [/[஀-௿]/, "ta"],
    [/[ఀ-౿]/, "te"],
    [/[ঀ-৿]/, "bn"],
    [/[਀-੿]/, "pa"],
    [/[ऀ-ॿ]/, "hi"],
  ];
  for (const [pattern, code] of scripts) {
    if (pattern.test(testCase.input)) return code;
  }
  return null;
}

beforeAll(async () => {
  if (!configured) return;
  for (const role of ["student", "parent", "teacher", "principal"] as Role[]) {
    const token = await signIn(role);
    if (token) tokens.set(role, token);
  }
}, 60_000);

describe.skipIf(!configured)("AI evaluation — live model", () => {
  it("has credentials for at least one role", () => {
    expect(tokens.size).toBeGreaterThan(0);
  });

  for (const testCase of EVAL_CASES) {
    it(
      `${testCase.id} — ${testCase.input.slice(0, 60)}`,
      async () => {
        if (!tokens.has(testCase.role)) {
          console.warn(`skipped ${testCase.id}: no ${testCase.role} account configured`);
          return;
        }

        // A fresh conversation per case, except where the case explicitly
        // depends on prior context.
        const conversationId = `eval_${testCase.id}_${Date.now()}`;

        // Cases that assume an established subject get one real prior turn,
        // so memory is exercised rather than injected.
        if (testCase.conversationStudentId) {
          await ask(testCase.role, conversationId, "How is my child's attendance?");
        }

        let result: TurnResult;
        try {
          result = await ask(testCase.role, conversationId, testCase.input);
        } catch (err) {
          outcomes.push({
            id: testCase.id,
            toolMatched: false,
            intentMatched: false,
            languageMatched: false,
            actualTool: null,
            actualIntent: null,
            message: "",
            error: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }

        const wantLanguage = expectedLanguage(testCase);
        outcomes.push({
          id: testCase.id,
          toolMatched: result.toolUsed === testCase.expectedTool,
          intentMatched: result.intent === testCase.expectedIntent,
          languageMatched: wantLanguage ? result.language === wantLanguage : true,
          actualTool: result.toolUsed,
          actualIntent: result.intent,
          message: result.message,
        });

        // Assertions differ by what the case is actually claiming.
        switch (testCase.expectedAuthorization) {
          case "refuse":
            expect(result.toolUsed).toBeNull();
            expect(result.message).not.toMatch(/AIza|sk-|BEGIN PRIVATE KEY/);
            break;
          case "confirm":
            expect(result.requiresConfirmation, `${testCase.id} should ask before acting`).not.toBeNull();
            break;
          case "deny":
            expect(result.toolUsed, `${testCase.id} must not return data`).toBeNull();
            break;
          case "no-tool":
            expect(result.toolUsed).toBeNull();
            break;
          default:
            expect(result.toolUsed, `${testCase.id} expected ${testCase.expectedTool}`).toBe(testCase.expectedTool);
        }

        if (wantLanguage) {
          expect(result.language, `${testCase.id} should reply in ${wantLanguage}`).toBe(wantLanguage);
        }
      },
      90_000
    );
  }
});

describe.skipIf(configured)("AI evaluation — live model", () => {
  it("is not configured", () => {
    console.log(
      [
        "",
        "Live evaluation skipped — no deployed instance configured.",
        "Set EDVIA_EVAL_BASE_URL, EDVIA_FIREBASE_API_KEY and the per-role",
        "EDVIA_EVAL_<ROLE>_EMAIL / _PASSWORD variables, then re-run `npm run eval`.",
        "The offline suite (`npm test`) covers everything that does not need a live model.",
        "",
      ].join("\n")
    );
    expect(configured).toBe(false);
  });
});
