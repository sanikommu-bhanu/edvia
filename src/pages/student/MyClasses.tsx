import { useEffect, useState } from "react";
import { TopBar } from "@/layouts/TopBar";
import { Tabs } from "@/components/ui/tabs";
import { SubjectIcon } from "@/components/shared/SubjectIcon";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/shared/EmptyState";
import { listClassSubjects } from "@/services/school/school.service";
import { BookOpen } from "lucide-react";
import type { ClassSubject } from "@/types";

export default function MyClasses() {
  const [tab, setTab] = useState("all");
  const [subjects, setSubjects] = useState<ClassSubject[]>([]);

  useEffect(() => {
    listClassSubjects("cls_10a").then(setSubjects);
  }, []);

  const visible = tab === "today" ? subjects : tab === "completed" ? [] : subjects;

  return (
    <div className="min-h-screen">
      <TopBar title="My Classes" />
      <div className="screen-pad !pt-0">
        <Tabs
          tabs={[{ value: "all", label: "All" }, { value: "today", label: "Today" }, { value: "completed", label: "Completed" }]}
          active={tab}
          onChange={setTab}
        />
      </div>
      <div className="screen-pad space-y-2.5 pb-8">
        {visible.length === 0 && <EmptyState icon={BookOpen} title="No classes here" body="Nothing scheduled for this filter yet." />}
        {visible.map((s) => (
          <div key={s.id} className="card p-3.5">
            <div className="flex items-center gap-3">
              <SubjectIcon subject={s.iconKey} />
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">{s.subject}</p>
                <p className="text-xs text-muted-foreground">{s.teacherName} · {s.room}</p>
              </div>
              <p className="text-xs font-medium text-muted-foreground">{s.schedule}</p>
            </div>
            {typeof s.progressPercent === "number" && (
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                  <span>Progress</span>
                  <span>{s.progressPercent}%</span>
                </div>
                <ProgressBar value={s.progressPercent} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
