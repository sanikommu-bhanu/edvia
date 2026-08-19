import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Check, X, Clock3, CheckCheck } from "lucide-react";
import { TopBar } from "@/layouts/TopBar";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/shared/StatCard";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/StateViews";
import { useSchoolScope } from "@/app/SchoolContext";
import { useAsyncData } from "@/hooks/useAsyncData";
import { listClassStudents } from "@/services/school/school.service";
import { markClassAttendance, getClassAttendanceForDate } from "@/services/attendance/attendance.service";
import { cn } from "@/lib/utils";
import { Users } from "lucide-react";
import type { AttendanceStatus } from "@/types";

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Marking and correcting a class register.
 *
 * Two behaviours that matter for correctness:
 *   1. It loads whatever is ALREADY saved for the chosen date and starts
 *      from that, so opening the screen to fix one student doesn't re-mark
 *      the rest. Unmarked students default to present, which is the normal
 *      register convention, but only when nothing is on record yet.
 *   2. It shows success only after the server confirms the write, and says
 *      how many records were amended versus created — which is how a teacher
 *      can tell their correction actually landed.
 */
export default function MarkAttendance() {
  const { classId: routeClassId } = useParams();
  const { classes, activeClassId, loading: scopeLoading } = useSchoolScope();
  const classId = routeClassId ?? activeClassId ?? null;
  const klass = classes.find((c) => c.id === classId);

  const [date, setDate] = useState(todayIso());
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsyncData(
    async () => {
      if (!classId) return null;
      const [students, existing] = await Promise.all([
        listClassStudents(classId),
        getClassAttendanceForDate(classId, date),
      ]);
      return { students, existing };
    },
    [classId, date],
    { enabled: Boolean(classId) }
  );

  const students = useMemo(
    () =>
      [...(data?.students ?? [])].sort((a, b) =>
        a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true })
      ),
    [data]
  );

  // Seed the form from what's already saved; anything unmarked starts present.
  useEffect(() => {
    if (!data) return;
    setStatuses(
      Object.fromEntries(data.students.map((s) => [s.id, data.existing[s.id] ?? ("present" as AttendanceStatus)]))
    );
    setSaveResult(null);
    setSaveError(null);
  }, [data]);

  const alreadyMarkedCount = Object.keys(data?.existing ?? {}).length;
  const present = Object.values(statuses).filter((s) => s === "present").length;
  const absent = Object.values(statuses).filter((s) => s === "absent").length;
  const leave = Object.values(statuses).filter((s) => s === "leave").length;
  const busy = scopeLoading || loading;

  async function save() {
    if (!classId) return;
    setSaving(true);
    setSaveResult(null);
    setSaveError(null);
    try {
      const response = await markClassAttendance({
        classId,
        date,
        entries: students.map((s) => ({ studentId: s.id, status: statuses[s.id] })),
      });
      // Reported only after the server confirms — never optimistically.
      setSaveResult(
        response.amended > 0
          ? `Saved ${response.count} records (${response.amended} changed).`
          : `Saved ${response.count} records.`
      );
      reload();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "We couldn't save attendance. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function setAll(status: AttendanceStatus) {
    setStatuses(Object.fromEntries(students.map((s) => [s.id, status])));
  }

  if (!busy && !classId) {
    return (
      <div className="min-h-screen">
        <TopBar title="Mark Attendance" showBack />
        <div className="screen-pad !pt-0">
          <EmptyState icon={Users} title="No class selected" body="Pick one of your classes to mark its register." />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28">
      <TopBar title="Mark Attendance" showBack />

      <div className="screen-pad !pt-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-800">{klass?.className ?? "Class register"}</p>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="sr-only">Attendance date</span>
            <input
              type="date"
              value={date}
              max={todayIso()}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-edvia-400"
            />
          </label>
        </div>

        {alreadyMarkedCount > 0 && !busy && (
          <p className="mb-3 rounded-lg bg-edvia-50 px-3 py-2 text-xs text-edvia-700">
            {alreadyMarkedCount} of {students.length} already marked for this date — you're editing the saved register.
          </p>
        )}

        <div className="flex gap-2.5">
          <StatCard value={students.length} label="Total" />
          <StatCard value={present} label="Present" tone="success" />
          <StatCard value={absent} label="Absent" tone="danger" />
          <StatCard value={leave} label="Leave" tone="warning" />
        </div>

        {students.length > 0 && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setAll("present")}
              className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-edvia-300"
            >
              <CheckCheck size={13} /> Mark all present
            </button>
          </div>
        )}
      </div>

      <div className="screen-pad space-y-2 pb-6">
        {busy && <LoadingState rows={5} label="Loading register" />}
        {!busy && error && <ErrorState body={error} onRetry={reload} />}
        {!busy && !error && students.length === 0 && (
          <EmptyState icon={Users} title="No students" body="This class has no students on its roster yet." />
        )}
        {!busy &&
          !error &&
          students.map((s) => (
            <div key={s.id} className="card flex items-center justify-between p-3.5">
              <div>
                <p className="text-sm font-semibold text-slate-900">{s.fullName}</p>
                <p className="text-xs text-muted-foreground">Roll {s.rollNumber}</p>
              </div>
              <div className="flex gap-1.5">
                <StatusButton
                  icon={Check}
                  label={`Mark ${s.fullName} present`}
                  active={statuses[s.id] === "present"}
                  tone="success"
                  onClick={() => setStatuses((p) => ({ ...p, [s.id]: "present" }))}
                />
                <StatusButton
                  icon={X}
                  label={`Mark ${s.fullName} absent`}
                  active={statuses[s.id] === "absent"}
                  tone="danger"
                  onClick={() => setStatuses((p) => ({ ...p, [s.id]: "absent" }))}
                />
                <StatusButton
                  icon={Clock3}
                  label={`Mark ${s.fullName} on leave`}
                  active={statuses[s.id] === "leave"}
                  tone="warning"
                  onClick={() => setStatuses((p) => ({ ...p, [s.id]: "leave" }))}
                />
              </div>
            </div>
          ))}
      </div>

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-[480px] border-t border-border bg-surface p-4">
        {saveResult && <p className="mb-2 text-center text-xs font-medium text-success">{saveResult}</p>}
        {saveError && <p className="mb-2 text-center text-xs font-medium text-danger">{saveError}</p>}
        <Button size="lg" className="w-full" onClick={() => void save()} disabled={saving || students.length === 0}>
          {saving ? "Saving…" : "Save Attendance"}
        </Button>
      </div>
    </div>
  );
}

function StatusButton({
  icon: Icon,
  label,
  active,
  tone,
  onClick,
}: {
  icon: typeof Check;
  label: string;
  active: boolean;
  tone: "success" | "danger" | "warning";
  onClick: () => void;
}) {
  const tones = {
    success: active ? "bg-success text-white" : "bg-success/10 text-success",
    danger: active ? "bg-danger text-white" : "bg-danger/10 text-danger",
    warning: active ? "bg-warning text-white" : "bg-warning/10 text-warning",
  };
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn("flex h-9 w-9 items-center justify-center rounded-full transition-colors", tones[tone])}
    >
      <Icon size={16} />
    </button>
  );
}
