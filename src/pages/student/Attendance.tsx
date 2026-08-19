import { useState } from "react";
import { LineChart, Line, XAxis, ResponsiveContainer, Tooltip } from "recharts";
import { CalendarCheck2 } from "lucide-react";
import { TopBar } from "@/layouts/TopBar";
import { Tabs } from "@/components/ui/tabs";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState, LoadingState, ErrorState } from "@/components/shared/StateViews";
import { LinkAccountPrompt } from "@/components/shared/LinkAccountPrompt";
import { ClassPicker } from "@/components/shared/ClassPicker";
import { useSchoolScope } from "@/app/SchoolContext";
import { useAsyncData } from "@/hooks/useAsyncData";
import { getAttendanceRecords, getAttendanceSummary } from "@/services/attendance/attendance.service";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { AttendanceRecord } from "@/types";

/**
 * Serves the student's own attendance and, for a parent, the attendance of
 * the child currently in focus — the same records EDVIA reads when asked
 * "what is my attendance?", through the same percentage formula.
 */
export default function AttendancePage() {
  const [tab, setTab] = useState("overview");
  const { student, needsLinking, loading: scopeLoading, error: scopeError, reload } = useSchoolScope();

  const { data, loading, error } = useAsyncData(
    async () => {
      if (!student) return null;
      const [records, summary] = await Promise.all([
        getAttendanceRecords(student.id),
        getAttendanceSummary(student.id),
      ]);
      return { records, summary };
    },
    [student?.id],
    { enabled: Boolean(student) }
  );

  const records = data?.records ?? [];
  const summary = data?.summary ?? null;
  const busy = scopeLoading || loading;
  const hasRecords = records.length > 0;

  return (
    <div className="min-h-screen">
      <TopBar title="Attendance" />
      <ClassPicker />
      <div className="screen-pad !pt-0">
        <Tabs
          tabs={[{ value: "overview", label: "Overview" }, { value: "calendar", label: "Calendar" }, { value: "records", label: "Records" }]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {needsLinking && (
        <div className="screen-pad">
          <LinkAccountPrompt />
        </div>
      )}
      {busy && (
        <div className="screen-pad">
          <LoadingState rows={3} label="Loading attendance" />
        </div>
      )}
      {!busy && (scopeError || error) && (
        <div className="screen-pad">
          <ErrorState body={scopeError ?? error ?? undefined} onRetry={reload} />
        </div>
      )}
      {!busy && !scopeError && !error && student && !hasRecords && (
        <div className="screen-pad">
          <EmptyState
            icon={CalendarCheck2}
            title="No attendance yet"
            body="No attendance has been recorded for this student yet. It will appear here once teachers start marking the register."
          />
        </div>
      )}

      {tab === "overview" && !busy && hasRecords && summary && (
        <div className="screen-pad space-y-5 pb-8">
          <div className="card p-5 text-center">
            <p className="text-4xl font-bold text-edvia-600">{summary.percentage}%</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Overall attendance across {summary.presentDays + summary.absentDays + summary.leaveDays} recorded days
            </p>
          </div>
          <div className="flex gap-3">
            <StatCard value={summary.presentDays} label="Present" tone="success" />
            <StatCard value={summary.absentDays} label="Absent" tone="danger" />
            <StatCard value={summary.leaveDays} label="Leave" tone="warning" />
          </div>
          <div className="card p-4">
            <p className="mb-3 text-sm font-semibold text-slate-800">Attendance Trend</p>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={summary.trend}>
                  <XAxis dataKey="date" tickFormatter={(d) => formatDate(d, { day: "numeric", month: "short" })} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip labelFormatter={(d) => formatDate(String(d))} formatter={(v) => [`${v}%`, "Attendance"]} />
                  <Line type="monotone" dataKey="percentage" stroke="#8257D3" strokeWidth={2.5} dot={{ r: 3, fill: "#8257D3" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {tab === "calendar" && !busy && hasRecords && <MonthGrid records={records} />}

      {tab === "records" && !busy && hasRecords && (
        <div className="screen-pad space-y-2 pb-8">
          {records.map((r) => (
            <div key={r.id} className="card flex items-center justify-between p-3.5">
              <span className="text-sm text-slate-700">{formatDate(r.date)}</span>
              <StatusPill status={r.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: AttendanceRecord["status"] }) {
  const map = { present: "bg-success/10 text-success", absent: "bg-danger/10 text-danger", leave: "bg-warning/10 text-warning" };
  return <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium capitalize", map[status])}>{status}</span>;
}

function MonthGrid({ records }: { records: AttendanceRecord[] }) {
  const byDate = new Map(records.map((r) => [r.date, r.status]));
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDay.getDay();

  const cells: (number | null)[] = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div className="screen-pad pb-8">
      <div className="card p-4">
        <p className="mb-3 text-sm font-semibold text-slate-800">{firstDay.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</p>
        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] text-muted-foreground">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <span key={`${d}-${i}`}>{d}</span>
          ))}
        </div>
        <div className="mt-1.5 grid grid-cols-7 gap-1.5">
          {cells.map((day, i) => {
            if (day === null) return <span key={i} />;
            const iso = new Date(year, month, day).toISOString().slice(0, 10);
            const status = byDate.get(iso);
            const tone =
              status === "present" ? "bg-success/15 text-success" : status === "absent" ? "bg-danger/15 text-danger" : status === "leave" ? "bg-warning/15 text-warning" : "text-slate-400";
            return (
              <span key={i} className={cn("flex h-8 items-center justify-center rounded-lg text-xs font-medium", tone)}>
                {day}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
