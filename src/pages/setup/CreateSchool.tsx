import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { TopBar } from "@/layouts/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/app/AuthContext";
import { createSchool } from "@/services/school/schoolAdmin.service";
import { getCurrentUser } from "@/services/firebase/auth.service";
import { cn } from "@/lib/utils";
import type { SchoolType } from "@/types";

// ==========================================================================
// Create a school
// --------------------------------------------------------------------------
// The form that makes EDVIA adoptable without a developer. Four fields, one
// of them required, because the barrier to a school trying this at 9pm has
// to be lower than the barrier to giving up.
//
// The important part is what happens on submit and where it happens: the
// creator becomes the school's administrator, and that grant
// (principalOfSchoolId) is written by api/school/create.ts inside the same
// transaction that creates the school. It cannot be written from here —
// firestore.rules rejects it — which is precisely why "sign up and pick
// Principal" can never be a path to administering a school that already
// exists.
// ==========================================================================

const SCHOOL_TYPES: { value: SchoolType; label: string }[] = [
  { value: "primary", label: "Primary" },
  { value: "secondary", label: "Secondary" },
  { value: "k12", label: "K-12" },
  { value: "college", label: "College" },
  { value: "other", label: "Other" },
];

/** "2026-27" — the shape most schools write their session as. */
function defaultAcademicYear(): string {
  const now = new Date();
  // A school year that starts mid-calendar-year is the common case, so
  // before June the current session is still the one that began last year.
  const startYear = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export default function CreateSchool() {
  const navigate = useNavigate();
  const { setUser } = useAuth();

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [schoolType, setSchoolType] = useState<SchoolType>("k12");
  const [academicYear, setAcademicYear] = useState(defaultAcademicYear());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createSchool({
        name: name.trim(),
        location: location.trim(),
        schoolType,
        academicYear: academicYear.trim() || undefined,
      });
      // The server just rewrote this account's role and grants. Re-read
      // rather than assume: the profile in memory predates the grant, and
      // routing on a stale copy would send a new administrator to a screen
      // their account is not yet allowed to load.
      const refreshed = await getCurrentUser();
      if (refreshed) setUser(refreshed);
      navigate("/principal/invites", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't create the school. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="setup-shell">
      <TopBar title="Create your school" />
      <form onSubmit={submit} className="screen-pad space-y-5 pb-10">
        <p className="text-sm leading-relaxed text-muted-foreground">
          You'll become this school's administrator. Once it's created you can invite teachers with
          a QR code straight away.
        </p>

        <Field label="School name" htmlFor="school-name" required>
          <Input
            id="school-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Robo School"
            maxLength={120}
            required
            autoFocus
          />
        </Field>

        <Field label="Location" htmlFor="school-location" hint="City or district — shown to people joining.">
          <Input
            id="school-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Hyderabad, Telangana"
            maxLength={160}
          />
        </Field>

        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold text-slate-800">School type</legend>
          <div className="flex flex-wrap gap-2">
            {SCHOOL_TYPES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={schoolType === value}
                onClick={() => setSchoolType(value)}
                className={cn(
                  "min-h-[44px] rounded-full border px-4 text-[13px] font-semibold transition-colors",
                  schoolType === value
                    ? "border-edvia-500 bg-edvia-500 text-white"
                    : "border-border bg-surface text-slate-700 hover:border-edvia-300"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <Field label="Academic year" htmlFor="school-year" hint="Used to label classes and reports.">
          <Input
            id="school-year"
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            placeholder="2026-27"
            maxLength={20}
          />
        </Field>

        {error && (
          <p role="alert" className="rounded-xl bg-danger/8 px-3 py-2.5 text-[13px] text-danger">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={saving || !name.trim()}>
          {saving ? (
            <>
              <Loader2 size={17} className="mr-2 animate-spin" /> Creating school…
            </>
          ) : (
            "Create school"
          )}
        </Button>
      </form>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-semibold text-slate-800">
        {label}
        {!required && <span className="ml-1.5 font-normal text-muted-foreground">(optional)</span>}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-[12px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
