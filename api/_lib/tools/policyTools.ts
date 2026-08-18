// ==========================================================================
// getSchoolPolicy — lightweight RAG
// --------------------------------------------------------------------------
// Deliberately simple: school policy documents are pre-split into sections
// and stored as Firestore documents (see /policies/{schoolId}/sections/*).
// We retrieve by keyword match over section titles/content, which is
// sufficient for a bounded set of school handbook sections and avoids
// standing up a separate vector database the spec explicitly discourages
// unless genuinely needed. If a school's policy set grows large enough that
// keyword retrieval stops being reliable, swap this for Gemini File Search
// (upload the handbook once, query the file-search store) without changing
// the tool's external contract.
// ==========================================================================
import { z } from "zod";
import { adminDb } from "../firebaseAdmin";
import type { ToolDefinition } from "./registry";

interface PolicySection {
  title: string;
  content: string;
  section: string;
  keywords: string[];
}

export const getSchoolPolicy: ToolDefinition<{ topic: string }, unknown> = {
  name: "getSchoolPolicy",
  description: "Retrieve the school's actual policy text on a topic (attendance, leave, exams, discipline, transport, fees, academics). Always use this instead of guessing at policy — never invent policy content.",
  inputSchema: z.object({ topic: z.string().describe("Policy topic, e.g. 'leave days', 'exam retake policy'") }),
  allowedRoles: ["student", "parent", "teacher", "principal"],
  requiresConfirmation: false,
  auditAction: "read:policy",
  authorize: async () => ({ allowed: true }),
  handler: async (ctx, input) => {
    const snap = await adminDb().collection("policies").doc(ctx.schoolId).collection("sections").get();
    const sections = snap.docs.map((d) => ({ id: d.id, ...(d.data() as PolicySection) }));
    if (sections.length === 0) {
      throw new Error("This school hasn't published policy documents in EDVIA yet.");
    }
    const topic = input.topic.toLowerCase();
    const scored = sections
      .map((s) => {
        const haystack = `${s.title} ${s.keywords?.join(" ") ?? ""} ${s.content}`.toLowerCase();
        const score = topic.split(/\s+/).filter((word) => word.length > 2 && haystack.includes(word)).length;
        return { ...s, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      throw new Error(`I couldn't find a policy section covering "${input.topic}".`);
    }
    const best = scored[0];
    return {
      title: best.title,
      section: best.section,
      content: best.content,
      source: { id: best.id, title: best.title, kind: "policy" as const, section: best.section },
    };
  },
};
