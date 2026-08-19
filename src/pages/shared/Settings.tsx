import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Globe2, Bell, Mic, ShieldCheck, KeyRound, ChevronRight, Check } from "lucide-react";
import { TopBar } from "@/layouts/TopBar";
import { useAuth } from "@/app/AuthContext";
import { updateUserProfile, sendPasswordReset } from "@/services/firebase/auth.service";
import { LANGUAGES } from "@/config/languages";
import { cn } from "@/lib/utils";
import type { LanguageCode } from "@/types";

/**
 * Account settings.
 *
 * Every control here does something real. The language selector writes to
 * the profile document the AI orchestrator reads, so changing it here
 * genuinely changes the language EDVIA replies in on the next turn. There
 * are no decorative toggles: a switch that looks like a preference but
 * persists nothing is worse than no switch.
 */
export default function Settings() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [savingLanguage, setSavingLanguage] = useState<LanguageCode | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [micState, setMicState] = useState<PermissionState | "unknown">("unknown");

  async function chooseLanguage(code: LanguageCode) {
    if (!user || code === user.language) return;
    setSavingLanguage(code);
    setError(null);
    setStatus(null);
    try {
      const updated = await updateUserProfile(user.uid, { language: code });
      setUser(updated);
      setStatus("Language updated. EDVIA will reply in your new language.");
    } catch {
      setError("We couldn't save that. Please try again.");
    } finally {
      setSavingLanguage(null);
    }
  }

  async function checkMicrophone() {
    setError(null);
    try {
      // Query first — asking for the stream when it's already granted would
      // pop a needless prompt on some browsers.
      const permissions = navigator.permissions as
        | { query?: (opts: { name: PermissionName }) => Promise<PermissionStatus> }
        | undefined;
      if (permissions?.query) {
        const result = await permissions.query({ name: "microphone" as PermissionName });
        setMicState(result.state);
        if (result.state === "granted") return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicState("granted");
      setStatus("Microphone access granted — voice mode is ready.");
    } catch {
      setMicState("denied");
      setError("Microphone access is blocked. You can enable it in your browser's site settings; chat still works.");
    }
  }

  async function resetPassword() {
    if (!user?.email) return;
    setError(null);
    try {
      await sendPasswordReset(user.email);
      setStatus(`Password reset email sent to ${user.email}.`);
    } catch {
      setError("We couldn't send the reset email right now.");
    }
  }

  return (
    <div className="min-h-screen pb-8">
      <TopBar title="Settings" showBack />

      <div className="screen-pad !pt-0">
        {status && <p className="mb-3 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{status}</p>}
        {error && <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

        <Section icon={Globe2} title="Language" body="The language EDVIA speaks and writes to you in.">
          <div className="mt-3 grid grid-cols-2 gap-2">
            {LANGUAGES.map((option) => {
              const active = user?.language === option.code;
              return (
                <button
                  key={option.code}
                  onClick={() => void chooseLanguage(option.code)}
                  disabled={savingLanguage !== null}
                  className={cn(
                    "flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-60",
                    active ? "border-edvia-400 bg-edvia-50 text-edvia-800" : "border-border bg-surface text-slate-700"
                  )}
                >
                  <span>
                    <span className="block font-medium">{option.nativeName}</span>
                    <span className="block text-[11px] text-muted-foreground">{option.englishName}</span>
                  </span>
                  {savingLanguage === option.code ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-edvia-200 border-t-edvia-500" />
                  ) : (
                    active && <Check size={15} className="text-edvia-600" />
                  )}
                </button>
              );
            })}
          </div>
        </Section>

        <Section icon={Mic} title="Voice" body="Voice mode needs microphone access. Chat always works without it.">
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => void checkMicrophone()}
              className="rounded-full bg-edvia-500 px-4 py-2 text-xs font-semibold text-white hover:bg-edvia-600"
            >
              {micState === "granted" ? "Re-check access" : "Enable microphone"}
            </button>
            <span className="text-xs text-muted-foreground">
              {micState === "granted"
                ? "Granted"
                : micState === "denied"
                  ? "Blocked in browser settings"
                  : micState === "prompt"
                    ? "Not yet granted"
                    : "Not checked"}
            </span>
          </div>
        </Section>

        <Section icon={ShieldCheck} title="Privacy and security" body="How EDVIA handles your school data.">
          <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
            <li>• EDVIA only ever reads records your account is authorised for.</li>
            <li>• Every change it makes is recorded in your school's audit trail.</li>
            <li>• Conversations are stored so EDVIA can follow context, and are never shared with other families.</li>
            <li>• Asking EDVIA to act as another role does not change what it can access.</li>
          </ul>
        </Section>

        <Section icon={KeyRound} title="Account" body={user?.email ?? "Signed in"}>
          <div className="mt-3 space-y-2">
            <RowButton label="Send password reset email" onClick={() => void resetPassword()} />
            {user?.role !== "principal" && (
              <RowButton label="Link account with an invite code" onClick={() => navigate("/invite-code")} />
            )}
            <RowButton label="Notification preferences" onClick={() => navigate("/notifications")} icon={Bell} />
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon: typeof Globe2;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="card mb-3 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-edvia-100 text-edvia-700">
          <Icon size={16} />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function RowButton({ label, onClick, icon: Icon }: { label: string; onClick: () => void; icon?: typeof Bell }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-left text-sm text-slate-700 hover:border-edvia-300"
    >
      {Icon && <Icon size={14} className="text-muted-foreground" />}
      <span className="flex-1">{label}</span>
      <ChevronRight size={15} className="text-muted-foreground" />
    </button>
  );
}
