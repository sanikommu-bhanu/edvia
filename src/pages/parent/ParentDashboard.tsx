import { useNavigate } from "react-router-dom";
import { Avatar } from "@/components/ui/avatar";
import { StatCard } from "@/components/shared/StatCard";
import { NotificationBell } from "@/layouts/TopBar";
import { EdviaRobot } from "@/components/shared/EdviaRobot";
import { LoadingState, ErrorState } from "@/components/shared/StateViews";
import { LinkAccountPrompt } from "@/components/shared/LinkAccountPrompt";
import { useAuth } from "@/app/AuthContext";
import { useSchoolScope } from "@/app/SchoolContext";
import { useAsyncData } from "@/hooks/useAsyncData";
import { getAttendanceSummary } from "@/services/attendance/attendance.service";
import { listAssignments } from "@/services/assignments.service";
import { listNotices } from "@/services/notices.service";
import { formatDate } from "@/lib/utils";

/**
 * The parent's home screen, scoped to the child currently in focus.
 *
 * Everything here is read for the real linked child resolved by
 * SchoolContext. The previous version hardcoded one student and displayed a
 * literal "A" as the average grade — a number the system has no source for.
 * Grades aren't modelled yet, so that tile is gone rather than invented; the
 * two tiles that remain are both backed by real records.
 */
export default function ParentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    student,
    children,
    selectChild,
    activeClassId,
    needsLinking,
    loading: scopeLoading,
    error: scopeError,
    reload,
  } = useSchoolScope();

  const { data, loading, error } = useAsyncData(
    async () => {
      if (!student) return null;
      const [summary, assignments, notices] = await Promise.all([
        getAttendanceSummary(student.id),
        activeClassId ? listAssignments(activeClassId) : Promise.resolve([]),
        user ? listNotices(user.schoolId, user.uid) : Promise.resolve([]),
      ]);
      return { summary, assignments, notices };
    },
    [student?.id, activeClassId, user?.uid],
    { enabled: Boolean(student) }
  );

  const summary = data?.summary ?? null;
  const assignments = data?.assignments ?? [];
  const notices = data?.notices ?? [];
  const busy = scopeLoading || loading;
  const firstName = student?.fullName.split(" ")[0] ?? "your child";

  function switchChild() {
    if (children.length < 2 || !student) return;
    const index = children.findIndex((c) => c.id === student.id);
    selectChild(children[(index + 1) % children.length].id);
  }

  return (
    <div className="min-h-screen">
      <div className="screen-pad flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Hi, {user?.fullName?.split(" ")[0] ?? "Parent"} 👋</p>
          <h1 className="font-display text-lg font-bold">Parent Dashboard</h1>
        </div>
        <NotificationBell />
      </div>

      {needsLinking && (
        <div className="screen-pad !pt-4">
          <LinkAccountPrompt />
        </div>
      )}

      {(scopeError || error) && (
        <div className="screen-pad !pt-4">
          <ErrorState body={scopeError ?? error ?? undefined} onRetry={reload} />
        </div>
      )}

      {student && (
        <>
          <div className="screen-pad !pt-4">
            <button
              onClick={switchChild}
              disabled={children.length < 2}
              className="card flex w-full items-center gap-3 p-3.5 text-left disabled:cursor-default"
            >
              <Avatar name={student.fullName} size={40} />
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">{student.fullName}</p>
                <p className="text-xs text-muted-foreground">
                  {student.className} · Roll {student.rollNumber}
                </p>
              </div>
              {children.length > 1 && <span className="text-xs font-medium text-edvia-600">Switch child ›</span>}
            </button>
          </div>

          <div className="screen-pad !pt-5">
            <p className="mb-2 text-sm font-semibold text-slate-800">{firstName}&apos;s Overview</p>
            {busy ? (
              <LoadingState rows={1} label="Loading overview" />
            ) : (
              <div className="flex gap-3">
                <StatCard
                  value={summary && summary.presentDays + summary.absentDays + summary.leaveDays > 0 ? `${summary.percentage}%` : "—"}
                  label="Attendance"
                  tone="brand"
                />
                <StatCard value={summary?.absentDays ?? 0} label="Days Absent" tone="danger" />
                <StatCard
                  value={assignments.filter((a) => a.status === "pending").length}
                  label="Assignments Due"
                  tone="warning"
                />
              </div>
            )}
          </div>

          <div className="screen-pad !pt-6">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">Recent Updates</p>
              <button onClick={() => navigate("/notices")} className="text-xs font-medium text-edvia-600">
                See all
              </button>
            </div>
            <div className="space-y-2.5">
              {busy && <LoadingState rows={2} label="Loading updates" />}
              {!busy && assignments.length === 0 && notices.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No updates from school right now.</p>
              )}
              {!busy &&
                assignments.slice(0, 1).map((a) => (
                  <div key={a.id} className="card flex items-center justify-between p-3.5">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">New: {a.title}</p>
                      <p className="text-xs text-muted-foreground">{a.subject}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">Due {formatDate(a.dueDate)}</span>
                  </div>
                ))}
              {!busy &&
                notices.slice(0, 2).map((n) => (
                  <div key={n.id} className="card p-3.5">
                    <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(n.date)}</p>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}

      <div className="screen-pad !pt-6 pb-8">
        <button
          onClick={() => navigate("/ai")}
          className="card flex w-full items-center gap-3 border-edvia-200 bg-edvia-50 p-4 text-left"
        >
          <EdviaRobot size={40} state="idle" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-edvia-800">
              {student ? `Ask EDVIA about ${firstName}` : "Ask EDVIA"}
            </p>
            <p className="text-xs text-edvia-600">Attendance, assignments, or reach their teacher</p>
          </div>
        </button>
      </div>
    </div>
  );
}
