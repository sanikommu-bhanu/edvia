import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar } from "@/components/ui/avatar";
import { StatCard } from "@/components/shared/StatCard";
import { SubjectIcon } from "@/components/shared/SubjectIcon";
import { NotificationBell } from "@/layouts/TopBar";
import { EdviaRobot } from "@/components/shared/EdviaRobot";
import { useAuth } from "@/app/AuthContext";
import { listClassSubjects } from "@/services/school/school.service";
import { listAssignments } from "@/services/assignments.service";
import { listExams } from "@/services/exams.service";
import { formatDate } from "@/lib/utils";
import type { ClassSubject, Assignment, Exam } from "@/types";

export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState<ClassSubject[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);

  const classId = "cls_10a";

  useEffect(() => {
    listClassSubjects(classId).then(setSubjects);
    listAssignments(classId).then(setAssignments);
    listExams(classId).then(setExams);
  }, []);

  const pendingAssignments = assignments.filter((a) => a.status === "pending").length;
  const upcomingTests = exams.filter((e) => e.status === "upcoming").length;
  const nextExam = [...exams].sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))[0];
  const nextAssignment = assignments.find((a) => a.status === "pending");

  return (
    <div className="min-h-screen">
      <div className="screen-pad flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar name={user?.fullName ?? "Student"} size={44} />
          <div>
            <p className="text-sm text-muted-foreground">Hi, {user?.fullName?.split(" ")[0] ?? "Student"} 👋</p>
            <p className="text-xs font-medium text-edvia-600">Class 10 - A · Roll 23</p>
          </div>
        </div>
        <NotificationBell unread={2} />
      </div>

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
          {subjects.slice(0, 3).map((s) => (
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
              <span className="rounded-full bg-danger/10 px-2.5 py-1 text-xs font-medium text-danger">{nextExam.daysLeft} Days Left</span>
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
