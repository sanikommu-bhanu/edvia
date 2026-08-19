import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { SIDEBAR_BY_ROLE } from "@/config/nav";
import { useTranslation } from "@/i18n";
import { useSchoolScope } from "@/app/SchoolContext";
import { SchoolCrest } from "@/components/shared/SchoolCrest";
import type { Role } from "@/types";

// ==========================================================================
// Desktop sidebar
// --------------------------------------------------------------------------
// Shown from `lg` up, where BottomNav hides. Mobile is the primary target,
// but a school office runs on a laptop, so the desktop layout gets the
// wider destination list from SIDEBAR_BY_ROLE rather than the thumb-limited
// five.
//
// The school crest sits at the top: on desktop there is room to keep the
// school's own identity permanently on screen, which is a large part of
// making this feel like "my school's app" rather than a generic dashboard.
// ==========================================================================

export function Sidebar({ role }: { role: Role }) {
  const items = SIDEBAR_BY_ROLE[role];
  const { t } = useTranslation();
  const { school } = useSchoolScope();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-border bg-surface/80 px-4 py-6 backdrop-blur-xl lg:flex">
      <div className="flex items-center gap-3 px-2 pb-6">
        <SchoolCrest name={school?.name} size={40} />
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-bold leading-tight">
            {school?.name ?? "EDVIA"}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">{school?.location ?? "School assistant"}</p>
        </div>
      </div>

      <nav aria-label="Main" className="flex flex-1 flex-col gap-1">
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === `/${role}`}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-edvia-100 text-edvia-700"
                  : "text-muted-foreground hover:bg-muted hover:text-slate-800",
                // The assistant keeps its emphasis on desktop too.
                item.primary && !isActive && "text-edvia-600"
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon size={19} strokeWidth={isActive ? 2.4 : 2} />
                {t(item.labelKey)}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
