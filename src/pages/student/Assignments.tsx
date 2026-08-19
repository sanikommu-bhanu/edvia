import { useState } from "react";
import { TopBar } from "@/layouts/TopBar";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState, LoadingState, ErrorState } from "@/components/shared/StateViews";
import { ClassPicker } from "@/components/shared/ClassPicker";
import { useSchoolScope } from "@/app/SchoolContext";
import { useAsyncData } from "@/hooks/useAsyncData";
import { listAssignments } from "@/services/assignments.service";
import { formatDate } from "@/lib/utils";
import { ClipboardList } from "lucide-react";
import type { AssignmentStatus } from "@/types";

const STATUS_TONE: Record<AssignmentStatus, "warning" | "success" | "danger" | "neutral"> = {
  pending: "warning",
  submitted: "success",
  overdue: "danger",
  completed: "neutral",
};

export default function AssignmentsPage() {
  const [tab, setTab] = useState("all");
  const { activeClassId, loading: scopeLoading, reload } = useSchoolScope();

  const { data, loading, error } = useAsyncData(
    () => (activeClassId ? listAssignments(activeClassId) : Promise.resolve([])),
    [activeClassId],
    { enabled: Boolean(activeClassId) }
  );

  const visible = (data ?? []).filter((a) => tab === "all" || a.status === tab);
  const busy = scopeLoading || loading;

  return (
    <div className="min-h-screen">
      <TopBar title="Assignments" />
      <ClassPicker />
      <div className="screen-pad !pt-0">
        <Tabs tabs={[{ value: "all", label: "All" }, { value: "pending", label: "Pending" }, { value: "submitted", label: "Submitted" }]} active={tab} onChange={setTab} />
      </div>
      <div className="screen-pad space-y-2.5 pb-8">
        {busy && <LoadingState rows={3} label="Loading assignments" />}
        {!busy && error && <ErrorState body={error} onRetry={reload} />}
        {!busy && !error && visible.length === 0 && (
          <EmptyState icon={ClipboardList} title="Nothing here" body="No assignments match this filter." />
        )}
        {!busy && !error && visible.map((a) => (
          <div key={a.id} className="card p-4">
            <div className="mb-1 flex items-start justify-between gap-2">
              <p className="text-xs font-medium text-edvia-600">{a.subject}</p>
              <Badge tone={STATUS_TONE[a.status]}>{a.status[0].toUpperCase() + a.status.slice(1)}</Badge>
            </div>
            <p className="font-semibold text-slate-900">{a.title}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{a.description}</p>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>Due {formatDate(a.dueDate)}</span>
              <span>{a.teacherName}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
