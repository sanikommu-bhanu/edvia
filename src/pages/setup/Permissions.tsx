import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, Camera, BellRing, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/app/AuthContext";
import { updateUserProfile } from "@/services/firebase/auth.service";
import { cn } from "@/lib/utils";

type PermissionKey = "microphone" | "camera" | "notifications";

const PERMISSIONS: { key: PermissionKey; icon: typeof Mic; title: string; reason: string }[] = [
  { key: "microphone", icon: Mic, title: "Microphone", reason: "So you can talk to EDVIA in voice mode." },
  { key: "camera", icon: Camera, title: "Camera", reason: "So you can scan homework and school documents." },
  { key: "notifications", icon: BellRing, title: "Notifications", reason: "So EDVIA can remind you about assignments, exams, and school notices." },
];

export default function Permissions() {
  const [granted, setGranted] = useState<Record<PermissionKey, boolean>>({ microphone: false, camera: false, notifications: false });
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user, setUser } = useAuth();

  async function requestPermission(key: PermissionKey) {
    try {
      if (key === "microphone") {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        setGranted((g) => ({ ...g, microphone: true }));
      } else if (key === "camera") {
        await navigator.mediaDevices.getUserMedia({ video: true });
        setGranted((g) => ({ ...g, camera: true }));
      } else if (key === "notifications") {
        if ("Notification" in window) {
          const result = await Notification.requestPermission();
          setGranted((g) => ({ ...g, notifications: result === "granted" }));
        }
      }
    } catch {
      // Permission denied or unavailable — reflect actual device state, never fake it.
      setGranted((g) => ({ ...g, [key]: false }));
    }
  }

  /**
   * Marks onboarding complete and lands on the role dashboard.
   *
   * Guarded because this is the last write of the signup journey: if it
   * fails silently the user is dropped on a screen with a dead button and no
   * explanation, having done everything asked of them. A failure here is
   * recoverable — they simply try again — but only if they are told.
   */
  async function finish() {
    if (!user || finishing) return;
    setFinishing(true);
    setError(null);
    try {
      const updated = await updateUserProfile(user.uid, { onboardingComplete: true });
      setUser(updated);
      navigate(`/${updated.role}`);
    } catch {
      setError("We couldn't finish setting up your account just now. Please try again.");
    } finally {
      setFinishing(false);
    }
  }

  return (
    <div className="setup-shell flex flex-col justify-between px-6 py-10">
      <div>
        <h1 className="font-display text-2xl font-bold">Enable Permissions</h1>
        <p className="mt-1 text-sm text-muted-foreground">EDVIA only asks for what it actually needs, when it needs it.</p>

        <div className="mt-8 space-y-4">
          {PERMISSIONS.map(({ key, icon: Icon, title, reason }) => (
            <div key={key} className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-soft">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-edvia-100 text-edvia-700">
                <Icon size={18} />
              </span>
              <div className="flex-1">
                <p className="font-semibold text-slate-900">{title}</p>
                <p className="text-xs text-muted-foreground">{reason}</p>
              </div>
              <button
                onClick={() => requestPermission(key)}
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                  granted[key] ? "border-success bg-success/10 text-success" : "border-border text-muted-foreground"
                )}
                aria-label={`Allow ${title}`}
              >
                {granted[key] ? <Check size={16} /> : null}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {error && (
          <p className="text-center text-xs font-medium text-danger" role="alert">
            {error}
          </p>
        )}
        <Button
          size="lg"
          className="w-full"
          disabled={finishing}
          onClick={() => {
            void (async () => {
              for (const p of PERMISSIONS) await requestPermission(p.key);
              await finish();
            })();
          }}
        >
          {finishing ? "Finishing…" : "Allow All"}
        </Button>
        <Button
          variant="ghost"
          size="lg"
          className="w-full"
          disabled={finishing}
          onClick={() => void finish()}
        >
          Not Now
        </Button>
      </div>
    </div>
  );
}
