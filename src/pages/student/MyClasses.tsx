import { useState } from "react";
import { TopBar } from "@/layouts/TopBar";
import { Tabs } from "@/components/ui/tabs";
import { SubjectIcon } from "@/components/shared/SubjectIcon";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState, LoadingState, ErrorState } from "@/components/shared/StateViews";
import { ClassPicker } from "@/components/shared/ClassPicker";
import { useSchoolScope } from "@/app/SchoolContext";
import { useAsyncData } from "@/hooks/useAsyncData";
import { listClassSubjects } from "@/services/school/school.service";
import { BookOpen } from "lucide-react";

/**
 * Serves both /student/classes and /teacher/classes. The class shown is
 * whichever one is in scope for the signed-in user: a student's own class,
 * or the class a teacher has selected from the ones they are assigned to.
 */
export default function MyClasses() {
  const [tab, setTab] = useState("all");
  const { activeClassId, loading: scopeLoading, reload } = useSchoolScope();

  const { data: subjects, loading, error } = useAsyncData(
    () => (activeClassId ? listClassSubjects(activeClassId) : Promise.resolve([])),
    [activeClassId],
    { enabled: Boolean(activeClassId) }
  );

  const all = subjects ?? [];
  // "Today" narrows to periods that actually carry a time slot. "Completed"
  // has no backing data yet, so it renders an honest empty state rather than
  // quietly showing the full list.
  const visible = tab === "today" ? all.filter((s) => Boolean(s.schedule)) : tab === "completed" ? [] : all;
  const busy = scopeLoading || loading;

  return (
    <div className="min-h-screen">
      <TopBar title="My Classes" />
      <ClassPicker />
      <div className="screen-pad !pt-0">
        <Tabs
          tabs={[{ value: "all", label: "All" }, { value: "today", label: "Today" }, { value: "completed", label: "Completed" }]}
          active={tab}
          onChange={setTab}
        />
      </div>
      <div className="screen-pad space-y-2.5 pb-8">
        {busy && <LoadingState rows={4} label="Loading classes" />}
        {!busy && error && <ErrorState body={error} onRetry={reload} />}
        {!busy && !error && visible.length === 0 && (
          <EmptyState
            icon={BookOpen}
            title={tab === "completed" ? "Nothing completed yet" : "No classes here"}
            body={
              tab === "completed"
                ? "Completed classes will appear here as the term progresses."
                : "Your school has not published a timetable for this class yet."
            }
          />
        )}
        {!busy && !error && visible.map((s) => (
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
