import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { EdviaRobot } from "@/components/shared/EdviaRobot";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

interface SlideProps {
  step: 1 | 2;
  headline: string;
  points: string[];
  nextLabel: string;
  nextPath: string;
}

function Slide({ step, headline, points, nextLabel, nextPath }: SlideProps) {
  const navigate = useNavigate();
  return (
    <div className="app-shell flex min-h-screen flex-col justify-between px-6 py-8">
      <div className="flex justify-end">
        <button onClick={() => navigate("/role-selection")} className="text-sm font-medium text-muted-foreground">
          Skip
        </button>
      </div>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="flex flex-1 flex-col items-center justify-center text-center">
        <EdviaRobot size={128} />
        <h2 className="mt-8 font-display text-2xl font-bold text-slate-900">{headline}</h2>
        <ul className="mt-4 space-y-2 text-left">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2 text-sm text-muted-foreground">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-edvia-500" />
              {p}
            </li>
          ))}
        </ul>
      </motion.div>
      <div>
        <div className="mb-6 flex justify-center gap-1.5">
          <span className={`h-1.5 rounded-full ${step === 1 ? "w-6 bg-edvia-500" : "w-1.5 bg-edvia-200"}`} />
          <span className={`h-1.5 rounded-full ${step === 2 ? "w-6 bg-edvia-500" : "w-1.5 bg-edvia-200"}`} />
        </div>
        <Button size="lg" className="w-full" onClick={() => navigate(nextPath)}>
          {nextLabel}
        </Button>
      </div>
    </div>
  );
}

export function OnboardingLearn() {
  return (
    <Slide
      step={1}
      headline="Learn Smarter with AI"
      points={["Personalized academic help", "Clear explanations, on demand", "Study assistance that fits your pace", "Ongoing progress support"]}
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
      points={["Real-time school updates", "Attendance at a glance", "Direct communication with teachers", "Important announcements, instantly"]}
      nextLabel="Get Started"
      nextPath="/role-selection"
    />
  );
}
