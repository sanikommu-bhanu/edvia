import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, MapPin, ChevronRight, School as SchoolIcon } from "lucide-react";
import { TopBar } from "@/layouts/TopBar";
import { Input } from "@/components/ui/input";
import { listSchools } from "@/services/school/school.service";
import { updateUserProfile } from "@/services/firebase/auth.service";
import { useAuth } from "@/app/AuthContext";
import type { School } from "@/types";

export default function SchoolSelection() {
  const [query, setQuery] = useState("");
  const [schools, setSchools] = useState<School[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user, setUser } = useAuth();

  useEffect(() => {
    listSchools(query).then(setSchools);
  }, [query]);

  async function choose(school: School) {
    if (saving) return;
    setSaving(school.id);
    setError(null);
    try {
      if (user) {
        const updated = await updateUserProfile(user.uid, { schoolId: school.id });
        setUser(updated);
      }
      navigate("/language-selection");
    } catch {
      // Never advance on a failed write — the rest of onboarding depends on
      // schoolId actually being saved.
      setError("We couldn't save your school just now. Please try again.");
      setSaving(null);
    }
  }

  return (
    <div className="setup-shell">
      <TopBar title="Select Your School" />
      <div className="screen-pad">
        <p className="mb-4 text-sm text-muted-foreground">Choose your school to continue</p>
        <div className="relative mb-5">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search school…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" />
        </div>

        {error && <p className="mb-3 text-sm text-danger">{error}</p>}

        <div className="space-y-3">
          {schools.map((school) => (
            <button
              key={school.id}
              onClick={() => choose(school)}
              disabled={Boolean(saving)}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-left shadow-soft transition-colors hover:border-edvia-300 disabled:opacity-60"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-edvia-100 text-edvia-700">
                <SchoolIcon size={20} />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-900">{school.name}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin size={12} /> {school.location}
                </p>
              </div>
              {saving === school.id ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-edvia-200 border-t-edvia-500" />
              ) : (
                <ChevronRight size={18} className="text-muted-foreground" />
              )}
            </button>
          ))}
          {schools.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No schools match your search.</p>}
        </div>

        <button className="mt-6 w-full text-center text-sm font-medium text-edvia-600">My school is not listed</button>
      </div>
    </div>
  );
}
