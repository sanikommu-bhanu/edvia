import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Check, X, Clock3 } from "lucide-react";
import { TopBar } from "@/layouts/TopBar";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/shared/StatCard";
import { listClassStudents } from "@/services/school/school.service";
import { markClassAttendance } from "@/services/attendance/attendance.service";
import { cn } from "@/lib/utils";
import type { StudentRecord, AttendanceStatus } from "@/types";

const TODAY = new Date().toISOString().slice(0, 10);

export default function MarkAttendance() {
  const { classId = "cls_10a" } = useParams();
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    listClassStudents(classId).then((list) => {
      setStudents(list);
      setStatuses(Object.fromEntries(list.map((s) => [s.id, "present" as AttendanceStatus])));
    });
  }, [classId]);

  const present = Object.values(statuses).filter((s) => s === "present").length;
  const absent = Object.values(statuses).filter((s) => s === "absent").length;
  const leave = Object.values(statuses).filter((s) => s === "leave").length;

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await markClassAttendance({
        classId,
        date: TODAY,
        entries: students.map((s) => ({ studentId: s.id, status: statuses[s.id] })),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="Mark Attendance" showBack />
      <div className="screen-pad !pt-0">
        <p className="mb-4 text-sm text-muted-foreground">Class 10 - A · {new Date(TODAY).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
        <div className="flex gap-2.5">
          <StatCard value={students.length} label="Total" />
          <StatCard value={present} label="Present" tone="success" />
          <StatCard value={absent} label="Absent" tone="danger" />
          <StatCard value={leave} label="Leave" tone="warning" />
        </div>
      </div>

      <div className="screen-pad space-y-2 pb-6">
        {students.map((s) => (
          <div key={s.id} className="card flex items-center justify-between p-3.5">
            <div>
              <p className="text-sm font-semibold text-slate-900">{s.fullName}</p>
              <p className="text-xs text-muted-foreground">Roll {s.rollNumber}</p>
            </div>
            <div className="flex gap-1.5">
              <StatusButton icon={Check} active={statuses[s.id] === "present"} tone="success" onClick={() => setStatuses((p) => ({ ...p, [s.id]: "present" }))} />
              <StatusButton icon={X} active={statuses[s.id] === "absent"} tone="danger" onClick={() => setStatuses((p) => ({ ...p, [s.id]: "absent" }))} />
              <StatusButton icon={Clock3} active={statuses[s.id] === "leave"} tone="warning" onClick={() => setStatuses((p) => ({ ...p, [s.id]: "leave" }))} />
            </div>
          </div>
        ))}
      </div>

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-[480px] border-t border-border bg-surface p-4">
        {saved && <p className="mb-2 text-center text-xs font-medium text-success">Attendance saved successfully.</p>}
        <Button size="lg" className="w-full" onClick={save} disabled={saving || students.length === 0}>
          {saving ? "Saving…" : "Save Attendance"}
        </Button>
      </div>
    </div>
  );
}

function StatusButton({ icon: Icon, active, tone, onClick }: { icon: typeof Check; active: boolean; tone: "success" | "danger" | "warning"; onClick: () => void }) {
  const tones = {
    success: active ? "bg-success text-white" : "bg-success/10 text-success",
    danger: active ? "bg-danger text-white" : "bg-danger/10 text-danger",
    warning: active ? "bg-warning text-white" : "bg-warning/10 text-warning",
  };
  return (
    <button onClick={onClick} className={cn("flex h-9 w-9 items-center justify-center rounded-full transition-colors", tones[tone])}>
      <Icon size={16} />
    </button>
  );
}
