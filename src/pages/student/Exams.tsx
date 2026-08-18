import { useEffect, useState } from "react";
import { TopBar } from "@/layouts/TopBar";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { listExams } from "@/services/exams.service";
import { formatDate } from "@/lib/utils";
import { GraduationCap } from "lucide-react";
import type { Exam } from "@/types";

export default function ExamsPage() {
  const [tab, setTab] = useState("upcoming");
  const [exams, setExams] = useState<Exam[]>([]);

  useEffect(() => {
    listExams("cls_10a").then(setExams);
  }, []);

  const visible = exams.filter((e) => e.status === tab);

  return (
    <div className="min-h-screen">
      <TopBar title="Exams" />
      <div className="screen-pad !pt-0">
        <Tabs tabs={[{ value: "upcoming", label: "Upcoming" }, { value: "completed", label: "Completed" }]} active={tab} onChange={setTab} />
      </div>
      <div className="screen-pad space-y-2.5 pb-8">
        {visible.length === 0 && <EmptyState icon={GraduationCap} title="Nothing here" body="No exams in this category yet." />}
        {visible.map((e) => (
          <div key={e.id} className="card flex items-center justify-between p-4">
            <div>
              <p className="font-semibold text-slate-900">{e.title}</p>
              <p className="text-xs text-muted-foreground">{e.subject} · {formatDate(e.date)}</p>
            </div>
            {e.status === "upcoming" ? (
              <Badge tone={e.daysLeft && e.daysLeft <= 5 ? "danger" : "warning"}>{e.daysLeft} Days Left</Badge>
            ) : (
              <Badge tone="success">{e.score ? `${e.score.obtained}/${e.score.total}` : "Completed"}</Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
