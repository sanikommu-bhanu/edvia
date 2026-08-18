import { useNavigate } from "react-router-dom";
import { TopBar } from "@/layouts/TopBar";
import { useAuth } from "@/app/AuthContext";
import { Megaphone, Library, Bell, User, LifeBuoy, ScanLine, CalendarDays, ChevronRight } from "lucide-react";

const ITEMS = [
  { icon: CalendarDays, label: "Calendar", path: "/calendar" },
  { icon: Megaphone, label: "Notice Board", path: "/notices" },
  { icon: Library, label: "Resources", path: "/resources" },
  { icon: Bell, label: "Notifications", path: "/notifications" },
  { icon: ScanLine, label: "Scan Document", path: "/scan" },
  { icon: LifeBuoy, label: "Support", path: "/support" },
  { icon: User, label: "Profile", path: "/profile" },
];

export default function MoreMenu() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="min-h-screen pb-8">
      <TopBar title="More" />
      <div className="screen-pad !pt-0 space-y-2">
        {ITEMS.map(({ icon: Icon, label, path }) => (
          <button key={label} onClick={() => navigate(path)} className="card flex w-full items-center gap-3 p-3.5 text-left">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-edvia-100 text-edvia-700">
              <Icon size={16} />
            </span>
            <span className="flex-1 text-sm font-medium text-slate-800">{label}</span>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
        ))}
      </div>
      {user?.role === "teacher" && (
        <div className="screen-pad">
          <button onClick={() => navigate("/teacher/attendance/cls_10a")} className="card w-full p-3.5 text-left text-sm font-medium text-edvia-700">
            Mark Attendance
          </button>
        </div>
      )}
    </div>
  );
}
