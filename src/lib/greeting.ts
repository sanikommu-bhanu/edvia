// ==========================================================================
// Header greeting copy
// --------------------------------------------------------------------------
// Pure string logic, kept out of the component so the wording can be tested
// directly — including the fallbacks, which are the part most likely to be
// seen (a profile whose linked records haven't loaded yet).
// ==========================================================================
import type { Role } from "@/types";

export function timeGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export interface HeaderContext {
  childName?: string;
  classCount?: number;
  className?: string;
}

/**
 * One line of genuinely useful context per role, because each role wants
 * something different in the first two seconds:
 *   student   — what today looks like
 *   parent    — whose update this is
 *   teacher   — how much work today holds
 *   principal — that they are looking at the whole school
 *
 * Every branch has a fallback that reads as a complete sentence, so a
 * still-loading record never renders a line with a gap in it.
 */
export function headerSubtitle(role: Role, ctx: HeaderContext): string {
  switch (role) {
    case "student":
      return ctx.className ? `Ready for ${ctx.className} today?` : "Ready for today's classes?";
    case "parent":
      return ctx.childName ? `${ctx.childName}'s school update` : "Your child's school update";
    case "teacher":
      if (ctx.classCount === undefined) return "Here's your day";
      if (ctx.classCount === 0) return "No classes assigned yet";
      return ctx.classCount === 1 ? "1 class today" : `${ctx.classCount} classes today`;
    case "principal":
      return "School overview";
  }
}

/** First name only, with a warm fallback rather than an empty greeting. */
export function firstNameOf(fullName: string | undefined): string {
  return fullName?.trim().split(/\s+/)[0] || "there";
}
