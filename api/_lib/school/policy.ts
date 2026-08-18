// ==========================================================================
// School Service — Policy retrieval (lightweight RAG)
// --------------------------------------------------------------------------
// School handbooks are pre-split into sections stored at
// /policies/{schoolId}/sections/*. Retrieval is keyword scoring over
// title + keywords + body, which is sufficient for a bounded handbook and
// avoids standing up a vector database nobody needs at this scale. If a
// school's policy set outgrows keyword matching, swap the internals here
// for Gemini File Search — the exported contract stays identical.
// ==========================================================================
import { adminDb } from "../firebaseAdmin";

export interface PolicySection {
  id: string;
  title: string;
  content: string;
  section: string;
  keywords?: string[];
}

export interface PolicyMatch extends PolicySection {
  score: number;
}

export async function listPolicySections(schoolId: string): Promise<PolicySection[]> {
  const snap = await adminDb().collection("policies").doc(schoolId).collection("sections").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PolicySection, "id">) }));
}

export async function searchPolicy(schoolId: string, topic: string): Promise<PolicyMatch[]> {
  const sections = await listPolicySections(schoolId);
  if (sections.length === 0) return [];

  const words = topic
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
  if (words.length === 0) return [];

  return sections
    .map((s) => {
      const title = s.title.toLowerCase();
      const keywords = (s.keywords ?? []).join(" ").toLowerCase();
      const body = s.content.toLowerCase();
      // Title and curated keywords are stronger signals than a body mention.
      const score = words.reduce(
        (sum, w) => sum + (title.includes(w) ? 3 : 0) + (keywords.includes(w) ? 2 : 0) + (body.includes(w) ? 1 : 0),
        0
      );
      return { ...s, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
}
