// ==========================================================================
// Language detection
// ==========================================================================
// Detection runs BEFORE the model and never touches authorization. Both
// halves are asserted here: that all eleven required languages are
// recognised, and that recognising one changes nothing about what a caller
// may see.
// ==========================================================================
import { describe, it, expect } from "vitest";
import { detectLanguage, SUPPORTED_LANGUAGES, languageName, LANGUAGE_NAMES } from "../api/_lib/language";
import { buildSystemInstruction, buildVoiceSystemInstruction, capabilitiesFor } from "../api/_lib/persona";
import { LANGUAGES } from "../src/config/languages";
import type { LanguageCode, Role } from "../src/types";

const SAMPLES: Record<Exclude<LanguageCode, "en">, string> = {
  hi: "मेरे बच्चे की उपस्थिति कितनी है?",
  ta: "என் குழந்தையின் வருகை எவ்வளவு?",
  te: "నా పిల్లల హాజరు ఎంత?",
  mr: "माझ्या मुलाची उपस्थिती किती आहे?",
  bn: "আমার সন্তানের উপস্থিতি কত?",
  gu: "મારા બાળકની હાજરી કેટલી છે?",
  pa: "ਮੇਰੇ ਬੱਚੇ ਦੀ ਹਾਜ਼ਰੀ ਕਿੰਨੀ ਹੈ?",
  kn: "ನನ್ನ ಮಗುವಿನ ಹಾಜರಾತಿ ಎಷ್ಟು?",
  ml: "എന്റെ കുട്ടിയുടെ ഹാജർ എത്രയാണ്?",
  ur: "میرے بچے کی حاضری کتنی ہے؟",
};

describe("Every required language is supported", () => {
  const required: LanguageCode[] = ["en", "hi", "ta", "te", "mr", "bn", "gu", "pa", "kn", "ml", "ur"];

  it("declares all eleven", () => {
    expect(SUPPORTED_LANGUAGES.sort()).toEqual([...required].sort());
  });

  it("gives every code a display name", () => {
    for (const code of required) {
      expect(languageName(code)).toBeTruthy();
      expect(LANGUAGE_NAMES[code]).toBeTruthy();
    }
  });

  it("offers all eleven in the language picker, with native names", () => {
    expect(LANGUAGES.map((l) => l.code).sort()).toEqual([...required].sort());
    for (const option of LANGUAGES) {
      expect(option.nativeName.length).toBeGreaterThan(0);
      expect(option.englishName.length).toBeGreaterThan(0);
    }
  });
});

describe("Script detection", () => {
  // Marathi is excluded from this loop on purpose: it shares Devanagari with
  // Hindi, so script alone cannot separate them. The two Devanagari cases
  // below assert the documented tie-break instead.
  const distinctScripts = Object.entries(SAMPLES).filter(([code]) => code !== "mr");

  it.each(distinctScripts)("detects %s from its script", (code, sample) => {
    const detection = detectLanguage(sample, "en");
    expect(detection.language).toBe(code);
    expect(detection.basis).toBe("script");
    expect(detection.switchedFromProfile).toBe(true);
  });

  it("falls back to the profile language for Latin script", () => {
    // Romanised Hindi is Latin script; detection can't tell it apart, and the
    // model is instructed to follow the user's register instead.
    const detection = detectLanguage("Rahul ki attendance kitni hai?", "hi");
    expect(detection.language).toBe("hi");
    expect(detection.basis).toBe("profile");
  });

  it("keeps Marathi when the profile says Marathi", () => {
    // Hindi and Marathi share Devanagari, so the script alone cannot decide.
    const detection = detectLanguage(SAMPLES.mr, "mr");
    expect(detection.language).toBe("mr");
    expect(detection.switchedFromProfile).toBe(false);
  });

  it("defaults Devanagari to Hindi when the profile is neither", () => {
    expect(detectLanguage(SAMPLES.hi, "ta").language).toBe("hi");
  });

  it("defaults to English for an unrecognised profile language", () => {
    const detection = detectLanguage("hello", "xx" as LanguageCode);
    expect(detection.language).toBe("en");
    expect(detection.basis).toBe("default");
  });

  it("handles mixed script by the first script it finds", () => {
    const detection = detectLanguage("నా child attendance ఎంత?", "en");
    expect(detection.language).toBe("te");
  });
});

describe("Language never affects authorization", () => {
  it("is not part of the trusted context used for access decisions", () => {
    // A structural assertion: the detection result carries a language and a
    // basis, and nothing else. There is no field a tool could read as a
    // permission, which is what keeps "ask in Tamil to get more data" from
    // ever being a viable strategy.
    const detection = detectLanguage(SAMPLES.ta, "en");
    expect(Object.keys(detection).sort()).toEqual(["basis", "language", "switchedFromProfile"]);
  });
});

describe("Persona", () => {
  const roles: Role[] = ["student", "parent", "teacher", "principal"];

  it("produces a materially different instruction per role", () => {
    const instructions = roles.map((role) =>
      buildSystemInstruction({ role, language: "en", schoolName: "Test School", today: "2026-05-20" })
    );
    expect(new Set(instructions).size).toBe(roles.length);
    expect(instructions[0]).toContain("STUDENT");
    expect(instructions[3]).toContain("PRINCIPAL");
  });

  it("names the response language explicitly", () => {
    const tamil = buildSystemInstruction({
      role: "parent",
      language: "ta",
      schoolName: "Test School",
      today: "2026-05-20",
    });
    expect(tamil).toContain("Reply in Tamil");
  });

  it("states that tone never changes access", () => {
    for (const role of roles) {
      const instruction = buildSystemInstruction({ role, language: "en", schoolName: "S", today: "2026-05-20" });
      expect(instruction).toMatch(/never changes WHAT you may access/i);
      expect(instruction).toMatch(/must come from a tool call/i);
    }
  });

  it("carries the established subject so pronouns resolve", () => {
    const instruction = buildSystemInstruction({
      role: "parent",
      language: "en",
      schoolName: "S",
      today: "2026-05-20",
      subjectName: "Rahul Kumar",
    });
    expect(instruction).toContain("Rahul Kumar");
    expect(instruction).toMatch(/pronouns/i);
  });

  it("adds spoken-delivery rules for voice without dropping the safety rules", () => {
    const voice = buildVoiceSystemInstruction({
      role: "teacher",
      language: "en",
      schoolName: "S",
      today: "2026-05-20",
    });
    expect(voice).toContain("SPOKEN DELIVERY");
    expect(voice).toMatch(/must come from a tool call/i);
    expect(voice).toMatch(/no markdown/i);
  });

  it("lists capabilities appropriate to each role", () => {
    expect(capabilitiesFor("parent").join(" ")).toMatch(/child/i);
    expect(capabilitiesFor("principal").join(" ")).toMatch(/school-wide/i);
    expect(capabilitiesFor("teacher").join(" ")).toMatch(/marking/i);
    expect(capabilitiesFor("student").join(" ")).toMatch(/your attendance/i);
  });
});
