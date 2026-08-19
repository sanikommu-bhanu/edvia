import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { NAV_BY_ROLE } from "@/config/nav";
import { useTranslation } from "@/i18n";
import type { Role } from "@/types";

// ==========================================================================
// Bottom navigation — the primary way EDVIA is navigated on a phone
// --------------------------------------------------------------------------
// Three details do most of the work here:
//
//   1. SAFE AREA. The bar is fixed, so on a notched iPhone it would sit
//      under the home indicator. `padding-bottom: var(--safe-bottom)` adds
//      the inset back, and .app-shell reserves `--nav-total` so the last
//      card is never hidden behind it.
//
//   2. TOUCH TARGETS. Each item is min-h-[44px] wide enough for a thumb,
//      per WCAG 2.5.5 — a five-item bar on a 360 px screen is right at the
//      limit, so the targets fill the available width rather than hugging
//      the icon.
//
//   3. THE AI BUTTON. Elevated into a gradient pill because the assistant
//      is the product, and the centre slot is the easiest thumb reach. It
//      is raised by 10px and given a soft glow — enough to read as the
//      primary action, not so much that it looks like a game button.
// ==========================================================================

export function BottomNav({ role }: { role: Role }) {
  const items = NAV_BY_ROLE[role];
  const { t } = useTranslation();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[520px] lg:hidden"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      {/* Fade so content scrolling under the bar dissolves rather than
          colliding with its top edge. */}
      <div className="pointer-events-none h-5 bg-gradient-to-t from-background to-transparent" />

      <div className="flex items-stretch justify-around border-t border-border/70 bg-surface/92 px-1.5 backdrop-blur-xl">
        {items.map((item) =>
          item.primary ? (
            <NavLink
              key={item.path}
              to={item.path}
              aria-label={t(item.labelKey)}
              className="tap group -mt-5 flex flex-1 flex-col items-center justify-start gap-1 pb-2"
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "flex h-[52px] w-[52px] items-center justify-center rounded-2xl",
                      "bg-gradient-to-br from-edvia-500 to-edvia-700 text-white",
                      "shadow-floating transition-transform duration-300 group-active:scale-95",
                      isActive && "ring-4 ring-edvia-200/70"
                    )}
                  >
                    <item.icon size={23} strokeWidth={2.2} />
                  </span>
                  <span
                    className={cn(
                      "text-[10.5px] font-semibold leading-none",
                      isActive ? "text-edvia-700" : "text-muted-foreground"
                    )}
                  >
                    {t(item.labelKey)}
                  </span>
                </>
              )}
            </NavLink>
          ) : (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === `/${role}`}
              className="tap flex flex-1 flex-col items-center justify-center gap-1 py-2"
            >
              {({ isActive }) => (
                <>
                  {/* The dot is the active affordance rather than a filled
                      pill: quieter, and it survives long labels. */}
                  <span className="relative flex flex-col items-center">
                    <item.icon
                      size={21}
                      strokeWidth={isActive ? 2.5 : 2}
                      className={cn(
                        "transition-colors duration-200",
                        isActive ? "text-edvia-600" : "text-muted-foreground"
                      )}
                    />
                    <span
                      className={cn(
                        "absolute -bottom-1.5 h-1 w-1 rounded-full bg-edvia-600 transition-opacity duration-200",
                        isActive ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </span>
                  <span
                    className={cn(
                      "mt-1 max-w-full truncate text-[10.5px] font-medium leading-none transition-colors",
                      isActive ? "text-edvia-700" : "text-muted-foreground"
                    )}
                  >
                    {t(item.labelKey)}
                  </span>
                </>
              )}
            </NavLink>
          )
        )}
      </div>
    </nav>
  );
}
