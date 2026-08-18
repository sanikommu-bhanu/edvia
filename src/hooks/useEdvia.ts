import { useAuth } from "@/app/AuthContext";
import { suggestedStartersFor } from "@/services/ai/ai.service";
import type { Role } from "@/types";

/**
 * Top-level EDVIA hook — what the assistant home and other non-conversation
 * screens need. Conversation state lives in useConversation(); voice state
 * lives in useVoiceAssistant().
 *
 * Everything here is derived from the authenticated role, so a student and
 * a principal genuinely see a different assistant rather than the same one
 * in different colours.
 */
export function useEdvia() {
  const { user } = useAuth();
  const role: Role = user?.role ?? "student";

  return {
    user,
    role,
    firstName: user?.fullName?.split(" ")[0] ?? "there",
    starters: suggestedStartersFor(role),
    capabilities: capabilitiesFor(role),
  };
}

/** Mirrors the server-side persona capability list (api/_lib/persona.ts). */
function capabilitiesFor(role: Role): string[] {
  switch (role) {
    case "student":
      return ["your attendance", "assignments and exams", "your timetable", "school notices", "study questions"];
    case "parent":
      return ["your child's attendance", "their assignments and exams", "school notices and policies", "reaching their teacher"];
    case "teacher":
      return ["your classes' attendance", "marking attendance", "assignments and exams", "school notices"];
    case "principal":
      return ["school-wide attendance", "class-by-class analytics", "school notices and policies"];
  }
}
