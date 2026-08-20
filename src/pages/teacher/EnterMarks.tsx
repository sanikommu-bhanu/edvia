import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ClipboardList, Users } from "lucide-react";
import { TopBar } from "@/layouts/TopBar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/shared/StatCard";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/StateViews";
import { useSchoolScope } from "@/app/SchoolContext";
import { useAsyncData } from "@/hooks/useAsyncData";
import { listClassStudents } from "@/services/school/school.service";
import { listExams } from "@/services/exams.service";
import { getExamResultsByStudent, recordExamMarks } from "@/services/grades.service";
import { bandFor, bandLabel, percentageFor, validateScore, weightedAggregate } from "@/lib/gradeMath";
import { formatDate } from "@/lib/utils";
import type { ExamResult } from "@/types";

// ==========================================================================
// Enter Marks
// --------------------------------------------------------------------------
// Select class → select exam → enter each student's mark → save.
//
// Three behaviours that decide whether a teacher trusts this screen:
//
//   1. It loads whatever is ALREADY recorded for the chosen paper and starts
//      from that, so opening the screen to fix one student's mark doesn't
//      blank the rest. Same reasoning as the attendance register.
//   2. A mark outside 0..maxScore is refused in the field, before Save is
//      even enabled — and refused again by the API and by the School
//      Service. Three layers, one rule (gradeMath.validateScore).
//   3. "Saved" appears only after the server confirms the write, and says
//      how many marks were AMENDED versus created. Nothing is reported
//      optimistically.
// ==========================================================================

const BAND_TONE = {
  excellent: "success",
  good: "brand",
  satisfactory: "warning",
  needs_support: "danger",
} as const;

