import { useState } from "react";
import { TopBar } from "@/layouts/TopBar";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState, LoadingState, ErrorState } from "@/components/shared/StateViews";
import { ClassPicker } from "@/components/shared/ClassPicker";
import { useSchoolScope } from "@/app/SchoolContext";
import { useAsyncData } from "@/hooks/useAsyncData";
import { listExams } from "@/services/exams.service";
import { formatDate } from "@/lib/utils";
import { GraduationCap } from "lucide-react";

export default function ExamsPage() {
  const [tab, setTab] = useState("upcoming");
  const { activeClassId, loading: scopeLoading, reload } = useSchoolScope();

  const { data, loading, error } = useAsyncData(
    () => (activeClassId ? listExams(activeClassId) : Promise.resolve([])),
    [activeClassId],
    { enabled: Boolean(activeClassId) }
  );

  const visible = (data ?? []).filter((e) => e.status === tab);
  const busy = scopeLoading || loading;

  return (
    <div className="min-h-screen">
      <TopBar title="Exams" />
      <ClassPicker />
      <div className="screen-pad !pt-0">
        <Tabs tabs={[{ value: "upcoming", label: "Upcoming" }, { value: "completed", label: "Completed" }]} active={tab} onChange={setTab} />
      </div>
      <div className="screen-pad space-y-2.5 pb-8">
        {busy && <LoadingState rows={3} label="Loading exams" />}
        {!busy && error && <ErrorState body={error} onRetry={reload} />}
        {!busy && !error && visible.length === 0 && (
          <EmptyState icon={GraduationCap} title="Nothing here" body="No exams in this category yet." />
        )}
        {!busy && !error && visible.map((e) => (
          <div key={e.id} className="card flex items-center justify-between p-4">
            <div>
              <p className="font-semibold text-slate-900">{e.title}</p>
              <p className="text-xs text-muted-foreground">{e.subject} · {formatDate(e.date)}</p>
            </div>
            {e.status === "upcoming" ? (
              <Badge tone={daysUntil(e.date) <= 5 ? "danger" : "warning"}>{describeDaysUntil(e.date)}</Badge>
            ) : (
              <Badge tone="success">{e.score ? `${e.score.obtained}/${e.score.total}` : "Completed"}</Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

/**
 * Derived from today rather than read from a stored `daysLeft` field, which
 * would silently go stale the day after it was seeded.
 */
function describeDaysUntil(iso: string): string {
  const days = daysUntil(iso);
  if (days < 0) return "Past";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return days + " days left";
}
