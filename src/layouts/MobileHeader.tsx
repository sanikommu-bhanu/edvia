import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { useAuth } from "@/app/AuthContext";
import { useSchoolScope } from "@/app/SchoolContext";
import { SchoolCrest } from "@/components/shared/SchoolCrest";
import { cn } from "@/lib/utils";
import { timeGreeting, headerSubtitle, firstNameOf } from "@/lib/greeting";

// ==========================================================================
// MobileHeader — the first thing a user reads, every session
// --------------------------------------------------------------------------
// A greeting plus one line of genuinely useful context, both derived from
// the authenticated profile and the live school context. Nothing here is
// hardcoded: the name comes from users/{uid}.fullName, the child's name
// from the parent's active linked student, the class count from the
// teacher's real assignments.
//
// The subtitle is deliberately different per role because the roles want
// different things in the first two seconds:
//   student   — what today looks like
//   parent    — whose update this is
//   teacher   — how much work today holds
//   principal — that they are looking at the whole school
//
// Where the underlying record hasn't loaded yet, the subtitle falls back to
// a neutral line rather than rendering a half-sentence with a gap in it.
// ==========================================================================

export function MobileHeader({
  unread = 0,
  className,
}: {
  unread?: number;
  className?: string;
}) {
  const { user } = useAuth();
  const { school, student, classes } = useSchoolScope();
  const navigate = useNavigate();

  if (!user) return null;

  const firstName = firstNameOf(user.fullName);
  const subtitle = headerSubtitle(user.role, {
    childName: student?.fullName?.split(" ")[0],
    classCount: user.role === "teacher" ? classes.length : undefined,
    className: user.role === "student" ? student?.className : undefined,
  });

  return (
    <header className={cn("screen-pad safe-top pb-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <SchoolCrest name={school?.name} logoUrl={school?.logoUrl} size={42} />
          <div className="min-w-0">
            <h1 className="truncate font-display text-[17px] font-bold leading-tight">
              {timeGreeting()}, {firstName}
              {/* Waving hand carries the warmth the brief asks for; one
                  emoji, in one place, rather than scattered through the UI. */}
              <span aria-hidden> 👋</span>
            </h1>
            <p className="truncate text-[13px] leading-tight text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        <button
          onClick={() => navigate("/notifications")}
          className="tap relative -mr-2 shrink-0 rounded-full text-slate-600 hover:bg-muted"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        >
          <Bell size={21} />
          {unread > 0 && (
            <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-danger" />
          )}
        </button>
      </div>
    </header>
  );
}
