import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { NotificationBell } from "@/layouts/TopBar";
import { StatCard } from "@/components/shared/StatCard";
import { useAuth } from "@/app/AuthContext";
import { schoolSummary, getSchool } from "@/services/school/school.service";
import type { School } from "@/types";

export default function PrincipalDashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<{ totalStudents: number; totalTeachers: number; totalClasses: number; overallAttendancePercent: number } | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const attendancePercent = summary?.overallAttendancePercent ?? 0;

  useEffect(() => {
    if (!user?.schoolId) return;
    schoolSummary(user.schoolId).then(setSummary);
    getSchool(user.schoolId).then(setSchool);
  }, [user?.schoolId]);

  const pieData = [
    { name: "Present", value: attendancePercent },
    { name: "Away", value: 100 - attendancePercent },
  ];

  return (
    <div className="min-h-screen">
      <div className="screen-pad flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Welcome, Principal 👋</p>
          <h1 className="font-display text-lg font-bold">{school?.name ?? "Your School"}</h1>
        </div>
        <NotificationBell unread={3} />
      </div>

      <div className="screen-pad !pt-5">
        <p className="mb-2 text-sm font-semibold text-slate-800">Overview</p>
        <div className="flex gap-3">
          <StatCard value={summary?.totalStudents ?? "—"} label="Students" tone="brand" />
          <StatCard value={summary?.totalTeachers ?? "—"} label="Teachers" tone="success" />
          <StatCard value={summary?.totalClasses ?? "—"} label="Classes" tone="warning" />
        </div>
      </div>

      <div className="screen-pad !pt-6">
        <div className="card p-5">
          <p className="mb-3 text-sm font-semibold text-slate-800">Attendance Overview — This Month</p>
          <div className="flex items-center gap-5">
            <div className="h-28 w-28 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} innerRadius={38} outerRadius={54} dataKey="value" startAngle={90} endAngle={-270}>
                    <Cell fill="#8257D3" />
                    <Cell fill="#EFEAFA" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-1.5 text-sm">
              <p className="text-2xl font-bold text-edvia-600">{attendancePercent}%</p>
              <p className="text-muted-foreground">Overall</p>
              <div className="flex items-center gap-1.5 text-xs"><span className="h-2 w-2 rounded-full bg-edvia-500" /> Present · 87%</div>
              <div className="flex items-center gap-1.5 text-xs"><span className="h-2 w-2 rounded-full bg-edvia-100" /> Leave · 5%</div>
            </div>
          </div>
        </div>
      </div>

      <div className="screen-pad !pt-6 pb-8">
        <p className="mb-2 text-sm font-semibold text-slate-800">Recent Updates</p>
        <div className="space-y-2.5">
          <div className="card p-3.5">
            <p className="text-sm font-semibold text-slate-900">New Homework Assigned</p>
            <p className="text-xs text-muted-foreground">Class 10 - A · Mathematics</p>
          </div>
          <div className="card p-3.5">
            <p className="text-sm font-semibold text-slate-900">Test Scheduled: Science Test</p>
            <p className="text-xs text-muted-foreground">Class 10 - A · 25 May</p>
          </div>
          <div className="card p-3.5">
            <p className="text-sm font-semibold text-slate-900">PTM on 25 May</p>
            <p className="text-xs text-muted-foreground">All classes</p>
          </div>
        </div>
      </div>
    </div>
  );
}
