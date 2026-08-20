import { ChevronLeft, Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

// ==========================================================================
// TopBar
// --------------------------------------------------------------------------
// Both controls here are 44 x 44 minimum (WCAG 2.5.5), which is larger than
// the icon needs. That is deliberate: back and notifications appear on
// almost every screen in the app, so an undersized target here is a defect
// repeated dozens of times rather than once. The negative margin keeps the
// enlarged hit area from pushing the title off its optical alignment.
// ==========================================================================

export function TopBar({
  title,
  showBack = false,
  right,
  className,
}: {
  title: string;
  showBack?: boolean;
  right?: React.ReactNode;
  className?: string;
}) {
  const navigate = useNavigate();
  return (
    <div className={cn("flex items-center justify-between gap-2 screen-pad !pt-4 pb-3", className)}>
      <div className="flex min-w-0 items-center gap-1.5">
        {showBack && (
          <button
            onClick={() => navigate(-1)}
            className="-ml-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-muted"
            aria-label="Go back"
          >
            <ChevronLeft size={20} />
          </button>
        )}
        <h1 className="truncate text-lg font-semibold">{title}</h1>
      </div>
      {right}
    </div>
  );
}

export function NotificationBell({ unread = 0 }: { unread?: number }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate("/notifications")}
      className="relative -mr-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-muted"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
    >
      <Bell size={20} />
      {unread > 0 && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-danger" />}
    </button>
  );
}
