import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar } from "@/components/ui/avatar";
import { StatCard } from "@/components/shared/StatCard";
import { NotificationBell } from "@/layouts/TopBar";
import { EdviaRobot } from "@/components/shared/EdviaRobot";
import { useAuth } from "@/app/AuthContext";
import { getAttendanceSummary } from "@/services/attendance/attendance.service";
import { listAssignments } from "@/services/assignments.service";
import { listNotices } from "@/services/notices.service";
import { formatDate } from "@/lib/utils";
import type { AttendanceSummary, Assignment, Notice } from "@/types";

const CHILD = { id: "stu_henry", name: "Henry James", className: "Class 10 - A" };

export default function ParentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    getAttendanceSummary(CHILD.id).then(setSummary);
    listAssignments("cls_10a").then(setAssignments);
    if (user?.schoolId && user?.uid) {
      listNotices(user.schoolId, user.uid).then(setNotices);
    }
  }, [user?.schoolId, user?.uid]);

  return (
    <div className="min-h-screen">
      <div className="screen-pad flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Hi, {user?.fullName?.split(" ")[0] ?? "Parent"} 👋</p>
          <h1 className="font-display text-lg font-bold">Parent Dashboard</h1>
        </div>
        <NotificationBell unread={1} />
      </div>

      <div className="screen-pad !pt-4">
        <button className="card flex w-full items-center gap-3 p-3.5 text-left">
          <Avatar name={CHILD.name} size={40} />
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900">{CHILD.name}</p>
            <p className="text-xs text-muted-foreground">{CHILD.className}</p>
          </div>
          <span className="text-xs font-medium text-edvia-600">Switch child ›</span>
        </button>
      </div>

      <div className="screen-pad !pt-5">
        <p className="mb-2 text-sm font-semibold text-slate-800">{CHILD.name.split(" ")[0]}&apos;s Overview</p>
        <div className="flex gap-3">
          <StatCard value={summary ? `${summary.percentage}%` : "—"} label="Attendance" tone="brand" />
          <StatCard value="A" label="Average Grade" tone="success" />
          <StatCard value={assignments.filter((a) => a.status === "pending").length} label="Assignments" tone="warning" />
        </div>
      </div>

      <div className="screen-pad !pt-6">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">Recent Updates</p>
          <button onClick={() => navigate("/notices")} className="text-xs font-medium text-edvia-600">See all</button>
        </div>
        <div className="space-y-2.5">
          {assignments.slice(0, 1).map((a) => (
            <div key={a.id} className="card flex items-center justify-between p-3.5">
              <div>
                <p className="text-sm font-semibold text-slate-900">New: {a.title}</p>
                <p className="text-xs text-muted-foreground">{a.subject}</p>
              </div>
              <span className="text-xs text-muted-foreground">Due {formatDate(a.dueDate)}</span>
            </div>
          ))}
          {notices.slice(0, 1).map((n) => (
            <div key={n.id} className="card p-3.5">
              <p className="text-sm font-semibold text-slate-900">{n.title}</p>
              <p className="text-xs text-muted-foreground">{formatDate(n.date)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="screen-pad !pt-6 pb-8">
        <button onClick={() => navigate("/ai")} className="card flex w-full items-center gap-3 border-edvia-200 bg-edvia-50 p-4 text-left">
          <EdviaRobot size={40} />
          <div className="flex-1">
            <p className="text-sm font-semibold text-edvia-800">Ask EDVIA about {CHILD.name.split(" ")[0]}</p>
            <p className="text-xs text-edvia-600">Progress summaries, attendance, and more</p>
          </div>
        </button>
      </div>
    </div>
  );
}
