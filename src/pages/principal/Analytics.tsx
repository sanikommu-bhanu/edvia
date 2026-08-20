import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { BarChart3 } from "lucide-react";
import { TopBar } from "@/layouts/TopBar";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState, LoadingState, ErrorState } from "@/components/shared/StateViews";
import { useAsyncData } from "@/hooks/useAsyncData";
import {
  getSchoolAnalytics,
  PERIOD_LABELS,
  type AnalyticsPeriod,
} from "@/services/analytics.service";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const PERIODS: AnalyticsPeriod[] = ["this_week", "this_month", "last_month", "this_term"];

/**
 * Class-by-class attendance AND academic performance for the principal.
 *
 * The original version of this screen showed a hardcoded 87/76/82 stat row,
 * an invented four-term performance chart and two named "top students" who
 * did not exist in any collection. Everything on it now is computed
 * server-side from real records: attendance from the `attendance`
 * collection, academic performance from `examResults`, both by the same
 * School Service functions EDVIA's tools call — so the chart and the
 * assistant cannot report different figures.
 *
 * The rule the screen holds to is that "no data" is not "zero". A school
 * that has entered no marks shows a dash and an explanation, never a 0% bar
 * a principal could mistake for a result.
 */
export default function PrincipalAnalytics() {
  const [period, setPeriod] = useState<AnalyticsPeriod>("this_month");

  const { data, loading, error, reload } = useAsyncData(() => getSchoolAnalytics(period), [period]);

  const [view, setView] = useState<"attendance" | "performance">("attendance");

  const attendance = data?.attendance;
  const performance = data?.performance;
  const counts = data?.counts;
  const perClass = attendance?.perClass ?? [];
  const hasData = Boolean(attendance && !attendance.noRecords);
  const hasPerformance = Boolean(performance && !performance.noRecords);

  // One chart, two datasets. The threshold that colours a bar differs by
  // measure (85% attendance, 60% academic), so it travels with the data
  // rather than being hardcoded inside the Cell.
  const chartRows =
    view === "attendance"
      ? perClass.map((c) => ({
          classId: c.classId,
          className: c.className,
          percentage: c.percentage,
          total: c.total,
        }))
      : (performance?.perClass ?? []).map((c) => ({
          classId: c.classId,
          className: c.className,
          percentage: c.percentage,
          total: c.count,
        }));
  const chartThreshold = view === "attendance" ? 85 : 60;
  const chartHasData = view === "attendance" ? hasData : hasPerformance;

  return (
    <div className="min-h-screen pb-8">
      <TopBar title="Analytics" />

      <div className="screen-pad !pt-0">
        <div className="mb-4 flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                period === p ? "bg-edvia-500 text-white" : "border border-border bg-surface text-slate-700"
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <StatCard
            value={hasData ? `${attendance?.overallPercentage}%` : "—"}
            label="Attendance"
            tone="success"
          />
          {/* Derived live from examResults. A dash means no marks exist yet
              — never a fabricated average. */}
          <StatCard
            value={hasPerformance ? `${performance?.overallPercentage}%` : "—"}
            label="Performance"
            tone="brand"
          />
          {typeof counts?.engagementPercent === "number" && (
            <StatCard value={`${counts.engagementPercent}%`} label="Engagement" tone="warning" />
          )}
        </div>
      </div>

      <div className="screen-pad !pt-6">
        <div className="card p-4">
          <Tabs
            className="mb-3"
            tabs={[
              { value: "attendance", label: "Attendance" },
              { value: "performance", label: "Performance" },
            ]}
            active={view}
            onChange={(v) => setView(v as "attendance" | "performance")}
          />
          <p className="mb-1 text-sm font-semibold text-slate-800">
            {view === "attendance" ? "Attendance by Class" : "Academic Performance by Class"}
          </p>
          <p className="mb-3 text-xs text-muted-foreground">
            {view === "attendance"
              ? `${PERIOD_LABELS[period]}${data ? ` · ${data.bounds.start} to ${data.bounds.end}` : ""}`
              : `Every recorded paper · ${performance?.resultCount ?? 0} results`}
          </p>

          {loading && <LoadingState rows={3} label="Loading analytics" />}
          {!loading && error && <ErrorState body={error} onRetry={reload} />}
          {!loading && !error && !chartHasData && (
            <EmptyState
              icon={BarChart3}
              title={view === "attendance" ? "No attendance in this period" : "No marks recorded yet"}
              body={
                view === "attendance"
                  ? "Once teachers mark the register for these dates, the class breakdown appears here."
                  : "Once teachers enter exam marks, the academic breakdown appears here. Nothing is estimated in the meantime."
              }
            />
          )}

          {!loading && !error && chartHasData && (
            <div style={{ height: Math.max(160, chartRows.length * 42) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="className"
                    width={92}
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value, _name, item) => [
                      `${value}% (${(item?.payload as { total?: number })?.total ?? 0} records)`,
                      view === "attendance" ? "Attendance" : "Average",
                    ]}
                  />
                  <Bar dataKey="percentage" radius={[0, 6, 6, 0]}>
                    {chartRows.map((c) => (
                      // Colour carries the same threshold the "needs attention"
                      // list uses, so the two views can't disagree visually.
                      <Cell key={c.classId} fill={c.percentage < chartThreshold ? "#F5A524" : "#8257D3"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {hasPerformance && (performance?.bySubject.length ?? 0) > 0 && (
        <div className="screen-pad !pt-6">
          <p className="mb-2 text-sm font-semibold text-slate-800">Weakest Subjects School-wide</p>
          <div className="space-y-2">
            {performance?.bySubject.slice(0, 5).map((subject) => (
              <div key={subject.subject} className="card flex items-center justify-between gap-3 p-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{subject.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {subject.count} paper{subject.count === 1 ? "" : "s"} marked
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-sm font-semibold",
                    subject.percentage < 60 ? "text-warning" : "text-slate-900"
                  )}
                >
                  {subject.percentage}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasData && (attendance?.classesNeedingAttention.length ?? 0) > 0 && (
        <div className="screen-pad !pt-6">
          <p className="mb-2 text-sm font-semibold text-slate-800">Classes Below 85%</p>
          <div className="space-y-2">
            {attendance?.classesNeedingAttention.map((c, i) => (
              <div key={c.classId} className="card flex items-center justify-between p-3.5">
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-warning/10 text-xs font-bold text-warning">
                    {i + 1}
                  </span>
                  <p className="text-sm font-semibold text-slate-900">{c.className}</p>
                </div>
                <span className="text-sm font-semibold text-warning">{c.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
