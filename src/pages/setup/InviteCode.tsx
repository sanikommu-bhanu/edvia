import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { TopBar } from "@/layouts/TopBar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/app/AuthContext";
import { redeemInviteCode } from "@/services/onboarding/inviteCode.service";
import { getCurrentUser } from "@/services/firebase/auth.service";

const COPY: Record<string, { title: string; body: string; placeholder: string }> = {
  student: {
    title: "Link your student record",
    body: "Enter the invite code your school gave you. This connects your account to your actual grades, attendance, and assignments.",
    placeholder: "e.g. GISD-STU-7F3K2",
  },
  parent: {
    title: "Link your child",
    body: "Enter the invite code your school gave you for your child. You can add more children later from your profile.",
    placeholder: "e.g. GISD-PAR-9K2M1",
  },
  teacher: {
    title: "Link your class",
    body: "Enter the invite code your school gave you. This assigns you as the teacher for your class.",
    placeholder: "e.g. GISD-TCH-4M8P0",
  },
  principal: {
    title: "You're all set",
    body: "Principal accounts don't need an invite code — your school access is already linked.",
    placeholder: "",
  },
};

export default function InviteCode() {
  const { user, setUser } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const role = user?.role ?? "student";
  const copy = COPY[role];
  const skipTarget = user?.onboardingComplete ? `/${role}` : "/edvia-onboarding";

  async function submit() {
    if (!code.trim()) return;
    setError(null);
    setLoading(true);
    try {
      await redeemInviteCode(code.trim());
      // Refresh the local profile from Firestore so linkedStudentIds/
      // studentId/teacherId (set server-side by the redeem endpoint) are
      // reflected immediately — otherwise the AI assistant would still see
      // the stale pre-redemption profile until the next full page load.
      const refreshed = await getCurrentUser();
      if (refreshed) setUser(refreshed);
      navigate(skipTarget);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell min-h-screen">
      <TopBar title="Invite Code" />
      <div className="screen-pad flex flex-col items-center pt-6 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-edvia-100 text-edvia-700">
          <KeyRound size={28} />
        </span>
        <h1 className="mt-4 font-display text-xl font-bold">{copy.title}</h1>
        <p className="mt-2 max-w-[320px] text-sm text-muted-foreground">{copy.body}</p>

        {role !== "principal" && (
          <div className="mt-6 w-full space-y-3 text-left">
            <Input
              placeholder={copy.placeholder}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setError(null);
              }}
              className="text-center uppercase tracking-wider"
              autoCapitalize="characters"
            />
            {error && <p className="text-center text-sm text-danger">{error}</p>}
          </div>
        )}

        <div className="mt-8 w-full space-y-3">
          {role !== "principal" ? (
            <Button size="lg" className="w-full" disabled={!code.trim() || loading} onClick={submit}>
              {loading ? "Linking…" : "Link Account"}
            </Button>
          ) : (
            <Button size="lg" className="w-full" onClick={() => navigate(skipTarget)}>
              Continue
            </Button>
          )}
          {role !== "principal" && (
            <Button variant="ghost" size="lg" className="w-full" onClick={() => navigate(skipTarget)}>
              I don&apos;t have a code yet
            </Button>
          )}
        </div>
        {role !== "principal" && (
          <p className="mt-4 text-xs text-muted-foreground">
            You can add this anytime from Profile → Link Account. Some features (like asking EDVIA about your{" "}
            {role === "teacher" ? "class" : role === "parent" ? "child" : "grades"}) won&apos;t work until then.
          </p>
        )}
      </div>
    </div>
  );
}
