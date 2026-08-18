import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar } from "@/components/ui/avatar";
import { StatCard } from "@/components/shared/StatCard";
import { NotificationBell } from "@/layouts/TopBar";
import { EdviaRobot } from "@/components/shared/EdviaRobot";
import { ClipboardCheck, ClipboardList, Megaphone } from "lucide-react";
import { useAuth } from "@/app/AuthContext";
import { listClassSubjects, listClassStudents } from "@/services/school/school.service";
import type { ClassSubject, StudentRecord } from "@/types";

export default function TeacherDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState<ClassSubject[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);

  useEffect(() => {
    listClassSubjects("cls_10a").then(setSubjects);
    listClassStudents("cls_10a").then(setStudents);
  }, []);

  return (
    <div className="min-h-screen">
      <div className="screen-pad flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar name={user?.fullName ?? "Teacher"} size={44} />
          <div>
            <p className="text-sm text-muted-foreground">Hi, {user?.fullName ?? "Mr. Sharma"} 👋</p>
            <p className="text-xs font-medium text-edvia-600">Todays Teacher</p>
          </div>
        </div>
        <NotificationBell />
      </div>

      <div className="screen-pad !pt-5">
        <p className="mb-2 text-sm font-semibold text-slate-800">Today&apos;s Classes</p>
        <div className="space-y-2.5">
          {subjects.map((s) => (
            <div key={s.id} className="card flex items-center justify-between p-3.5">
              <div>
                <p className="text-sm font-semibold text-slate-900">Class 10 - A</p>
                <p className="text-xs text-muted-foreground">{s.subject}</p>
              </div>
              <span className="text-xs font-medium text-muted-foreground">{s.schedule}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="screen-pad !pt-6">
        <div className="flex gap-3">
          <StatCard value={subjects.length} label="Assigned Classes" tone="brand" />
          <StatCard value={students.length} label="Students" tone="success" />
        </div>
      </div>

      <div className="screen-pad !pt-6">
        <p className="mb-2 text-sm font-semibold text-slate-800">Quick Actions</p>
        <div className="grid grid-cols-4 gap-2.5">
          <QuickAction icon={ClipboardCheck} label="Mark Attendance" onClick={() => navigate("/teacher/attendance/cls_10a")} />
          <QuickAction icon={ClipboardList} label="Add Assignment" onClick={() => navigate("/student/assignments")} />
          <QuickAction icon={Megaphone} label="Notice" onClick={() => navigate("/notices")} />
          <QuickAction icon={ClipboardList} label="Upload Material" onClick={() => navigate("/resources")} />
        </div>
      </div>

      <div className="screen-pad !pt-6 pb-8">
        <button onClick={() => navigate("/ai")} className="card flex w-full items-center gap-3 border-edvia-200 bg-edvia-50 p-4 text-left">
          <EdviaRobot size={40} />
          <div className="flex-1">
            <p className="text-sm font-semibold text-edvia-800">Ask EDVIA</p>
            <p className="text-xs text-edvia-600">Draft notices, summarize submissions, and more</p>
          </div>
        </button>
      </div>
    </div>
  );
}

function QuickAction({ icon: Icon, label, onClick }: { icon: typeof ClipboardCheck; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="card flex flex-col items-center gap-1.5 p-3 text-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-edvia-100 text-edvia-700">
        <Icon size={16} />
      </span>
      <span className="text-[10px] font-medium leading-tight text-slate-700">{label}</span>
    </button>
  );
}
