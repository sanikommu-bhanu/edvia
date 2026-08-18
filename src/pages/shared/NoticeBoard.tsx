import { useEffect, useState } from "react";
import { TopBar } from "@/layouts/TopBar";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { listNotices, markNoticeRead } from "@/services/notices.service";
import { useAuth } from "@/app/AuthContext";
import { formatDate } from "@/lib/utils";
import { Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Notice } from "@/types";

export default function NoticeBoard() {
  const { user } = useAuth();
  const [tab, setTab] = useState("all");
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    if (!user?.schoolId || !user?.uid) return;
    listNotices(user.schoolId, user.uid).then(setNotices);
  }, [user?.schoolId, user?.uid]);

  const visible = notices.filter((n) => tab === "all" || n.category === tab);

  async function open(n: Notice) {
    if (!user?.uid) return;
    await markNoticeRead(user.uid, n.id);
    setNotices((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
  }

  return (
    <div className="min-h-screen pb-8">
      <TopBar title="Notice Board" />
      <div className="screen-pad !pt-0">
        <Tabs
          tabs={[{ value: "all", label: "All" }, { value: "school", label: "School" }, { value: "class", label: "Class" }, { value: "important", label: "Important" }]}
          active={tab}
          onChange={setTab}
        />
      </div>
      <div className="screen-pad space-y-2.5">
        {visible.length === 0 && <EmptyState icon={Megaphone} title="No notices" body="Check back later for school announcements." />}
        {visible.map((n) => (
          <button key={n.id} onClick={() => open(n)} className={cn("card w-full p-4 text-left", !n.read && "border-edvia-300")}>
            <div className="mb-1 flex items-center justify-between">
              <Badge tone={n.category === "important" ? "danger" : "brand"}>{n.category}</Badge>
              {!n.read && <span className="h-2 w-2 rounded-full bg-edvia-500" />}
            </div>
            <p className="font-semibold text-slate-900">{n.title}</p>
            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{n.body}</p>
            <p className="mt-2 text-xs text-muted-foreground">{formatDate(n.date)}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
