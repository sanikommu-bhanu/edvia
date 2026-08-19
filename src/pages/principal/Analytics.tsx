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
import { cn } from "@/lib/utils";

const PERIODS: AnalyticsPeriod[] = ["this_week", "this_month", "last_month", "this_term"];

/**
 * Class-by-class attendance for the principal.
 *
 * The previous version of this screen showed a hardcoded 87/76/82 stat row,
 * an invented four-term performance chart and two named "top students" who
 * do not exist in any collection. Grades and engagement are not modelled in
 * EDVIA yet, so those are not shown at all rather than fabricated — the
 * performance and engagement tiles appear only if the school's analytics
 * document actually carries those figures.
 */
export default function PrincipalAnalytics() {
  const [period, setPeriod] = useState<AnalyticsPeriod>("this_month");

  const { data, loading, error, reload } = useAsyncData(() => getSchoolAnalytics(period), [period]);

  const attendance = data?.attendance;
  const counts = data?.counts;
  const perClass = attendance?.perClass ?? [];
  const hasData = Boolean(attendance && !attendance.noRecords);

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
          {/* Only rendered when the school actually publishes these figures. */}
          {typeof counts?.averagePerformancePercent === "number" && (
            <StatCard value={`${counts.averagePerformancePercent}%`} label="Performance" tone="brand" />
          )}
          {typeof counts?.engagementPercent === "number" && (
            <StatCard value={`${counts.engagementPercent}%`} label="Engagement" tone="warning" />
          )}
        </div>
      </div>

      <div className="screen-pad !pt-6">
        <div className="card p-4">
          <p className="mb-1 text-sm font-semibold text-slate-800">Attendance by Class</p>
          <p className="mb-3 text-xs text-muted-foreground">
            {PERIOD_LABELS[period]}
            {data ? ` · ${data.bounds.start} to ${data.bounds.end}` : ""}
          </p>

          {loading && <LoadingState rows={3} label="Loading analytics" />}
          {!loading && error && <ErrorState body={error} onRetry={reload} />}
          {!loading && !error && !hasData && (
            <EmptyState
              icon={BarChart3}
              title="No attendance in this period"
              body="Once teachers mark the register for these dates, the class breakdown appears here."
            />
          )}

          {!loading && !error && hasData && (
            <div style={{ height: Math.max(160, perClass.length * 42) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perClass} layout="vertical" margin={{ left: 8, right: 16 }}>
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
                      "Attendance",
                    ]}
                  />
                  <Bar dataKey="percentage" radius={[0, 6, 6, 0]}>
                    {perClass.map((c) => (
                      // Colour carries the same threshold the "needs attention"
                      // list uses, so the two views can't disagree visually.
                      <Cell key={c.classId} fill={c.percentage < 85 ? "#F5A524" : "#8257D3"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

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
