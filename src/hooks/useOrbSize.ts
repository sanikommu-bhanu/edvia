import { useEffect, useState } from "react";

// ==========================================================================
// useOrbSize
// --------------------------------------------------------------------------
// Lives outside EdviaOrb.tsx so that file exports a component and nothing
// else — mixing a hook in breaks React Fast Refresh for the whole module,
// which in practice means the orb full-reloads the page on every edit.
// ==========================================================================

/**
 * A diameter that tracks the viewport, clamped at both ends.
 *
 * The orb needs a real pixel number — its shadow radii, blur radii and
 * highlight offsets are all derived from it, and CSS alone cannot express
 * "scale those together". So the clamp that would normally be a CSS clamp()
 * is done here instead, and re-run on resize so rotating a phone or dragging
 * a desktop window actually re-proportions the orb rather than leaving it at
 * whatever size it happened to mount at.
 */
export function useOrbSize(vwFraction: number, min: number, max: number): number {
  const measure = () =>
    typeof window === "undefined"
      ? min
      : Math.round(Math.min(max, Math.max(min, window.innerWidth * vwFraction)));

  const [size, setSize] = useState(measure);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setSize(measure());
    onResize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vwFraction, min, max]);

  return size;
}
