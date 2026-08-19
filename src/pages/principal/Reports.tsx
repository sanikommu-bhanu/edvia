import { useState } from "react";
import { FileBarChart, Download, FileWarning } from "lucide-react";
import { TopBar } from "@/layouts/TopBar";
import { EmptyState, LoadingState, ErrorState } from "@/components/shared/StateViews";
import { useSchoolScope } from "@/app/SchoolContext";
import { useAsyncData } from "@/hooks/useAsyncData";
import {
  getSchoolAnalytics,
  attendanceCsv,
  downloadCsv,
  PERIOD_LABELS,
  type AnalyticsPeriod,
} from "@/services/analytics.service";
import { cn } from "@/lib/utils";

const PERIODS: AnalyticsPeriod[] = ["this_week", "this_month", "last_month", "this_term"];

/**
 * Attendance reporting for school management.
 *
 * This screen previously listed three report titles with a download icon
 * that did nothing — a control that looks like it works is worse than one
 * that isn't there. Now it renders the real per-class figures for the
 * selected period and exports exactly those rows as CSV, generated in the
 * browser from data already on screen.
 */
export default function PrincipalReports() {
  const [period, setPeriod] = useState<AnalyticsPeriod>("this_month");
  const { school } = useSchoolScope();

  const { data, loading, error, reload } = useAsyncData(() => getSchoolAnalytics(period), [period]);

  const attendance = data?.attendance;
  const hasData = Boolean(attendance && !attendance.noRecords);

  function exportCsv() {
    if (!data) return;
    const name = school?.name ?? "school";
    downloadCsv(`edvia-attendance-${period}-${data.bounds.end}.csv`, attendanceCsv(data, name));
  }

  return (
    <div className="min-h-screen pb-8">
      <TopBar title="Reports" />

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

        {loading && <LoadingState rows={4} label="Building report" />}
        {!loading && error && <ErrorState body={error} onRetry={reload} />}

        {!loading && !error && !hasData && (
          <EmptyState
            icon={FileWarning}
            title="Nothing to report yet"
            body="There are no attendance records in this period, so there is nothing to export."
          />
        )}

        {!loading && !error && hasData && data && (
          <>
            <div className="card mb-4 p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-edvia-100 text-edvia-700">
                  <FileBarChart size={18} />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900">Attendance Report</p>
                  <p className="text-xs text-muted-foreground">
                    {PERIOD_LABELS[period]} · {data.bounds.start} to {data.bounds.end}
                  </p>
                  <p className="mt-2 text-2xl font-bold text-edvia-600">{attendance?.overallPercentage}%</p>
                  <p className="text-xs text-muted-foreground">
                    {attendance?.totalRecords} records across {attendance?.perClass.length}{" "}
                    {attendance?.perClass.length === 1 ? "class" : "classes"}
                  </p>
                </div>
              </div>
              <button
                onClick={exportCsv}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-edvia-500 py-2.5 text-sm font-semibold text-white hover:bg-edvia-600"
              >
                <Download size={15} /> Export CSV
              </button>
            </div>

            <p className="mb-2 text-sm font-semibold text-slate-800">Class Breakdown</p>
            <div className="space-y-2">
              {attendance?.perClass.map((c) => (
                <div key={c.classId} className="card flex items-center justify-between p-3.5">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{c.className}</p>
                    <p className="text-xs text-muted-foreground">{c.total} records</p>
                  </div>
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      c.percentage < 85 ? "text-warning" : "text-success"
                    )}
                  >
                    {c.percentage}%
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
