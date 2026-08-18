// ==========================================================================
// Language detection
// --------------------------------------------------------------------------
// EDVIA must answer in the language the user actually wrote in, which is
// not always the language on their profile — a parent whose app is set to
// English may still type "मेरे बेटे की हाजिरी कितनी है?".
//
// Detection is done by Unicode script range, deterministically, BEFORE the
// model runs. Three reasons it isn't left to the LLM:
//   1. It's free and instant; a script check needs no extra model round-trip.
//   2. It's reliable for exactly the languages the challenge requires, all
//      of which use distinct scripts except Hindi/Marathi (both Devanagari)
//      and English (Latin).
//   3. It keeps language OUT of the authorization path entirely — the
//      detected language is only ever used to pick a response language, and
//      is never consulted by any tool or authorization check.
//
// Devanagari is genuinely ambiguous between Hindi and Marathi, so we fall
// back to the user's profile language when that is one of the two, and to
// Hindi otherwise. Romanized Indian languages ("Rahul ki attendance kitni
// hai?") come through as Latin script; those are left to the model, which
// is explicitly instructed to follow the user's language.
// ==========================================================================
import type { LanguageCode } from "../../src/types";

export const SUPPORTED_LANGUAGES: LanguageCode[] = [
  "en", "hi", "ta", "te", "mr", "bn", "gu", "pa", "kn", "ml", "ur",
];

export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  en: "English",
  hi: "Hindi",
  ta: "Tamil",
  te: "Telugu",
  mr: "Marathi",
  bn: "Bengali",
  gu: "Gujarati",
  pa: "Punjabi",
  kn: "Kannada",
  ml: "Malayalam",
  ur: "Urdu",
};

/** Unicode block per script, in the order they're tested. */
const SCRIPT_RANGES: { code: LanguageCode; pattern: RegExp }[] = [
  { code: "ta", pattern: /[஀-௿]/ }, // Tamil
  { code: "te", pattern: /[ఀ-౿]/ }, // Telugu
  { code: "kn", pattern: /[ಀ-೿]/ }, // Kannada
  { code: "ml", pattern: /[ഀ-ൿ]/ }, // Malayalam
  { code: "bn", pattern: /[ঀ-৿]/ }, // Bengali
  { code: "gu", pattern: /[઀-૿]/ }, // Gujarati
  { code: "pa", pattern: /[਀-੿]/ }, // Gurmukhi (Punjabi)
  { code: "ur", pattern: /[؀-ۿݐ-ݿ]/ }, // Arabic script (Urdu)
  { code: "hi", pattern: /[ऀ-ॿ]/ }, // Devanagari (Hindi or Marathi)
];

export interface LanguageDetection {
  /** Language to respond in. */
  language: LanguageCode;
  /** How the decision was reached — surfaced in logs, never to the user. */
  basis: "script" | "profile" | "default";
  /** True when the message's script differs from the profile language. */
  switchedFromProfile: boolean;
}

/**
 * @param text            the user's raw message
 * @param profileLanguage the language on the authenticated user's profile
 */
export function detectLanguage(text: string, profileLanguage: LanguageCode): LanguageDetection {
  for (const { code, pattern } of SCRIPT_RANGES) {
    if (!pattern.test(text)) continue;

    // Devanagari covers both Hindi and Marathi — prefer the profile setting
    // when it is one of them rather than guessing from the script alone.
    const language: LanguageCode =
      code === "hi" && profileLanguage === "mr" ? "mr" : code;
    return {
      language,
      basis: "script",
      switchedFromProfile: language !== profileLanguage,
    };
  }

  if (SUPPORTED_LANGUAGES.includes(profileLanguage)) {
    return { language: profileLanguage, basis: "profile", switchedFromProfile: false };
  }
  return { language: "en", basis: "default", switchedFromProfile: false };
}

export function languageName(code: LanguageCode): string {
  return LANGUAGE_NAMES[code] ?? "English";
}
