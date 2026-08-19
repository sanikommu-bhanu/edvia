import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar } from "@/layouts/TopBar";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState, LoadingState, ErrorState } from "@/components/shared/StateViews";
import { useAsyncData } from "@/hooks/useAsyncData";
import { listNotifications, markAllRead, markNotificationRead } from "@/services/notifications.service";
import { useAuth } from "@/app/AuthContext";
import { timeAgo } from "@/lib/utils";
import { ClipboardList, GraduationCap, CalendarCheck, Megaphone, Bell as BellIcon, Library, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppNotification, NotificationKind } from "@/types";

const ICONS: Record<NotificationKind, typeof ClipboardList> = {
  assignment: ClipboardList, exam: GraduationCap, attendance: CalendarCheck, notice: Megaphone, ptm: Users, resource: Library, teacher: Users,
};

export default function Notifications() {
  const { user } = useAuth();
  const [tab, setTab] = useState("all");
  const [items, setItems] = useState<AppNotification[]>([]);
  const navigate = useNavigate();

  const { data, loading, error, reload } = useAsyncData(
    () => (user ? listNotifications(user.uid) : Promise.resolve([])),
    [user?.uid],
    { enabled: Boolean(user?.uid) }
  );

  useEffect(() => {
    if (data) setItems(data);
  }, [data]);

  const visible = tab === "unread" ? items.filter((n) => !n.read) : items;

  async function open(n: AppNotification) {
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    try {
      await markNotificationRead(n.id);
    } catch {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: n.read } : x)));
    }
    if (n.linkTo) navigate(n.linkTo);
  }

  return (
    <div className="min-h-screen pb-8">
      <TopBar
        title="Notifications"
        right={
          <button
            onClick={async () => {
              if (!user?.uid) return;
              await markAllRead(user.uid);
              setItems((prev) => prev.map((n) => ({ ...n, read: true })));
            }}
            className="text-xs font-medium text-edvia-600"
          >
            Mark all read
          </button>
        }
      />
      <div className="screen-pad !pt-0">
        <Tabs tabs={[{ value: "all", label: "All" }, { value: "unread", label: "Unread" }]} active={tab} onChange={setTab} />
      </div>
      <div className="screen-pad space-y-2">
        {loading && <LoadingState rows={4} label="Loading notifications" />}
        {!loading && error && <ErrorState body={error} onRetry={reload} />}
        {!loading && !error && visible.length === 0 && (
          <EmptyState
            icon={BellIcon}
            title={tab === "unread" ? "Nothing unread" : "You're all caught up"}
            body="New notifications will appear here."
          />
        )}
        {!loading && !error && visible.map((n) => {
          const Icon = ICONS[n.kind];
          return (
            <button key={n.id} onClick={() => open(n)} className={cn("card flex w-full items-start gap-3 p-3.5 text-left", !n.read && "border-edvia-300")}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-edvia-100 text-edvia-700">
                <Icon size={16} />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.body}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{timeAgo(n.timestamp)}</p>
              </div>
              {!n.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-edvia-500" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
