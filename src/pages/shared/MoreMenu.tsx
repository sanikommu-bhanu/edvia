import { useNavigate } from "react-router-dom";
import { TopBar } from "@/layouts/TopBar";
import { useAuth } from "@/app/AuthContext";
import { useSchoolScope } from "@/app/SchoolContext";
import { Megaphone, Library, Bell, User, LifeBuoy, ScanLine, CalendarDays, ChevronRight, Settings, HelpCircle, GraduationCap, Inbox, ClipboardCheck } from "lucide-react";
import type { Role } from "@/types";
import type { LucideIcon } from "lucide-react";

interface MoreItem {
  icon: LucideIcon;
  label: string;
  path: string;
  /** Omitted means "every role". */
  roles?: Role[];
}

/**
 * Everything the five-slot bottom bar can't hold.
 *
 * Role-specific entries are listed here rather than in a second component so
 * a screen added to a role's navigation has exactly one place to appear —
 * the bar if it earns a thumb slot, this list otherwise.
 */
const ROLE_ITEMS: MoreItem[] = [
  { icon: GraduationCap, label: "Grades", path: "/student/grades", roles: ["student"] },
  { icon: ClipboardCheck, label: "Assignments", path: "/student/assignments", roles: ["student"] },
  { icon: GraduationCap, label: "Grades", path: "/parent/grades", roles: ["parent"] },
  { icon: ClipboardCheck, label: "Assignments", path: "/parent/assignments", roles: ["parent"] },
  { icon: GraduationCap, label: "Enter Marks", path: "/teacher/marks", roles: ["teacher"] },
  { icon: Inbox, label: "Support Inbox", path: "/teacher/support", roles: ["teacher"] },
  { icon: Inbox, label: "Support Inbox", path: "/principal/support", roles: ["principal"] },
];

const ITEMS: MoreItem[] = [
  { icon: CalendarDays, label: "Calendar", path: "/calendar" },
  { icon: Megaphone, label: "Notice Board", path: "/notices" },
  { icon: Library, label: "Resources", path: "/resources" },
  { icon: Bell, label: "Notifications", path: "/notifications" },
  { icon: ScanLine, label: "Scan Document", path: "/scan" },
  { icon: LifeBuoy, label: "Support", path: "/support" },
  { icon: HelpCircle, label: "Help", path: "/help" },
  { icon: Settings, label: "Settings", path: "/settings" },
  { icon: User, label: "Profile", path: "/profile" },
];

export default function MoreMenu() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeClassId, activeClass } = useSchoolScope();

  return (
    <div className="min-h-screen pb-8">
      <TopBar title="More" />
      <div className="screen-pad !pt-0 space-y-2">
        {[...ROLE_ITEMS.filter((i) => !i.roles || (user && i.roles.includes(user.role))), ...ITEMS].map(({ icon: Icon, label, path }) => (
          <button key={label} onClick={() => navigate(path)} className="card flex w-full items-center gap-3 p-3.5 text-left">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-edvia-100 text-edvia-700">
              <Icon size={16} />
            </span>
            <span className="flex-1 text-sm font-medium text-slate-800">{label}</span>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
        ))}
      </div>
      {user?.role === "teacher" && activeClassId && (
        <div className="screen-pad">
          <button
            onClick={() => navigate(`/teacher/attendance/${activeClassId}`)}
            className="card w-full p-3.5 text-left text-sm font-medium text-edvia-700"
          >
            Mark Attendance{activeClass ? ` — ${activeClass.className}` : ""}
          </button>
        </div>
      )}
    </div>
  );
}
