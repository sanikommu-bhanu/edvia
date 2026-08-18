import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { NAV_BY_ROLE } from "@/config/nav";
import type { Role } from "@/types";

export function BottomNav({ role }: { role: Role }) {
  const items = NAV_BY_ROLE[role];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-[480px] items-center justify-between border-t border-border bg-surface/95 px-2 py-2 backdrop-blur md:hidden">
      {items.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === `/${role}`}
          className={({ isActive }) =>
            cn(
              "flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-medium transition-colors",
              isActive ? "text-edvia-600" : "text-muted-foreground"
            )
          }
        >
          {({ isActive }) => (
            <>
              <item.icon size={20} strokeWidth={isActive ? 2.4 : 2} />
              {item.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
