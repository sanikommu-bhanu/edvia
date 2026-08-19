import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { EdviaOrb } from "@/components/shared/EdviaOrb";
import { useOrbSize } from "@/hooks/useOrbSize";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/hooks/useReducedMotion";

// ==========================================================================
// Splash — the first screen, and the first impression
// --------------------------------------------------------------------------
// The orb leads, because EDVIA's identity is a presence rather than a
// wordmark. Everything else is deliberately sparse: one promise, one line of
// explanation, one primary action.
//
// There is NO artificial delay here. The animation is a short entrance on
// content that is already rendered — the screen is interactive from the
// first frame, and a user who taps immediately is not made to wait for a
// timer. A splash that blocks on setTimeout is a loading screen pretending
// to be a brand moment.
//
// LAYOUT
// `.screen` (globals.css) owns the safe-area insets and uses 100svh, so the
// bottom buttons are never parked under the mobile address bar. The middle
// section is allowed to scroll rather than compress, so a 360x640 phone at
// large text size degrades into a scrollable screen instead of a clipped
// one, and the actions stay pinned in the thumb zone either way.
// ==========================================================================

export default function Splash() {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  // 42% of the viewport, floored at 132px so it still reads as the hero on a
  // 320px phone and capped at 196px so it doesn't dominate a desktop window.
  const orbSize = useOrbSize(0.42, 132, 196);

  // Entrance only — each element settles once and stops. The orb's own
  // ambient motion continues afterwards; that is the character, not a loop.
  const rise = (delay: number) =>
    reducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <div className="screen">
      <div className="aurora" aria-hidden="true" />

      <div className="aurora-content screen-body items-center py-8 text-center">
        <div className="screen-column screen-center flex flex-col items-center">
          <motion.div {...rise(0)}>
            <EdviaOrb size={orbSize} state="idle" label="EDVIA" />
          </motion.div>

          <motion.h1
            {...rise(0.08)}
            className="mt-6 font-display text-hero font-extrabold tracking-tight text-edvia-700"
          >
            EDVIA
          </motion.h1>

          <motion.p {...rise(0.14)} className="mt-1 text-small font-medium text-muted-foreground">
            AI-Powered School Companion
          </motion.p>

          <motion.div
            {...rise(0.2)}
            className="glass-panel mt-7 w-full px-5 py-5"
          >
            <p className="font-display text-title font-bold text-slate-800">
              Smarter schooling.
              <br />
              Stronger together.
            </p>
            <p className="mt-2.5 text-small leading-relaxed text-muted-foreground">
              One assistant for students, parents, teachers and school management — that actually
              knows your school.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Actions sit in the thumb zone, clear of the home indicator. */}
      <motion.div {...rise(0.3)} className="screen-actions">
        <div className="screen-column space-y-2.5">
          <Button size="lg" className="w-full" onClick={() => navigate("/onboarding/learn")}>
            Get started
          </Button>
          {/* Was "Explore as Guest", which promised a guest mode that does not
              exist — it simply went to role selection. Returning users are the
              real second audience for this screen. */}
          <Button
            variant="ghost"
            size="lg"
            className="w-full"
            onClick={() => navigate("/auth/sign-in")}
          >
            I already have an account
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
