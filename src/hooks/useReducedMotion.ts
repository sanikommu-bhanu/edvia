// ==========================================================================
// useReducedMotion
// --------------------------------------------------------------------------
// globals.css already neutralises CSS animations under
// `prefers-reduced-motion: reduce`. That is not enough for the EDVIA robot:
// its beacon, eye and core animations are SVG SMIL <animate> elements, and
// SMIL is NOT governed by CSS `animation-duration` — those elements keep
// running at full speed no matter what the stylesheet says.
//
// So the preference has to be read in JS and the animating elements simply
// not rendered. The avatar still changes appearance per state (colour,
// expression, halo opacity); it just stops moving, which is exactly what
// the preference asks for.
// ==========================================================================
import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(QUERY).matches
      : false
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(QUERY);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    // Respond to the OS setting changing mid-session, not just at mount.
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
