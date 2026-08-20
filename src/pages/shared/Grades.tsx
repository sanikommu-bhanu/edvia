import { GraduationCap } from "lucide-react";
import { TopBar } from "@/layouts/TopBar";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatCard } from "@/components/shared/StatCard";
import { ClassPicker } from "@/components/shared/ClassPicker";
import { EmptyState, LoadingState, ErrorState } from "@/components/shared/StateViews";
import { useAuth } from "@/app/AuthContext";
import { useSchoolScope } from "@/app/SchoolContext";
import { useAsyncData } from "@/hooks/useAsyncData";
import { getStudentGrades } from "@/services/grades.service";
import { bandFor, bandLabel } from "@/lib/gradeMath";
import { formatDate } from "@/lib/utils";

// ==========================================================================
// Grades — one screen, two roles
// --------------------------------------------------------------------------
// A student sees their own results; a parent sees the child currently
// selected in SchoolContext, and gets the child switcher (ClassPicker) when
// they have more than one. There is no studentId in the URL and none in a
// query string: the subject is whatever the AUTHENTICATED profile resolves
// to, so there is no id for a curious parent to edit.
//
// firestore.rules back that up independently — a read of another student's
// examResults document fails at the database, not in this component.
// ==========================================================================

/** Band → the tone the badge and bar share, so colour never contradicts text. */
const BAND_TONE = {
  excellent: "success",
  good: "brand",
  satisfactory: "warning",
  needs_support: "danger",
} as const;

export default function Grades() {
  const { user } = useAuth();
  const { student, loading: scopeLoading, reload: reloadScope } = useSchoolScope();
  const isParent = user?.role === "parent";

  const { data, loading, error, reload } = useAsyncData(
    () => (student ? getStudentGrades(student.id) : Promise.resolve(null)),
    [student?.id],
    { enabled: Boolean(student) }
  );

  const busy = scopeLoading || loading;
  const overall = data?.overall.percentage ?? 0;
  const band = bandFor(overall);

  return (
    <div className="min-h-screen pb-8">
      <TopBar title={isParent ? "Child's Grades" : "Grades"} />
      {/* Renders the child switcher for a parent with more than one child. */}
      <ClassPicker />

      <div className="screen-pad !pt-0 space-y-4">
        {busy && <LoadingState rows={4} label="Loading results" />}
        {!busy && error && <ErrorState body={error} onRetry={reload} />}

        {!busy && !error && !student && (
          <EmptyState
            icon={GraduationCap}
            title="No student linked yet"
            body="Redeem the invite code your school issued to link this account to a student record."
            action={{ label: "Reload", onClick: reloadScope }}
          />
        )}

        {!busy && !error && student && data?.noRecords && (
          <EmptyState
            icon={GraduationCap}
            title="No results yet"
            body={`No exam marks have been recorded for ${student.fullName} yet. They appear here as soon as a teacher enters them.`}
          />
        )}

        {!busy && !error && data && !data.noRecords && (
          <>
            {/* ---- overall ------------------------------------------------ */}
            <div className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{student?.fullName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {student?.className} · {data.overall.count} paper{data.overall.count === 1 ? "" : "s"}
                  </p>
                </div>
                <Badge tone={BAND_TONE[band]}>{bandLabel(overall)}</Badge>
              </div>

              <div className="mt-4 flex items-end justify-between">
                <span className="text-3xl font-bold text-slate-900">{overall}%</span>
                <span className="text-xs text-muted-foreground">
                  {data.overall.totalScore} / {data.overall.totalMax} marks
                </span>
              </div>
              <ProgressBar value={overall} tone={BAND_TONE[band]} className="mt-2" />
              <p className="mt-2 text-[11px] text-muted-foreground">
                Weighted across every recorded paper — a 100-mark exam counts for more than a 10-mark test.
              </p>
            </div>

            <div className="flex gap-2.5">
              <StatCard value={data.bySubject.length} label="Subjects" />
              <StatCard value={data.overall.count} label="Papers" />
              <StatCard
                value={`${data.bySubject[0]?.percentage ?? 0}%`}
                label={data.bySubject[0]?.subject ?? "Best"}
                tone="success"
              />
            </div>

            {/* ---- by subject --------------------------------------------- */}
            <section>
              <h2 className="mb-2 text-sm font-semibold text-slate-800">By Subject</h2>
              <div className="space-y-2.5">
                {data.bySubject.map((s) => {
                  const subjectBand = bandFor(s.percentage);
                  return (
                    <div key={s.subject} className="card p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-semibold text-slate-900">{s.subject}</p>
                        <span className="shrink-0 text-sm font-semibold text-slate-900">{s.percentage}%</span>
                      </div>
                      <ProgressBar value={s.percentage} tone={BAND_TONE[subjectBand]} className="mt-2" />
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        {s.totalScore}/{s.totalMax} across {s.count} paper{s.count === 1 ? "" : "s"} ·{" "}
                        {bandLabel(s.percentage)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ---- individual papers -------------------------------------- */}
            <section>
              <h2 className="mb-2 text-sm font-semibold text-slate-800">Exam Results</h2>
              <div className="space-y-2.5">
                {data.results.map((r) => (
                  <div key={r.examId} className="card flex items-center justify-between gap-3 p-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{r.examTitle}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.subject}
                        {r.examDate ? ` · ${formatDate(r.examDate)}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-slate-900">
                        {r.score}
                        <span className="text-xs font-normal text-muted-foreground">/{r.maxScore}</span>
                      </p>
                      <Badge tone={BAND_TONE[bandFor(r.percentage)]}>{r.percentage}%</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
