import { useState } from "react";
import { TopBar } from "@/layouts/TopBar";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Search, Users } from "lucide-react";
import { ClassPicker } from "@/components/shared/ClassPicker";
import { EmptyState, LoadingState, ErrorState } from "@/components/shared/StateViews";
import { useSchoolScope } from "@/app/SchoolContext";
import { useAsyncData } from "@/hooks/useAsyncData";
import { listClassStudents } from "@/services/school/school.service";

/** Roster for the class the teacher currently has selected. */
export default function StudentsList() {
  const [query, setQuery] = useState("");
  const { activeClassId, loading: scopeLoading, reload } = useSchoolScope();

  const { data, loading, error } = useAsyncData(
    () => (activeClassId ? listClassStudents(activeClassId) : Promise.resolve([])),
    [activeClassId],
    { enabled: Boolean(activeClassId) }
  );

  const busy = scopeLoading || loading;
  const needle = query.trim().toLowerCase();
  const students = (data ?? [])
    .filter((s) => !needle || s.fullName.toLowerCase().includes(needle) || s.rollNumber.includes(needle))
    .sort((a, b) => a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true }));

  return (
    <div className="min-h-screen pb-8">
      <TopBar title="Students" />
      <ClassPicker />
      <div className="screen-pad !pt-0">
        <div className="relative mb-4">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or roll number…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="space-y-2.5">
          {busy && <LoadingState rows={5} label="Loading roster" />}
          {!busy && error && <ErrorState body={error} onRetry={reload} />}
          {!busy && !error && students.length === 0 && (
            <EmptyState
              icon={Users}
              title={needle ? "No matches" : "No students yet"}
              body={
                needle
                  ? "No student in this class matches that search."
                  : "This class does not have any students on its roster yet."
              }
            />
          )}
          {!busy &&
            !error &&
            students.map((s) => (
              <div key={s.id} className="card flex items-center gap-3 p-3.5">
                <Avatar name={s.fullName} size={40} />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900">{s.fullName}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.className} · Roll {s.rollNumber}
                  </p>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
