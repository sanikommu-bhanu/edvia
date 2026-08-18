import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { EdviaRobot } from "@/components/shared/EdviaRobot";
import { Button } from "@/components/ui/button";

export default function Splash() {
  const navigate = useNavigate();
  return (
    <div className="app-shell flex min-h-screen flex-col items-center justify-between bg-gradient-to-b from-edvia-50 via-background to-background px-6 py-12 text-center">
      <div />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="flex flex-col items-center">
        <EdviaRobot size={140} />
        <h1 className="mt-6 font-display text-4xl font-extrabold tracking-tight text-edvia-700">EDVIA</h1>
        <p className="mt-1 text-sm font-medium text-muted-foreground">AI-Powered School Companion</p>
        <p className="mt-6 max-w-[280px] text-xl font-semibold text-slate-800">Smarter Schooling. Stronger Together.</p>
        <p className="mt-2 max-w-[280px] text-sm text-muted-foreground">
          Your intelligent assistant for students, parents, teachers &amp; school management.
        </p>
      </motion.div>
      <div className="w-full space-y-3">
        <Button size="lg" className="w-full" onClick={() => navigate("/onboarding/learn")}>
          Get Started
        </Button>
        <Button variant="ghost" size="lg" className="w-full" onClick={() => navigate("/role-selection")}>
          Explore as Guest
        </Button>
      </div>
    </div>
  );
}
