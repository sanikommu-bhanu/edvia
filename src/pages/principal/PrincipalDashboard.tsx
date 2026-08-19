import { useNavigate } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { AlertTriangle } from "lucide-react";
import { NotificationBell } from "@/layouts/TopBar";
import { StatCard } from "@/components/shared/StatCard";
import { EdviaRobot } from "@/components/shared/EdviaRobot";
import { LoadingState, ErrorState } from "@/components/shared/StateViews";
import { useAuth } from "@/app/AuthContext";
import { useSchoolScope } from "@/app/SchoolContext";
import { useAsyncData } from "@/hooks/useAsyncData";
import { getSchoolAnalytics } from "@/services/analytics.service";
import { listNotices } from "@/services/notices.service";
import { formatDate } from "@/lib/utils";

/**
 * The principal's overview.
 *
 * Every figure here comes from /api/analytics/school, which runs the same
 * roll-up EDVIA uses when asked "what is the overall attendance?". The
 * previous version rendered a hardcoded 87% present / 5% leave legend and
 * three invented "recent updates"; those are gone — what remains is either
 * real or shown as "—".
 */
export default function PrincipalDashboard() {
  const { user } = useAuth();
  const { school } = useSchoolScope();
  const navigate = useNavigate();

  const { data, loading, error, reload } = useAsyncData(
    async () => {
      const [analytics, notices] = await Promise.all([
        getSchoolAnalytics("this_month"),
        user ? listNotices(user.schoolId, user.uid) : Promise.resolve([]),
      ]);
      return { analytics, notices };
    },
    [user?.schoolId, user?.uid],
    { enabled: Boolean(user?.schoolId) }
  );

  const analytics = data?.analytics ?? null;
  const notices = data?.notices ?? [];
  const attendance = analytics?.attendance;
  const hasAttendance = Boolean(attendance && !attendance.noRecords);
  const percent = hasAttendance ? (attendance?.overallPercentage ?? 0) : 0;

  const pieData = [
    { name: "Present", value: percent },
    { name: "Away", value: Math.max(0, 100 - percent) },
  ];

  return (
    <div className="min-h-screen">
      <div className="screen-pad flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Welcome, {user?.fullName?.split(" ")[0] ?? "Principal"} 👋</p>
          <h1 className="font-display text-lg font-bold">{school?.name ?? "Your School"}</h1>
        </div>
        <NotificationBell />
      </div>

      {error && (
        <div className="screen-pad !pt-5">
          <ErrorState body={error} onRetry={reload} />
        </div>
      )}

      <div className="screen-pad !pt-5">
        <p className="mb-2 text-sm font-semibold text-slate-800">Overview</p>
        <div className="flex gap-3">
          <StatCard value={analytics?.counts?.totalStudents ?? "—"} label="Students" tone="brand" />
          <StatCard value={analytics?.counts?.totalTeachers ?? "—"} label="Teachers" tone="success" />
          <StatCard value={analytics?.counts?.totalClasses ?? "—"} label="Classes" tone="warning" />
        </div>
      </div>

      <div className="screen-pad !pt-6">
        <div className="card p-5">
          <p className="mb-3 text-sm font-semibold text-slate-800">Attendance — This Month</p>
          {loading ? (
            <LoadingState rows={2} label="Loading attendance" />
          ) : !hasAttendance ? (
            <p className="py-4 text-sm text-muted-foreground">
              No attendance has been recorded this month yet.
            </p>
          ) : (
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
              <div className="flex-1 space-y-1">
                <p className="text-2xl font-bold text-edvia-600">{attendance?.overallPercentage}%</p>
                <p className="text-sm text-muted-foreground">Overall</p>
                <p className="text-xs text-muted-foreground">
                  Across {attendance?.totalRecords} records in {attendance?.perClass.length}{" "}
                  {attendance?.perClass.length === 1 ? "class" : "classes"}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {hasAttendance && (attendance?.classesNeedingAttention.length ?? 0) > 0 && (
        <div className="screen-pad !pt-6">
          <p className="mb-2 text-sm font-semibold text-slate-800">Needs Attention</p>
          <div className="space-y-2.5">
            {attendance?.classesNeedingAttention.map((c) => (
              <button
                key={c.classId}
                onClick={() => navigate("/principal/analytics")}
                className="card flex w-full items-center gap-3 p-3.5 text-left"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10 text-warning">
                  <AlertTriangle size={16} />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900">{c.className}</p>
                  <p className="text-xs text-muted-foreground">Attendance below 85%</p>
                </div>
                <span className="text-sm font-semibold text-warning">{c.percentage}%</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="screen-pad !pt-6">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">Recent Notices</p>
          <button onClick={() => navigate("/notices")} className="text-xs font-medium text-edvia-600">
            See all
          </button>
        </div>
        <div className="space-y-2.5">
          {loading && <LoadingState rows={2} label="Loading notices" />}
          {!loading && notices.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">No notices published yet.</p>
          )}
          {!loading &&
            notices.slice(0, 3).map((n) => (
              <div key={n.id} className="card p-3.5">
                <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                <p className="text-xs text-muted-foreground">{formatDate(n.date)}</p>
              </div>
            ))}
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
            <p className="text-xs text-edvia-600">Overall attendance, class breakdowns, school policies</p>
          </div>
        </button>
      </div>
    </div>
  );
}
