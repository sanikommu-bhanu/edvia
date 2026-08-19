import { useEffect, useState } from "react";
import { TopBar } from "@/layouts/TopBar";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState, LoadingState, ErrorState } from "@/components/shared/StateViews";
import { useAsyncData } from "@/hooks/useAsyncData";
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

  const { data, loading, error, reload } = useAsyncData(
    () => (user ? listResources(user.schoolId, user.uid) : Promise.resolve([])),
    [user?.schoolId, user?.uid],
    { enabled: Boolean(user?.schoolId && user?.uid) }
  );

  useEffect(() => {
    if (data) setResources(data);
  }, [data]);

  const visible = resources.filter((r) => tab === "all" || r.type === tab);

  async function bookmark(id: string) {
    if (!user?.uid) return;
    const current = resources.find((r) => r.id === id);
    const wasBookmarked = Boolean(current?.bookmarked);
    setResources((prev) => prev.map((r) => (r.id === id ? { ...r, bookmarked: !wasBookmarked } : r)));
    try {
      await toggleBookmark(user.uid, id, wasBookmarked);
    } catch {
      setResources((prev) => prev.map((r) => (r.id === id ? { ...r, bookmarked: wasBookmarked } : r)));
    }
  }

  return (
    <div className="min-h-screen pb-8">
      <TopBar title="Resources" />
      <div className="screen-pad !pt-0">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
      </div>
      <div className="screen-pad space-y-2.5">
        {loading && <LoadingState rows={4} label="Loading resources" />}
        {!loading && error && <ErrorState body={error} onRetry={reload} />}
        {!loading && !error && visible.length === 0 && (
          <EmptyState icon={Library} title="No resources" body="Study material will appear here once uploaded." />
        )}
        {!loading && !error && visible.map((r) => (
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
            {r.url ? (
              <a
                href={r.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${r.title}`}
                className="text-muted-foreground hover:text-edvia-600"
              >
                <Download size={16} />
              </a>
            ) : (
              <span className="text-[10px] text-muted-foreground" title="No file attached yet">
                No file
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
