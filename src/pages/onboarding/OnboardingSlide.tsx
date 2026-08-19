import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { EdviaOrb } from "@/components/shared/EdviaOrb";
import { useOrbSize } from "@/hooks/useOrbSize";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { AIAgentState } from "@/types";

// ==========================================================================
// Onboarding slides
// --------------------------------------------------------------------------
// Two screens between the splash and role selection, each making one claim
// and backing it with four specifics. The orb is on both, in a different
// state each time — the same object, paying attention to a different thing.
//
// The previous version of this screen used `min-h-screen` (100vh) with no
// safe-area handling, which on a phone put the primary button underneath the
// browser's address bar until the user scrolled, and underneath the home
// indicator on an iPhone. `.screen` fixes both: 100svh plus every inset.
// ==========================================================================

interface SlideProps {
  step: 1 | 2;
  headline: string;
  /** Short second line under the headline. */
  lede: string;
  points: string[];
  orbState: AIAgentState;
  nextLabel: string;
  nextPath: string;
}

const TOTAL_STEPS = 2;

function Slide({ step, headline, lede, points, orbState, nextLabel, nextPath }: SlideProps) {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const orbSize = useOrbSize(0.32, 108, 152);

  const rise = (delay: number) =>
    reducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <div className="screen">
      <div className="aurora" aria-hidden="true" />

      {/* Skip gets a full 44px target rather than the ~20px a bare text
          button would have — it is the most-tapped control on this screen. */}
      <div className="aurora-content flex justify-end px-2 pt-1">
        <button
          onClick={() => navigate("/role-selection")}
          className="tap px-3 text-small font-medium text-muted-foreground"
        >
          Skip
        </button>
      </div>

      <div className="aurora-content screen-body items-center py-4 text-center">
        <div className="screen-column screen-center flex flex-col items-center">
          <motion.div {...rise(0)}>
            <EdviaOrb size={orbSize} state={orbState} label="EDVIA" />
          </motion.div>

          <motion.h2
            {...rise(0.06)}
            className="mt-6 font-display text-display font-bold text-slate-900"
          >
            {headline}
          </motion.h2>

          <motion.p {...rise(0.1)} className="mt-2 text-small text-muted-foreground">
            {lede}
          </motion.p>

          <motion.ul {...rise(0.16)} className="glass-panel mt-6 w-full space-y-3 px-5 py-5 text-left">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-small text-slate-700">
                <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-edvia-500" />
                <span className="leading-relaxed">{p}</span>
              </li>
            ))}
          </motion.ul>
        </div>
      </div>

      <div className="screen-actions">
        <div className="screen-column">
          {/* The dots are decoration; the same information is on the button
              and in the aria-label, so they are hidden from assistive tech
              rather than announced as two empty list items. */}
          <div
            className="mb-5 flex justify-center gap-1.5"
            role="img"
            aria-label={`Step ${step} of ${TOTAL_STEPS}`}
          >
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <span
                key={i}
                className={
                  i + 1 === step
                    ? "h-1.5 w-6 rounded-full bg-edvia-500 transition-all"
                    : "h-1.5 w-1.5 rounded-full bg-edvia-200 transition-all"
                }
              />
            ))}
          </div>
          <Button size="lg" className="w-full" onClick={() => navigate(nextPath)}>
            {nextLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function OnboardingLearn() {
  return (
    <Slide
      step={1}
      headline="Learn Smarter with AI"
      lede="An assistant that knows your syllabus, not just the internet."
      points={[
        "Personalized academic help",
        "Clear explanations, on demand",
        "Study assistance that fits your pace",
        "Ongoing progress support",
      ]}
      orbState="thinking"
      nextLabel="Next"
      nextPath="/onboarding/connect"
    />
  );
}

export function OnboardingConnect() {
  return (
    <Slide
      step={2}
      headline="Stay Connected Always"
      lede="Everyone around a student, looking at the same information."
      points={[
        "Real-time school updates",
        "Attendance at a glance",
        "Direct communication with teachers",
        "Important announcements, instantly",
      ]}
      orbState="speaking"
      nextLabel="Get Started"
      nextPath="/role-selection"
    />
  );
}
