import { useNavigate } from "react-router-dom";
import { StatCard } from "@/components/shared/StatCard";
import { SubjectIcon } from "@/components/shared/SubjectIcon";
import { MobileHeader } from "@/layouts/MobileHeader";
import { EdviaRobot } from "@/components/shared/EdviaRobot";
import { useSchoolScope } from "@/app/SchoolContext";
import { useAsyncData } from "@/hooks/useAsyncData";
import { LoadingState, ErrorState } from "@/components/shared/StateViews";
import { LinkAccountPrompt } from "@/components/shared/LinkAccountPrompt";
import { listClassSubjects } from "@/services/school/school.service";
import { listAssignments } from "@/services/assignments.service";
import { listExams } from "@/services/exams.service";
import { formatDate } from "@/lib/utils";

export default function StudentDashboard() {
  const navigate = useNavigate();
  // Class comes from the authenticated student's own record, so this screen
  // renders correctly for every account rather than one seeded id.
  const { activeClassId, needsLinking, loading: scopeLoading, error: scopeError, reload } = useSchoolScope();

  const { data, loading, error } = useAsyncData(
    async () => {
      if (!activeClassId) return { subjects: [], assignments: [], exams: [] };
      const [subjects, assignments, exams] = await Promise.all([
        listClassSubjects(activeClassId),
        listAssignments(activeClassId),
        listExams(activeClassId),
      ]);
      return { subjects, assignments, exams };
    },
    [activeClassId],
    { enabled: Boolean(activeClassId) }
  );

  const subjects = data?.subjects ?? [];
  const assignments = data?.assignments ?? [];
  const exams = data?.exams ?? [];
  const busy = scopeLoading || loading;

  const pendingAssignments = assignments.filter((a) => a.status === "pending").length;
  const upcomingTests = exams.filter((e) => e.status === "upcoming").length;
  const nextExam = [...exams].filter((e) => e.status === "upcoming").sort((a, b) => a.date.localeCompare(b.date))[0];
  const nextAssignment = assignments.find((a) => a.status === "pending");

  return (
    <div className="min-h-screen">
      <MobileHeader />

      {needsLinking && (
        <div className="screen-pad !pt-5">
          <LinkAccountPrompt />
        </div>
      )}

      {(scopeError || error) && (
        <div className="screen-pad !pt-5">
          <ErrorState body={scopeError ?? error ?? undefined} onRetry={reload} />
        </div>
      )}

      <div className="screen-pad !pt-5">
        <p className="mb-2 text-sm font-semibold text-slate-800">Today&apos;s Overview</p>
        <div className="flex gap-3">
          <StatCard value={subjects.length} label="Classes Today" tone="brand" />
          <StatCard value={pendingAssignments} label="Assignments" tone="warning" />
          <StatCard value={upcomingTests} label="Test Soon" tone="danger" />
        </div>
      </div>

      <div className="screen-pad !pt-6">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">Today&apos;s Schedule</p>
          <button onClick={() => navigate("/student/classes")} className="text-xs font-medium text-edvia-600">
            See all
          </button>
        </div>
        <div className="space-y-2.5">
          {busy && <LoadingState rows={3} label="Loading your timetable" />}
          {!busy && subjects.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No classes scheduled yet.</p>
          )}
          {!busy && subjects.slice(0, 3).map((s) => (
            <div key={s.id} className="card flex items-center gap-3 p-3">
              <SubjectIcon subject={s.iconKey} />
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">{s.subject}</p>
                <p className="text-xs text-muted-foreground">{s.teacherName}</p>
              </div>
              <p className="text-xs font-medium text-muted-foreground">{s.schedule}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="screen-pad !pt-6 pb-6">
        <p className="mb-2 text-sm font-semibold text-slate-800">Upcoming</p>
        <div className="space-y-2.5">
          {!busy && !nextAssignment && !nextExam && (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing due right now.</p>
          )}
          {nextAssignment && (
            <button onClick={() => navigate("/student/assignments")} className="card flex w-full items-center justify-between p-3.5 text-left">
              <div>
                <p className="text-sm font-semibold text-slate-900">{nextAssignment.title}</p>
                <p className="text-xs text-muted-foreground">Due {formatDate(nextAssignment.dueDate)}</p>
              </div>
              <span className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">Pending</span>
            </button>
          )}
          {nextExam && (
            <button onClick={() => navigate("/student/exams")} className="card flex w-full items-center justify-between p-3.5 text-left">
              <div>
                <p className="text-sm font-semibold text-slate-900">{nextExam.title}</p>
                <p className="text-xs text-muted-foreground">{formatDate(nextExam.date)}</p>
              </div>
              <span className="rounded-full bg-danger/10 px-2.5 py-1 text-xs font-medium text-danger">{daysUntil(nextExam.date)}</span>
            </button>
          )}
        </div>
      </div>

      <div className="screen-pad !pt-0 pb-8">
        <button
          onClick={() => navigate("/ai")}
          className="card flex w-full items-center gap-3 border-edvia-200 bg-edvia-50 p-4 text-left"
        >
          <EdviaRobot size={40} />
          <div className="flex-1">
            <p className="text-sm font-semibold text-edvia-800">Ask EDVIA</p>
            <p className="text-xs text-edvia-600">Homework help, explanations, and more</p>
          </div>
        </button>
      </div>
    </div>
  );
}

/** Exams store a date; "3 days left" is derived from today, never stored. */
function daysUntil(iso: string): string {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "Past";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days} days left`;
}
