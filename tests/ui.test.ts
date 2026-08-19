// ==========================================================================
// UI helper logic
// --------------------------------------------------------------------------
// The pure functions behind the header and the school crest. They are
// separated from their components precisely so the interesting parts —
// fallbacks, pluralisation, deterministic colour, filler-word stripping —
// can be asserted without mounting React.
// ==========================================================================
import { describe, it, expect } from "vitest";
import { timeGreeting, headerSubtitle, firstNameOf } from "../src/lib/greeting";
import { schoolInitials, crestFor, CREST_PALETTE } from "../src/lib/schoolIdentity";

describe("greeting", () => {
  it("changes with the time of day", () => {
    expect(timeGreeting(new Date("2026-05-20T08:00:00"))).toBe("Good morning");
    expect(timeGreeting(new Date("2026-05-20T14:00:00"))).toBe("Good afternoon");
    expect(timeGreeting(new Date("2026-05-20T20:00:00"))).toBe("Good evening");
  });

  it("takes the first name only, with a warm fallback", () => {
    expect(firstNameOf("Rahul Kumar")).toBe("Rahul");
    expect(firstNameOf("  Priya   Sharma ")).toBe("Priya");
    expect(firstNameOf("")).toBe("there");
    expect(firstNameOf(undefined)).toBe("there");
  });
});

describe("header subtitle", () => {
  it("names the child for a parent", () => {
    expect(headerSubtitle("parent", { childName: "Rahul" })).toBe("Rahul's school update");
  });

  it("stays a complete sentence before the child record loads", () => {
    // The failure this guards against is rendering "'s school update".
    const subtitle = headerSubtitle("parent", {});
    expect(subtitle).toBe("Your child's school update");
    expect(subtitle.startsWith("'")).toBe(false);
  });

  it("pluralises the teacher's class count correctly", () => {
    expect(headerSubtitle("teacher", { classCount: 1 })).toBe("1 class today");
    expect(headerSubtitle("teacher", { classCount: 3 })).toBe("3 classes today");
    expect(headerSubtitle("teacher", { classCount: 0 })).toBe("No classes assigned yet");
    // undefined means "not loaded", which is different from zero.
    expect(headerSubtitle("teacher", {})).toBe("Here's your day");
  });

  it("gives every role a non-empty line", () => {
    for (const role of ["student", "parent", "teacher", "principal"] as const) {
      expect(headerSubtitle(role, {}).length).toBeGreaterThan(0);
    }
  });
});

describe("school identity", () => {
  it("skips filler words so initials identify the school", () => {
    expect(schoolInitials("Greenfield International School")).toBe("GI");
    expect(schoolInitials("Riverside Public School")).toBe("RP");
    expect(schoolInitials("Delhi Model Academy")).toBe("DM");
  });

  it("still produces initials when the name is only filler words", () => {
    expect(schoolInitials("The School")).toBe("TS");
  });

  it("handles a single-word name", () => {
    expect(schoolInitials("Sunrise")).toBe("S");
  });

  it("ignores punctuation", () => {
    expect(schoolInitials("St. Xavier's High School")).toBe("SX");
  });

  it("is deterministic — a school keeps its colour across sessions", () => {
    const first = crestFor("Greenfield International School");
    for (let i = 0; i < 5; i += 1) {
      expect(crestFor("Greenfield International School")).toEqual(first);
    }
    expect(CREST_PALETTE).toContainEqual(first);
  });

  it("distinguishes different schools", () => {
    // Not guaranteed for every pair with a 5-colour palette, but these two
    // are the seeded demo schools and they must not look identical.
    expect(crestFor("Greenfield International School")).not.toEqual(crestFor("Riverside Public School"));
  });
});
