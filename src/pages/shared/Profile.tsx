import { useNavigate } from "react-router-dom";
import { TopBar } from "@/layouts/TopBar";
import { Avatar } from "@/components/ui/avatar";
import { useAuth } from "@/app/AuthContext";
import { User, Settings, Globe2, Bell, Lock, HelpCircle, LogOut, ChevronRight, KeyRound } from "lucide-react";

const BASE_OPTIONS = [
  { icon: User, label: "Personal Information", path: "/profile" },
  { icon: Settings, label: "Account Settings", path: "/profile" },
  { icon: Globe2, label: "Language", path: "/language-selection" },
  { icon: Bell, label: "Notifications", path: "/notifications" },
  { icon: Lock, label: "Privacy", path: "/profile" },
  { icon: HelpCircle, label: "Help & Support", path: "/support" },
];

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Students/parents/teachers link their real record via a school invite
  // code (see src/pages/setup/InviteCode.tsx); surfaced here too since
  // that step is skippable during onboarding. Principals don't need one.
  const options =
    user?.role && user.role !== "principal"
      ? [...BASE_OPTIONS.slice(0, 2), { icon: KeyRound, label: "Link Account", path: "/invite-code" }, ...BASE_OPTIONS.slice(2)]
      : BASE_OPTIONS;

  return (
    <div className="min-h-screen pb-8">
      <TopBar title="Profile" />
      <div className="screen-pad !pt-0 flex flex-col items-center text-center">
        <Avatar name={user?.fullName ?? "User"} size={72} />
        <p className="mt-3 font-semibold text-slate-900">{user?.fullName}</p>
        <p className="text-xs capitalize text-muted-foreground">
          {user?.role} {user?.role === "student" ? "· Class 10 - A · Roll 23" : ""}
        </p>
      </div>

      <div className="screen-pad space-y-2">
        {options.map(({ icon: Icon, label, path }) => (
          <button key={label} onClick={() => navigate(path)} className="card flex w-full items-center gap-3 p-3.5 text-left">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-edvia-100 text-edvia-700">
              <Icon size={16} />
            </span>
            <span className="flex-1 text-sm font-medium text-slate-800">{label}</span>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
        ))}
        <button
          onClick={async () => {
            await logout();
            navigate("/auth/sign-in");
          }}
          className="card flex w-full items-center gap-3 p-3.5 text-left text-danger"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-danger/10">
            <LogOut size={16} />
          </span>
          <span className="text-sm font-medium">Log Out</span>
        </button>
      </div>
    </div>
  );
}
