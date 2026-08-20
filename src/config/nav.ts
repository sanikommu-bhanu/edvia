import type { Role } from "@/types";
import type { StringKey } from "@/i18n";
import {
  Home,
  BookOpen,
  Sparkles,
  Users,
  BarChart3,
  FileBarChart,
  CalendarCheck2,
  Megaphone,
  User,
  ClipboardCheck,
  GraduationCap,
  Inbox,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ==========================================================================
// Role navigation
// --------------------------------------------------------------------------
// Exactly five destinations per role, with the AI assistant in the CENTRE
// slot. Five is the practical ceiling for a thumb-reachable bottom bar, and
// the centre position is the easiest target on a phone — which is where the
// product's centrepiece belongs.
//
// `primary: true` marks the AI entry so BottomNav can render it as an
// elevated pill rather than a flat icon. It is data here rather than a
// hardcoded index so a role could put it elsewhere without touching the
// component.
// ==========================================================================

export interface NavItem {
  /**
   * Translation key rather than literal text — the bottom nav is the most
   * visible chrome in the app, so it is the first thing that should be in
   * the user's own language. Resolved by useTranslation() at render.
   */
  labelKey: StringKey;
  path: string;
  icon: LucideIcon;
  /** Rendered as the elevated centre action. Exactly one per role. */
  primary?: boolean;
}

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  student: [
    { labelKey: "nav.home", path: "/student", icon: Home },
    { labelKey: "domain.attendance", path: "/student/attendance", icon: CalendarCheck2 },
    { labelKey: "nav.ai", path: "/ai", icon: Sparkles, primary: true },
    // Grades replaces Notices in the thumb bar: a student checks their marks
    // far more often than the notice board, and Notices is one tap away in
    // More. Five slots means every addition is a swap, not an append.
    { labelKey: "nav.grades", path: "/student/grades", icon: GraduationCap },
    { labelKey: "settings.profile", path: "/profile", icon: User },
  ],
  parent: [
    { labelKey: "nav.home", path: "/parent", icon: Home },
    { labelKey: "domain.attendance", path: "/parent/progress", icon: CalendarCheck2 },
    { labelKey: "nav.ai", path: "/ai", icon: Sparkles, primary: true },
    { labelKey: "nav.grades", path: "/parent/grades", icon: GraduationCap },
    { labelKey: "settings.profile", path: "/profile", icon: User },
  ],
  teacher: [
    { labelKey: "nav.home", path: "/teacher", icon: Home },
    { labelKey: "nav.marks", path: "/teacher/marks", icon: GraduationCap },
    { labelKey: "nav.ai", path: "/ai", icon: Sparkles, primary: true },
    { labelKey: "nav.support", path: "/teacher/support", icon: Inbox },
    { labelKey: "settings.profile", path: "/profile", icon: User },
  ],
  principal: [
    { labelKey: "nav.home", path: "/principal", icon: Home },
    { labelKey: "nav.analytics", path: "/principal/analytics", icon: BarChart3 },
    { labelKey: "nav.ai", path: "/ai", icon: Sparkles, primary: true },
    { labelKey: "nav.support", path: "/principal/support", icon: Inbox },
    { labelKey: "settings.profile", path: "/profile", icon: User },
  ],
};

/**
 * Desktop sidebar. Wider than five items because there is room for it —
 * the bottom bar's constraint is the thumb, not the information.
 */
export const SIDEBAR_BY_ROLE: Record<Role, NavItem[]> = {
  student: [
    { labelKey: "nav.home", path: "/student", icon: Home },
    { labelKey: "nav.classes", path: "/student/classes", icon: BookOpen },
    { labelKey: "domain.attendance", path: "/student/attendance", icon: CalendarCheck2 },
    { labelKey: "domain.assignments", path: "/student/assignments", icon: ClipboardCheck },
    { labelKey: "domain.exams", path: "/student/exams", icon: FileBarChart },
    { labelKey: "nav.grades", path: "/student/grades", icon: GraduationCap },
    { labelKey: "nav.calendar", path: "/calendar", icon: CalendarCheck2 },
    { labelKey: "nav.notices", path: "/notices", icon: Megaphone },
    { labelKey: "nav.assistant", path: "/ai", icon: Sparkles, primary: true },
    { labelKey: "settings.profile", path: "/profile", icon: User },
  ],
  parent: [
    { labelKey: "nav.home", path: "/parent", icon: Home },
    { labelKey: "domain.attendance", path: "/parent/progress", icon: CalendarCheck2 },
    { labelKey: "domain.assignments", path: "/parent/assignments", icon: ClipboardCheck },
    { labelKey: "nav.grades", path: "/parent/grades", icon: GraduationCap },
    { labelKey: "nav.calendar", path: "/calendar", icon: CalendarCheck2 },
    { labelKey: "nav.notices", path: "/notices", icon: Megaphone },
    { labelKey: "nav.assistant", path: "/ai", icon: Sparkles, primary: true },
    { labelKey: "settings.profile", path: "/profile", icon: User },
  ],
  teacher: [
    { labelKey: "nav.home", path: "/teacher", icon: Home },
    { labelKey: "nav.classes", path: "/teacher/classes", icon: BookOpen },
    { labelKey: "nav.students", path: "/teacher/students", icon: Users },
    { labelKey: "nav.marks", path: "/teacher/marks", icon: GraduationCap },
    { labelKey: "nav.support", path: "/teacher/support", icon: Inbox },
    { labelKey: "nav.calendar", path: "/calendar", icon: CalendarCheck2 },
    { labelKey: "nav.notices", path: "/notices", icon: Megaphone },
    { labelKey: "nav.assistant", path: "/ai", icon: Sparkles, primary: true },
    { labelKey: "settings.profile", path: "/profile", icon: User },
  ],
  principal: [
    { labelKey: "nav.dashboard", path: "/principal", icon: Home },
    { labelKey: "nav.analytics", path: "/principal/analytics", icon: BarChart3 },
    { labelKey: "nav.reports", path: "/principal/reports", icon: FileBarChart },
    { labelKey: "nav.support", path: "/principal/support", icon: Inbox },
    { labelKey: "nav.notices", path: "/notices", icon: Megaphone },
    { labelKey: "nav.calendar", path: "/calendar", icon: CalendarCheck2 },
    { labelKey: "nav.assistant", path: "/ai", icon: Sparkles, primary: true },
    { labelKey: "settings.profile", path: "/profile", icon: User },
  ],
};
