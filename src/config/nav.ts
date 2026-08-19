import type { Role } from "@/types";
import type { StringKey } from "@/i18n";
import { Home, BookOpen, Sparkles, CalendarDays, MoreHorizontal, Users, BarChart3, FileBarChart } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  /**
   * Translation key rather than literal text — the bottom nav is the most
   * visible chrome in the app, so it is the first thing that should be in
   * the user's own language. Resolved by useTranslation() at render.
   */
  labelKey: StringKey;
  path: string;
  icon: LucideIcon;
}

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  student: [
    { labelKey: "nav.home", path: "/student", icon: Home },
    { labelKey: "nav.classes", path: "/student/classes", icon: BookOpen },
    { labelKey: "nav.assistant", path: "/ai", icon: Sparkles },
    { labelKey: "nav.calendar", path: "/calendar", icon: CalendarDays },
    { labelKey: "nav.more", path: "/more", icon: MoreHorizontal },
  ],
  parent: [
    { labelKey: "nav.home", path: "/parent", icon: Home },
    { labelKey: "nav.progress", path: "/parent/progress", icon: BarChart3 },
    { labelKey: "nav.ai", path: "/ai", icon: Sparkles },
    { labelKey: "nav.notices", path: "/notices", icon: FileBarChart },
    { labelKey: "nav.more", path: "/more", icon: MoreHorizontal },
  ],
  teacher: [
    { labelKey: "nav.home", path: "/teacher", icon: Home },
    { labelKey: "nav.classes", path: "/teacher/classes", icon: BookOpen },
    { labelKey: "nav.students", path: "/teacher/students", icon: Users },
    { labelKey: "nav.ai", path: "/ai", icon: Sparkles },
    { labelKey: "nav.more", path: "/more", icon: MoreHorizontal },
  ],
  principal: [
    { labelKey: "nav.dashboard", path: "/principal", icon: Home },
    { labelKey: "nav.analytics", path: "/principal/analytics", icon: BarChart3 },
    { labelKey: "nav.reports", path: "/principal/reports", icon: FileBarChart },
    { labelKey: "nav.ai", path: "/ai", icon: Sparkles },
    { labelKey: "nav.more", path: "/more", icon: MoreHorizontal },
  ],
};
