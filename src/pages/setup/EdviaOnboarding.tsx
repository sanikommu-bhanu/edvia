import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { MessageCircleQuestion, BookOpenCheck, CalendarCheck2, Bell } from "lucide-react";
import { EdviaRobot } from "@/components/shared/EdviaRobot";
import { Button } from "@/components/ui/button";

const CAPABILITIES = [
  { icon: MessageCircleQuestion, label: "Answer questions & explain topics" },
  { icon: BookOpenCheck, label: "Summarize notes & documents" },
  { icon: CalendarCheck2, label: "Track your progress" },
  { icon: Bell, label: "Get reminders & notifications" },
];

export default function EdviaOnboarding() {
  const navigate = useNavigate();
  return (
    <div className="setup-shell flex flex-col items-center justify-between px-6 py-10 text-center">
      <div />
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}>
        <EdviaRobot size={128} state="idle" />
        <h1 className="mt-6 font-display text-2xl font-bold">Hi! I&apos;m EDVIA 👋</h1>
        <p className="mt-1 text-sm font-medium text-edvia-600">Your AI Assistant</p>
        <p className="mt-3 max-w-[280px] text-sm text-muted-foreground">I can help you with:</p>
        <ul className="mt-4 space-y-3 text-left">
          {CAPABILITIES.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3 text-sm text-slate-700">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-edvia-100 text-edvia-700">
                <Icon size={16} />
              </span>
              {label}
            </li>
          ))}
        </ul>
      </motion.div>
      <Button size="lg" className="w-full" onClick={() => navigate("/permissions")}>
        Let&apos;s Begin
      </Button>
    </div>
  );
}
