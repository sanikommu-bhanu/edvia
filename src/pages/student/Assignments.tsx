import { useEffect, useState } from "react";
import { TopBar } from "@/layouts/TopBar";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { listAssignments } from "@/services/assignments.service";
import { formatDate } from "@/lib/utils";
import { ClipboardList } from "lucide-react";
import type { Assignment, AssignmentStatus } from "@/types";

const STATUS_TONE: Record<AssignmentStatus, "warning" | "success" | "danger" | "neutral"> = {
  pending: "warning",
  submitted: "success",
  overdue: "danger",
  completed: "neutral",
};

export default function AssignmentsPage() {
  const [tab, setTab] = useState("all");
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  useEffect(() => {
    listAssignments("cls_10a").then(setAssignments);
  }, []);

  const visible = assignments.filter((a) => tab === "all" || a.status === tab);

  return (
    <div className="min-h-screen">
      <TopBar title="Assignments" />
      <div className="screen-pad !pt-0">
        <Tabs tabs={[{ value: "all", label: "All" }, { value: "pending", label: "Pending" }, { value: "submitted", label: "Submitted" }]} active={tab} onChange={setTab} />
      </div>
      <div className="screen-pad space-y-2.5 pb-8">
        {visible.length === 0 && <EmptyState icon={ClipboardList} title="Nothing here" body="No assignments match this filter." />}
        {visible.map((a) => (
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
