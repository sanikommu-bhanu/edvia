// ==========================================================================
// getSchoolPolicy — grounded answers to "what does the school say about…"
// --------------------------------------------------------------------------
// Retrieval lives in the School Service layer (../school/policy.ts). This
// tool's only jobs are validating the topic, checking the caller belongs to
// a school, and returning the matched section together with a citable
// source so the chat UI can show "Source: School Policy · §4.2".
//
// Policy text is school-authored content, i.e. untrusted from the model's
// point of view — the orchestrator fences every tool result before the
// model sees it, so a handbook section containing "ignore your
// instructions" is read as data, not as a command.
// ==========================================================================
import { z } from "zod";
import type { ToolDefinition } from "./registry.js";
import { NoDataError } from "./registry.js";
import { searchPolicy } from "../school/policy.js";

export const getSchoolPolicy: ToolDefinition<{ topic: string }, unknown> = {
  name: "getSchoolPolicy",
  description:
    "Retrieve the school's actual written policy on a topic (attendance, leave, exams, discipline, transport, fees, academics). Always use this instead of answering policy questions from general knowledge — never invent policy content.",
  inputSchema: z.object({
    topic: z.string().min(2).max(120).describe("Policy topic, e.g. 'minimum attendance', 'exam retake policy'"),
  }),
  allowedRoles: ["student", "parent", "teacher", "principal"],
  requiresConfirmation: false,
  auditAction: "read:policy",
  authorize: async (ctx) => ({
    allowed: Boolean(ctx.schoolId),
    reason: "No school is linked to this account yet.",
  }),
  handler: async (ctx, input) => {
    const matches = await searchPolicy(ctx.schoolId, input.topic);
    if (matches.length === 0) {
      throw new NoDataError(
        `I couldn't find anything in your school's handbook covering "${input.topic}".`
      );
    }
    const best = matches[0];
    return {
      title: best.title,
      section: best.section,
      content: best.content,
      alsoRelevant: matches.slice(1, 3).map((m) => ({ title: m.title, section: m.section })),
      source: { id: best.id, title: best.title, kind: "policy" as const, section: best.section },
    };
  },
};
