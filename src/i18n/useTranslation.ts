// ==========================================================================
// useTranslation — UI language, driven by the authenticated profile
// --------------------------------------------------------------------------
// The language comes from users/{uid}.language, the SAME field the server
// reads when deciding what language EDVIA replies in
// (api/_lib/language.ts). One source, so the interface and the assistant
// can never disagree about which language the user chose.
//
// Language is presentation only. It is never consulted by any authorization
// check — asserted by eval case LANG-07, which switches language mid-attack
// and still gets refused.
// ==========================================================================
import { useCallback, useEffect, useMemo } from "react";
import { useAuth } from "@/app/AuthContext";
import { translate, isRtl, type StringKey } from "./strings";
import type { LanguageCode } from "@/types";

export interface Translation {
  /** Current UI language. Falls back to English for signed-out screens. */
  language: LanguageCode;
  /** Resolve a key. Missing translations fall back to English per key. */
  t: (key: StringKey) => string;
  /** True when the script runs right-to-left (Urdu). */
  rtl: boolean;
}

export function useTranslation(): Translation {
  const { user } = useAuth();
  const language: LanguageCode = user?.language ?? "en";

  const t = useCallback((key: StringKey) => translate(language, key), [language]);

  // Set lang/dir on <html> so the browser hyphenates, spell-checks and
  // mirrors layout correctly, and so screen readers announce in the right
  // language. Doing this here keeps it in step with the profile without a
  // separate effect in every screen.
  useEffect(() => {
    const root = document.documentElement;
    root.lang = language;
    root.dir = isRtl(language) ? "rtl" : "ltr";
  }, [language]);

  return useMemo(() => ({ language, t, rtl: isRtl(language) }), [language, t]);
}
