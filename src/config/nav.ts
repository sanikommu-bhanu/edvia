import type { Role } from "@/types";
import { Home, BookOpen, Sparkles, CalendarDays, MoreHorizontal, Users, BarChart3, FileBarChart } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  student: [
    { label: "Home", path: "/student", icon: Home },
    { label: "Classes", path: "/student/classes", icon: BookOpen },
    { label: "AI Assistant", path: "/ai", icon: Sparkles },
    { label: "Calendar", path: "/calendar", icon: CalendarDays },
    { label: "More", path: "/more", icon: MoreHorizontal },
  ],
  parent: [
    { label: "Home", path: "/parent", icon: Home },
    { label: "Progress", path: "/parent/progress", icon: BarChart3 },
    { label: "AI", path: "/ai", icon: Sparkles },
    { label: "Notices", path: "/notices", icon: FileBarChart },
    { label: "More", path: "/more", icon: MoreHorizontal },
  ],
  teacher: [
    { label: "Home", path: "/teacher", icon: Home },
    { label: "Classes", path: "/teacher/classes", icon: BookOpen },
    { label: "Students", path: "/teacher/students", icon: Users },
    { label: "AI", path: "/ai", icon: Sparkles },
    { label: "More", path: "/more", icon: MoreHorizontal },
  ],
  principal: [
    { label: "Dashboard", path: "/principal", icon: Home },
    { label: "Analytics", path: "/principal/analytics", icon: BarChart3 },
    { label: "Reports", path: "/principal/reports", icon: FileBarChart },
    { label: "AI", path: "/ai", icon: Sparkles },
    { label: "More", path: "/more", icon: MoreHorizontal },
  ],
};
