import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar } from "@/layouts/TopBar";
import { Button } from "@/components/ui/button";
import { LANGUAGES } from "@/config/languages";
import { updateUserProfile } from "@/services/firebase/auth.service";
import { useAuth } from "@/app/AuthContext";
import { cn } from "@/lib/utils";
import type { LanguageCode } from "@/types";

export default function LanguageSelection() {
  const [selected, setSelected] = useState<LanguageCode>("en");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user, setUser } = useAuth();

  /**
   * Never advance on a failed write.
   *
   * The chosen language is what every subsequent screen and every AI reply
   * is rendered in. Walking the user forward after the profile write failed
   * would leave them in an English app that believes it is in Tamil — and
   * with no way to tell that anything went wrong.
   */
  async function proceed() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      if (user) {
        const updated = await updateUserProfile(user.uid, { language: selected });
        setUser(updated);
      }
      navigate("/invite-code");
    } catch {
      setError("We couldn't save your language choice just now. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-shell min-h-screen">
      <TopBar title="Choose Language" />
      <div className="screen-pad pb-28">
        <p className="mb-4 text-sm text-muted-foreground">Select your preferred language</p>
        <div className="space-y-2.5">
          {LANGUAGES.map((lang) => {
            const isSelected = selected === lang.code;
            return (
              <button
                key={lang.code}
                onClick={() => setSelected(lang.code)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl border bg-surface px-4 py-3.5 text-left transition-colors",
                  isSelected ? "border-edvia-400 ring-2 ring-edvia-100" : "border-border"
                )}
              >
                <div>
                  <p className="font-medium text-slate-900">{lang.nativeName}</p>
                  <p className="text-xs text-muted-foreground">{lang.englishName}</p>
                </div>
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full border-2",
                    isSelected ? "border-edvia-500 bg-edvia-500" : "border-border"
                  )}
                >
                  {isSelected && <span className="h-2 w-2 rounded-full bg-white" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-[480px] border-t border-border bg-surface p-4">
        {error && (
          <p className="mb-2 text-center text-xs font-medium text-danger" role="alert">
            {error}
          </p>
        )}
        <Button size="lg" className="w-full" onClick={() => void proceed()} disabled={saving}>
          {saving ? "Saving…" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
