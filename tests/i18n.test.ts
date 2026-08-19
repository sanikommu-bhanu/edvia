// ==========================================================================
// UI translation coverage
// --------------------------------------------------------------------------
// The challenge lists eleven languages. A dropdown that changes nothing is
// exactly the "don't award points for language names in a dropdown" failure,
// so these tests assert the dictionary is real: every language present,
// every key resolving to something in the right script, and no accidental
// English left in a translated locale.
// ==========================================================================
import { describe, it, expect } from "vitest";
import { STRINGS, ENGLISH_STRINGS, translate, isRtl } from "../src/i18n/strings";
import { LANGUAGES } from "../src/config/languages";
import type { LanguageCode } from "../src/types";

const CODES = LANGUAGES.map((l) => l.code);
const KEYS = Object.keys(ENGLISH_STRINGS) as (keyof typeof ENGLISH_STRINGS)[];

/** Unicode block per script, used to prove a locale isn't silently English. */
const SCRIPT: Partial<Record<LanguageCode, RegExp>> = {
  hi: /[\u0900-\u097F]/,
  mr: /[\u0900-\u097F]/,
  ta: /[\u0B80-\u0BFF]/,
  te: /[\u0C00-\u0C7F]/,
  bn: /[\u0980-\u09FF]/,
  gu: /[\u0A80-\u0AFF]/,
  pa: /[\u0A00-\u0A7F]/,
  kn: /[\u0C80-\u0CFF]/,
  ml: /[\u0D00-\u0D7F]/,
  ur: /[\u0600-\u06FF]/,
};

describe("dictionary completeness", () => {
  it("covers all eleven challenge languages", () => {
    expect(CODES).toHaveLength(11);
    for (const code of CODES) {
      expect(STRINGS[code], `no dictionary for ${code}`).toBeDefined();
    }
  });

  it("resolves every key in every language to a non-empty string", () => {
    for (const code of CODES) {
      for (const key of KEYS) {
        const value = translate(code, key);
        expect(value, `${code}.${key}`).toBeTruthy();
        expect(typeof value).toBe("string");
      }
    }
  });

  it("never emits a raw key as a value", () => {
    for (const code of CODES) {
      for (const key of KEYS) {
        expect(translate(code, key)).not.toBe(key);
      }
    }
  });
});

describe("translations are genuine, not English copies", () => {
  it("writes navigation labels in each language's own script", () => {
    // "AI" is a borrowed initialism and stays Latin in every locale, so it
    // is excluded rather than forced into a script it isn't written in.
    const navKeys = KEYS.filter((k) => k.startsWith("nav.") && k !== "nav.ai");
    for (const code of CODES) {
      if (code === "en") continue;
      const pattern = SCRIPT[code]!;
      const untranslated = navKeys.filter((k) => !pattern.test(translate(code, k)));
      expect(untranslated, `${code} nav labels not in native script`).toEqual([]);
    }
  });

  it("translates the AI status labels a user watches during a turn", () => {
    const watched = ["ai.thinking", "ai.listening", "ai.speaking", "ai.checkingRecords"] as const;
    for (const code of CODES) {
      if (code === "en") continue;
      for (const key of watched) {
        expect(translate(code, key), `${code}.${key}`).not.toBe(ENGLISH_STRINGS[key]);
      }
    }
  });

  it("translates attendance vocabulary — the app's most-read words", () => {
    const domain = ["domain.attendance", "domain.present", "domain.absent"] as const;
    for (const code of CODES) {
      if (code === "en") continue;
      for (const key of domain) {
        expect(translate(code, key), `${code}.${key}`).not.toBe(ENGLISH_STRINGS[key]);
      }
    }
  });
});

describe("fallback behaviour", () => {
  it("falls back per key, not per language", () => {
    // A locale missing one key keeps its other translations.
    const partial = STRINGS.hi;
    expect(partial["nav.home"]).toBeDefined();
    // Force a lookup for a key the locale may not define.
    const value = translate("hi", "ai.title");
    expect(value).toBe(ENGLISH_STRINGS["ai.title"]);
    expect(translate("hi", "nav.home")).not.toBe(ENGLISH_STRINGS["nav.home"]);
  });
});

describe("script direction", () => {
  it("marks Urdu right-to-left and nothing else", () => {
    expect(isRtl("ur")).toBe(true);
    for (const code of CODES.filter((c) => c !== "ur")) {
      expect(isRtl(code), code).toBe(false);
    }
  });
});
