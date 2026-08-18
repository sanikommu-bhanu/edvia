import { Calculator, Atom, FlaskConical, BookText, Dna, Landmark, Laptop2, Palette } from "lucide-react";
import type { SubjectIconKey } from "@/types";
import { cn } from "@/lib/utils";

const ICONS: Record<SubjectIconKey, typeof Calculator> = {
  math: Calculator,
  physics: Atom,
  chemistry: FlaskConical,
  english: BookText,
  biology: Dna,
  history: Landmark,
  computer: Laptop2,
  art: Palette,
};

const TINTS: Record<SubjectIconKey, string> = {
  math: "bg-edvia-100 text-edvia-700",
  physics: "bg-info/10 text-info",
  chemistry: "bg-success/10 text-success",
  english: "bg-danger/10 text-danger",
  biology: "bg-success/10 text-success",
  history: "bg-warning/10 text-warning",
  computer: "bg-edvia-100 text-edvia-700",
  art: "bg-danger/10 text-danger",
};

export function SubjectIcon({ subject, size = 20, className }: { subject: SubjectIconKey; size?: number; className?: string }) {
  const Icon = ICONS[subject] ?? Calculator;
  return (
    <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", TINTS[subject], className)}>
      <Icon size={size} />
    </span>
  );
}
