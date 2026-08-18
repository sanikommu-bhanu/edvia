import { ChevronLeft, Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

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
    <div className={cn("flex items-center justify-between screen-pad !pt-4 pb-3", className)}>
      <div className="flex items-center gap-2">
        {showBack && (
          <button onClick={() => navigate(-1)} className="rounded-full p-1.5 hover:bg-muted" aria-label="Go back">
            <ChevronLeft size={20} />
          </button>
        )}
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
      {right}
    </div>
  );
}

export function NotificationBell({ unread = 0 }: { unread?: number }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate("/notifications")} className="relative rounded-full p-2 hover:bg-muted" aria-label="Notifications">
      <Bell size={20} />
      {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger" />}
    </button>
  );
}
