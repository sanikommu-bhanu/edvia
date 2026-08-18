import { useEffect, useState } from "react";
import { TopBar } from "@/layouts/TopBar";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/EmptyState";
import { listResources, toggleBookmark } from "@/services/resources.service";
import { useAuth } from "@/app/AuthContext";
import { formatDate } from "@/lib/utils";
import { FileText, Bookmark, Download, Library } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SchoolResource, ResourceType } from "@/types";

const TABS: { value: ResourceType | "all"; label: string }[] = [
  { value: "all", label: "All" }, { value: "notes", label: "Notes" }, { value: "book", label: "Books" }, { value: "paper", label: "Papers" }, { value: "video", label: "Videos" },
];

export default function Resources() {
  const { user } = useAuth();
  const [tab, setTab] = useState<string>("all");
  const [resources, setResources] = useState<SchoolResource[]>([]);

  useEffect(() => {
    if (!user?.schoolId || !user?.uid) return;
    listResources(user.schoolId, user.uid).then(setResources);
  }, [user?.schoolId, user?.uid]);

  const visible = resources.filter((r) => tab === "all" || r.type === tab);

  async function bookmark(id: string) {
    if (!user?.uid) return;
    const current = resources.find((r) => r.id === id);
    await toggleBookmark(user.uid, id, !!current?.bookmarked);
    setResources((prev) => prev.map((r) => (r.id === id ? { ...r, bookmarked: !r.bookmarked } : r)));
  }

  return (
    <div className="min-h-screen pb-8">
      <TopBar title="Resources" />
      <div className="screen-pad !pt-0">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
      </div>
      <div className="screen-pad space-y-2.5">
        {visible.length === 0 && <EmptyState icon={Library} title="No resources" body="Study material will appear here once uploaded." />}
        {visible.map((r) => (
          <div key={r.id} className="card flex items-center gap-3 p-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-edvia-100 text-edvia-700">
              <FileText size={18} />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">{r.title}</p>
              <p className="text-xs text-muted-foreground">
                {r.subject} · {formatDate(r.uploadedAt)} {r.fileSizeKb ? `· ${(r.fileSizeKb / 1024).toFixed(1)} MB` : ""}
              </p>
            </div>
            <button onClick={() => bookmark(r.id)} aria-label="Bookmark" className={cn("text-muted-foreground", r.bookmarked && "text-edvia-600")}>
              <Bookmark size={16} fill={r.bookmarked ? "currentColor" : "none"} />
            </button>
            <button aria-label="Open" className="text-muted-foreground">
              <Download size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
