import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GraduationCap, HeartHandshake, Presentation, ShieldCheck, Check } from "lucide-react";
import { ROLE_OPTIONS, writePendingRole } from "@/config/roles";
import { EdviaOrb } from "@/components/shared/EdviaOrb";
import { useOrbSize } from "@/hooks/useOrbSize";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Role } from "@/types";

// ==========================================================================
// Role selection
// --------------------------------------------------------------------------
// Four glass tiles, single choice, one primary action. Three things changed
// from the earlier version and all three were defects rather than taste:
//
//   - `.app-shell` reserved ~64px at the bottom for a nav bar this screen
//     does not have, so the Continue button floated above a dead band.
//   - `min-h-screen` (100vh) put that button under the mobile address bar.
//   - A decorative Search icon sat in the header doing nothing at all. A
//     control that cannot be pressed is worse than no control.
//
// Selection is shown with a check mark, not only a colour change: a coloured
// border alone fails WCAG 1.4.1, and fails anyone with a colour deficiency.
// ==========================================================================

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
  const orbSize = useOrbSize(0.2, 68, 92);

  function proceed() {
    if (!selected) return;
    writePendingRole(selected);
    navigate("/auth/sign-up");
  }

  return (
    <div className="screen">
      <div className="aurora" aria-hidden="true" />

      <div className="aurora-content screen-body py-6">
        <div className="screen-column screen-center">
          <div className="flex flex-col items-center text-center">
            <EdviaOrb size={orbSize} state="listening" label="EDVIA" />
            <h1 className="mt-4 font-display text-display font-bold">Who are you?</h1>
            <p className="mt-1.5 text-small text-muted-foreground">
              Choose your role so EDVIA shows you the right school
            </p>
          </div>

          {/* radiogroup, not a list of buttons: this is one choice among
              four, and arrow-key navigation is what a keyboard user expects. */}
          <div role="radiogroup" aria-label="Your role" className="mt-6 space-y-3">
            {ROLE_OPTIONS.map(({ role, title, description }) => {
              const Icon = ICONS[role];
              const isSelected = selected === role;
              return (
                <button
                  key={role}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  data-selected={isSelected}
                  onClick={() => setSelected(role)}
                  className="glass-tile flex w-full items-center gap-3 p-4 text-left"
                >
                  <div
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                      TINTS[role]
                    )}
                  >
                    <Icon size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{title}</p>
                    <p className="text-[12.5px] leading-snug text-muted-foreground">{description}</p>
                  </div>
                  {/* The slot is always present so selecting a tile never
                      reflows the row it is in. */}
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      isSelected
                        ? "border-edvia-500 bg-edvia-500 text-white"
                        : "border-border bg-white/40"
                    )}
                  >
                    {isSelected && <Check size={14} strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="screen-actions">
        <div className="screen-column">
          <Button size="lg" className="w-full" disabled={!selected} onClick={proceed}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