export default function EnterMarks() {
  const { classId: routeClassId } = useParams();
  const { classes, activeClassId, loading: scopeLoading } = useSchoolScope();
  const classId = routeClassId ?? activeClassId ?? null;
  const klass = classes.find((c) => c.id === classId);

  const [examId, setExamId] = useState<string>("");
  const [maxScore, setMaxScore] = useState(100);
  /** Raw strings, not numbers: an empty field means "not entered", not zero. */
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsyncData(
    async () => {
      if (!classId) return null;
      const [students, exams] = await Promise.all([listClassStudents(classId), listExams(classId)]);
      return {
        students: [...students].sort((a, b) =>
          a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true })
        ),
        exams: [...exams].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
      };
    },
    [classId],
    { enabled: Boolean(classId) }
  );

  // Memoised rather than `data?.students ?? []` inline: a fresh [] on every
  // render would re-run the effects below (and clear marks the teacher just
  // typed) on any unrelated state change.
  const students = useMemo(() => data?.students ?? [], [data]);
  const exams = useMemo(() => data?.exams ?? [], [data]);
  const selectedExam = exams.find((e) => e.id === examId) ?? null;

  // Default to the most recent paper once exams arrive, so the teacher lands
  // on the one they are most likely to be marking.
  useEffect(() => {
    if (!examId && exams.length > 0) setExamId(exams[0].id);
  }, [exams, examId]);

  // Whatever is already recorded for this paper.
  const existing = useAsyncData<Record<string, ExamResult>>(
    () => (examId ? getExamResultsByStudent(examId) : Promise.resolve({})),
    [examId],
    { enabled: Boolean(examId) }
  );

  useEffect(() => {
    if (!existing.data) return;
    const recorded = existing.data;
    setMarks(
      Object.fromEntries(
        students.map((s) => [s.id, recorded[s.id] ? String(recorded[s.id].score) : ""])
      )
    );
    // A paper's maximum is a property of the paper, so adopt whatever was
    // recorded rather than resetting every teacher to 100.
    const firstRecorded = Object.values(recorded)[0];
    if (firstRecorded) setMaxScore(firstRecorded.maxScore);
    setSaveResult(null);
    setSaveError(null);
  }, [existing.data, students]);

  const entered = useMemo(
    () =>
      students
        .map((s) => ({ studentId: s.id, raw: marks[s.id] ?? "" }))
        .filter((e) => e.raw.trim() !== "")
        .map((e) => ({ studentId: e.studentId, score: Number(e.raw) })),
    [students, marks]
  );

  const invalidCount = entered.filter((e) => !validateScore(e.score, maxScore).valid).length;
  const alreadyRecorded = Object.keys(existing.data ?? {}).length;
  const classAggregate = weightedAggregate(entered.map((e) => ({ score: e.score, maxScore })));
  const busy = scopeLoading || loading;
  const canSave = Boolean(examId) && entered.length > 0 && invalidCount === 0 && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setSaveResult(null);
    setSaveError(null);
    try {
      const response = await recordExamMarks({ examId, maxScore, entries: entered });
      // Reported only after the server confirms — never optimistically.
      setSaveResult(
        response.amended > 0
          ? `Saved ${response.count} marks (${response.amended} changed).`
          : `Saved ${response.count} marks.`
      );
      existing.reload();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "We couldn't save those marks. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!busy && !classId) {
    return (
      <div className="min-h-screen">
        <TopBar title="Enter Marks" showBack />
        <div className="screen-pad !pt-0">
          <EmptyState icon={Users} title="No class selected" body="Pick one of your classes to enter marks." />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen has-action-bar">
      <TopBar title="Enter Marks" showBack />

      <div className="screen-pad !pt-0">
        <p className="mb-3 text-sm font-medium text-slate-800">{klass?.className ?? "Class"}</p>

        {busy && <LoadingState rows={3} label="Loading exams" />}
        {!busy && error && <ErrorState body={error} onRetry={reload} />}

        {!busy && !error && exams.length === 0 && (
          <EmptyState
            icon={ClipboardList}
            title="No exams for this class"
            body="Marks are recorded against a scheduled exam. Once one exists for this class, it appears here."
          />
        )}

        {!busy && !error && exams.length > 0 && (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Exam</span>
              <select
                value={examId}
                onChange={(e) => setExamId(e.target.value)}
                // 16px text and a 44px control: a select a teacher taps between
                // classes must not zoom the viewport on iOS.
                className="min-h-[44px] w-full rounded-xl border border-border bg-surface px-3 text-base text-slate-800 outline-none focus:border-edvia-400 lg:text-[15px]"
              >
                {exams.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} · {e.subject}
                    {e.date ? ` · ${formatDate(e.date)}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Maximum marks</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={1000}
                value={maxScore}
                onChange={(e) => setMaxScore(Math.max(1, Number(e.target.value) || 1))}
                className="min-h-[44px] w-full rounded-xl border border-border bg-surface px-3 text-base text-slate-800 outline-none focus:border-edvia-400 lg:text-[15px]"
              />
            </label>

            {alreadyRecorded > 0 && (
              <p className="rounded-lg bg-edvia-50 px-3 py-2 text-xs text-edvia-700">
                {alreadyRecorded} of {students.length} already recorded for this paper — you're editing saved
                marks.
              </p>
            )}

            <div className="flex gap-2.5">
              <StatCard value={students.length} label="Students" />
              <StatCard value={entered.length} label="Entered" tone="brand" />
              <StatCard
                value={entered.length ? `${classAggregate.percentage}%` : "—"}
                label="Class avg"
                tone="success"
              />
            </div>
          </div>
        )}
      </div>

      {!busy && !error && exams.length > 0 && (
        <div className="screen-pad space-y-2 pb-6">
          {existing.loading && <LoadingState rows={4} label="Loading recorded marks" />}
          {!existing.loading && students.length === 0 && (
            <EmptyState icon={Users} title="No students" body="This class has no students on its roster yet." />
          )}
          {!existing.loading &&
            students.map((s) => {
              const raw = marks[s.id] ?? "";
              const score = Number(raw);
              const hasValue = raw.trim() !== "";
              const check = hasValue ? validateScore(score, maxScore) : { valid: true };
              const pct = hasValue && check.valid ? percentageFor(score, maxScore) : null;

              return (
                <div key={s.id} className="card p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{s.fullName}</p>
                      <p className="text-xs text-muted-foreground">Roll {s.rollNumber}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={maxScore}
                        value={raw}
                        onChange={(e) => setMarks((p) => ({ ...p, [s.id]: e.target.value }))}
                        aria-label={`Marks for ${s.fullName} out of ${maxScore}`}
                        aria-invalid={!check.valid}
                        className={`h-11 w-20 rounded-xl border bg-surface px-2 text-center text-base text-slate-900 outline-none lg:text-[15px] ${
                          check.valid ? "border-border focus:border-edvia-400" : "border-danger"
                        }`}
                      />
                      <span className="w-10 text-xs text-muted-foreground">/ {maxScore}</span>
                      {pct !== null && <Badge tone={BAND_TONE[bandFor(pct)]}>{pct}%</Badge>}
                    </div>
                  </div>
                  {!check.valid && <p className="mt-1.5 text-xs text-danger">{check.reason}</p>}
                  {pct !== null && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">{bandLabel(pct)}</p>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {!busy && !error && exams.length > 0 && (
        <div className="action-bar">
          {saveResult && <p className="mb-2 text-center text-xs font-medium text-success">{saveResult}</p>}
          {saveError && <p className="mb-2 text-center text-xs font-medium text-danger">{saveError}</p>}
          {invalidCount > 0 && (
            <p className="mb-2 text-center text-xs font-medium text-danger">
              {invalidCount} mark{invalidCount === 1 ? " is" : "s are"} out of range — fix them before saving.
            </p>
          )}
          <Button size="lg" className="w-full" onClick={() => void save()} disabled={!canSave}>
            {saving ? "Saving…" : `Save ${entered.length} Mark${entered.length === 1 ? "" : "s"}`}
          </Button>
          {selectedExam && (
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              {selectedExam.title} · {selectedExam.subject}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
