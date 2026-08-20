import { useState } from "react";
import { TopBar } from "@/layouts/TopBar";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState, LoadingState, ErrorState } from "@/components/shared/StateViews";
import { ClassPicker } from "@/components/shared/ClassPicker";
import { useSchoolScope } from "@/app/SchoolContext";
import { useAsyncData } from "@/hooks/useAsyncData";
import { listExams } from "@/services/exams.service";
import { listStudentResults } from "@/services/grades.service";
import { formatDate } from "@/lib/utils";
import { GraduationCap } from "lucide-react";

export default function ExamsPage() {
  const [tab, setTab] = useState("upcoming");
  const { activeClassId, student, loading: scopeLoading, reload } = useSchoolScope();

  // Exams belong to the CLASS; the mark belongs to the STUDENT. Fetching them
  // separately and joining on examId is the whole reason `exams` no longer
  // carries a score field — one score on a shared exam document gave every
  // student in the class the same mark.
  const { data, loading, error } = useAsyncData(
    async () => {
      if (!activeClassId) return { exams: [], resultByExam: {} as Record<string, { score: number; maxScore: number; percentage: number }> };
      const [exams, results] = await Promise.all([
        listExams(activeClassId),
        student ? listStudentResults(student.id) : Promise.resolve([]),
      ]);
      return {
        exams,
        resultByExam: Object.fromEntries(
          results.map((r) => [r.examId, { score: r.score, maxScore: r.maxScore, percentage: r.percentage }])
        ),
      };
    },
    [activeClassId, student?.id],
    { enabled: Boolean(activeClassId) }
  );

  const visible = (data?.exams ?? []).filter((e) => e.status === tab);
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
            ) : data?.resultByExam[e.id] ? (
              <Badge tone="success">
                {data.resultByExam[e.id].score}/{data.resultByExam[e.id].maxScore}
              </Badge>
            ) : (
              // "Completed" and "not marked yet" are different statements.
              <Badge tone="neutral">Awaiting marks</Badge>
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
