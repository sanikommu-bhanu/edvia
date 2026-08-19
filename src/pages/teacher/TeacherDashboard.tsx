import { useNavigate } from "react-router-dom";
import { Avatar } from "@/components/ui/avatar";
import { StatCard } from "@/components/shared/StatCard";
import { NotificationBell } from "@/layouts/TopBar";
import { EdviaRobot } from "@/components/shared/EdviaRobot";
import { LoadingState, ErrorState } from "@/components/shared/StateViews";
import { LinkAccountPrompt } from "@/components/shared/LinkAccountPrompt";
import { ClipboardCheck, ClipboardList, Megaphone, Library } from "lucide-react";
import { useAuth } from "@/app/AuthContext";
import { useSchoolScope } from "@/app/SchoolContext";
import { useAsyncData } from "@/hooks/useAsyncData";
import { listClassSubjects, listClassStudents } from "@/services/school/school.service";

/**
 * The teacher's home screen, driven by the classes actually assigned to them
 * rather than a hardcoded class id. A teacher with three classes sees three;
 * a teacher with one sees one; a teacher whose invite code hasn't been
 * redeemed is told what to do about it.
 */
export default function TeacherDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    classes,
    activeClass,
    activeClassId,
    needsLinking,
    loading: scopeLoading,
    error: scopeError,
    reload,
  } = useSchoolScope();

  const { data, loading, error } = useAsyncData(
    async () => {
      if (!activeClassId) return { subjects: [], students: [] };
      const [subjects, students] = await Promise.all([
        listClassSubjects(activeClassId),
        listClassStudents(activeClassId),
      ]);
      return { subjects, students };
    },
    [activeClassId],
    { enabled: Boolean(activeClassId) }
  );

  const subjects = data?.subjects ?? [];
  const students = data?.students ?? [];
  const busy = scopeLoading || loading;

  return (
    <div className="min-h-screen">
      <div className="screen-pad flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar name={user?.fullName ?? "Teacher"} size={44} />
          <div>
            <p className="text-sm text-muted-foreground">Hi, {user?.fullName?.split(" ")[0] ?? "Teacher"} 👋</p>
            <p className="text-xs font-medium text-edvia-600">
              {classes.length > 0
                ? `${classes.length} ${classes.length === 1 ? "class" : "classes"} assigned`
                : "No classes assigned"}
            </p>
          </div>
        </div>
        <NotificationBell />
      </div>

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
        <p className="mb-2 text-sm font-semibold text-slate-800">Your Classes</p>
        <div className="space-y-2.5">
          {scopeLoading && <LoadingState rows={2} label="Loading your classes" />}
          {!scopeLoading && classes.length === 0 && !needsLinking && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              You have no classes assigned yet. Your school office can add them.
            </p>
          )}
          {!scopeLoading &&
            classes.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/teacher/attendance/${c.id}`)}
                className="card flex w-full items-center justify-between p-3.5 text-left transition-colors hover:border-edvia-300"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{c.className}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.id === activeClassId && subjects.length > 0
                      ? subjects.map((s) => s.subject).slice(0, 2).join(" · ")
                      : "Tap to mark attendance"}
                  </p>
                </div>
                <span className="text-xs font-medium text-edvia-600">Mark ›</span>
              </button>
            ))}
        </div>
      </div>

      <div className="screen-pad !pt-6">
        <div className="flex gap-3">
          <StatCard value={classes.length} label="Assigned Classes" tone="brand" />
          <StatCard value={busy ? "—" : students.length} label={activeClass ? `In ${activeClass.className}` : "Students"} tone="success" />
        </div>
      </div>

      <div className="screen-pad !pt-6">
        <p className="mb-2 text-sm font-semibold text-slate-800">Quick Actions</p>
        <div className="grid grid-cols-4 gap-2.5">
          <QuickAction
            icon={ClipboardCheck}
            label="Mark Attendance"
            disabled={!activeClassId}
            onClick={() => activeClassId && navigate(`/teacher/attendance/${activeClassId}`)}
          />
          <QuickAction icon={ClipboardList} label="Assignments" onClick={() => navigate("/student/assignments")} />
          <QuickAction icon={Megaphone} label="Notices" onClick={() => navigate("/notices")} />
          <QuickAction icon={Library} label="Resources" onClick={() => navigate("/resources")} />
        </div>
      </div>

      <div className="screen-pad !pt-6 pb-8">
        <button
          onClick={() => navigate("/ai")}
          className="card flex w-full items-center gap-3 border-edvia-200 bg-edvia-50 p-4 text-left"
        >
          <EdviaRobot size={40} state="idle" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-edvia-800">Ask EDVIA</p>
            <p className="text-xs text-edvia-600">Mark attendance by voice, check a class, look up a policy</p>
          </div>
        </button>
      </div>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof ClipboardCheck;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="card flex flex-col items-center gap-1.5 p-3 text-center disabled:opacity-40"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-edvia-100 text-edvia-700">
        <Icon size={16} />
      </span>
      <span className="text-[10px] font-medium leading-tight text-slate-700">{label}</span>
    </button>
  );
}
