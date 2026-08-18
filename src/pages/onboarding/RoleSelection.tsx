import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GraduationCap, HeartHandshake, Presentation, ShieldCheck, ChevronRight, Search } from "lucide-react";
import { ROLE_OPTIONS } from "@/config/roles";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Role } from "@/types";

const ICONS: Record<Role, typeof GraduationCap> = {
  student: GraduationCap,
  parent: HeartHandshake,
  teacher: Presentation,
  principal: ShieldCheck,
};

const TINTS: Record<Role, string> = {
  student: "bg-edvia-100 text-edvia-700",
  parent: "bg-success/10 text-success",
  teacher: "bg-danger/10 text-danger",
  principal: "bg-info/10 text-info",
};

export default function RoleSelection() {
  const [selected, setSelected] = useState<Role | null>(null);
  const navigate = useNavigate();

  function proceed() {
    if (!selected) return;
    sessionStorage.setItem("edvia.pendingRole", selected);
    navigate("/auth/sign-up");
  }

  return (
    <div className="app-shell min-h-screen px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Who are you?</h1>
          <p className="mt-1 text-sm text-muted-foreground">Choose your role to continue</p>
        </div>
        <Search size={18} className="text-muted-foreground" />
      </div>

      <div className="space-y-3">
        {ROLE_OPTIONS.map(({ role, title, description }) => {
          const Icon = ICONS[role];
          const isSelected = selected === role;
          return (
            <button
              key={role}
              onClick={() => setSelected(role)}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl border bg-surface p-4 text-left shadow-soft transition-all",
                isSelected ? "border-edvia-400 ring-2 ring-edvia-100" : "border-border"
              )}
            >
              <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", TINTS[role])}>
                <Icon size={22} />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-900">{title}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <ChevronRight size={18} className={cn("text-muted-foreground", isSelected && "text-edvia-500")} />
            </button>
          );
        })}
      </div>

      <Button size="lg" className="mt-8 w-full" disabled={!selected} onClick={proceed}>
        Continue
      </Button>
    </div>
  );
}
