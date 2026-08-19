import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  signIn,
  signInWithGoogle,
  completeGoogleRedirect,
  GoogleSignInCancelled,
  GoogleSignInRedirecting,
} from "@/services/firebase/auth.service";
import { useAuth } from "@/app/AuthContext";
import { EdviaOrb } from "@/components/shared/EdviaOrb";
import { useOrbSize } from "@/hooks/useOrbSize";
import { GoogleButton, AuthDivider } from "@/components/shared/GoogleButton";
import { useSlowRequestHint } from "@/hooks/useSlowRequestHint";
import { readPendingRole } from "@/config/roles";
import { readPendingInvite } from "@/services/onboarding/join.service";
import type { UserProfile } from "@/types";

// ==========================================================================
// Sign in
// --------------------------------------------------------------------------
// Email and password, plus Google. Deliberately nothing else: every extra
// provider is another failure mode to explain to a parent on a bus.
//
// The two paths share one `land()` so a Google user and an email user reach
// the same next screen by the same rule — the account's real
// onboardingComplete flag, never an assumption about which path they took.
//
// The orb changes state with the request: idle while the form is at rest,
// verifying while credentials are in flight, error when one comes back
// wrong. It is the same signal as the spinner, at a size you can see from
// across a room, and it costs nothing extra to render.
// ==========================================================================

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  // Set only while the tab is on its way to Google. The spinner has to stay
  // up through it — clearing it would show a working sign-in form for the
  // moment before the browser navigates away, which reads as a failure.
  const [redirecting, setRedirecting] = useState(false);
  // Starts true: a page load might be the RETURN half of a redirect sign-in,
  // and until getRedirectResult has answered we do not know. Rendering the
  // form immediately would show "sign in" to someone who just did.
  const [resumingRedirect, setResumingRedirect] = useState(true);
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const orbSize = useOrbSize(0.22, 76, 100);

  const busy = loading || googleLoading || redirecting;
  const slow = useSlowRequestHint(busy);

  function land(user: UserProfile) {
    setUser(user);
    // Someone who arrived from a QR and was bounced here to sign in must go
    // BACK to their invitation, not onwards to a dashboard. Dropping them on
    // /welcome would leave the invitation quietly unredeemed, which is the
    // single most likely way the whole join flow fails in practice.
    if (readPendingInvite()) {
      navigate("/join", { replace: true });
      return;
    }
    // schoolId is the real signal, not onboardingComplete: an account that
    // belongs to no school has nothing to show on a dashboard, and one that
    // does is finished regardless of which onboarding screens it saw.
    navigate(user.schoolId ? `/${user.role}` : "/welcome");
  }

  // Picks up a Google sign-in that went via full-page redirect. Returns null
  // and costs nothing on an ordinary load.
  useEffect(() => {
    let cancelled = false;
    completeGoogleRedirect(readPendingRole())
      .then((user) => {
        if (cancelled) return;
        if (user) land(user);
        else setResumingRedirect(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Google sign-in couldn't be completed.");
        setResumingRedirect(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Guards a double submit from a second tap while the first is in flight,
    // which on a slow connection is exactly when it happens.
    if (busy) return;
    setError(null);
    setLoading(true);
    try {
      land(await signIn({ email, password }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    if (busy) return;
    setError(null);
    setGoogleLoading(true);
    try {
      land(await signInWithGoogle(readPendingRole()));
    } catch (err) {
      // A cancelled popup is a decision, not a failure — showing a red error
      // for it trains people to distrust the error area.
      if (err instanceof GoogleSignInRedirecting) {
        // Popup was unavailable; the tab is navigating to Google. Hold the
        // spinner and show nothing else — this is not a failure.
        setRedirecting(true);
        return;
      }
      if (!(err instanceof GoogleSignInCancelled)) {
        setError(err instanceof Error ? err.message : "Google sign-in couldn't be completed.");
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  if (resumingRedirect) {
    return (
      <div className="screen">
        <div className="aurora" aria-hidden="true" />
        <div className="aurora-content screen-body items-center justify-center py-8 text-center">
          <EdviaOrb size={orbSize} state="verifying" label="Finishing sign-in" />
          <p className="mt-4 text-small text-muted-foreground">Finishing sign-in…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="aurora" aria-hidden="true" />

      <div className="aurora-content screen-body py-8">
        <div className="screen-column screen-center">
          {/* ---- brand ---- */}
          <div className="mb-6 flex flex-col items-center text-center">
            <EdviaOrb
              size={orbSize}
              state={error ? "error" : busy ? "verifying" : "idle"}
              label="EDVIA"
            />
            <h1 className="mt-4 font-display text-display font-bold">Welcome back</h1>
            <p className="mt-1 text-small text-muted-foreground">Sign in to continue to EDVIA</p>
          </div>

          <div className="glass-panel px-5 py-5">
            {/* ---- Google first: fewer taps, no password to recall ---- */}
            <GoogleButton onClick={handleGoogle} loading={googleLoading} disabled={loading} />

            <div className="my-4">
              <AuthDivider />
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label htmlFor="signin-email" className="sr-only">
                  Email address
                </label>
                <Input
                  id="signin-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="glass-field"
                />
              </div>

              <div className="relative">
                <label htmlFor="signin-password" className="sr-only">
                  Password
                </label>
                <Input
                  id="signin-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="glass-field pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="tap absolute right-0 top-0 h-12 text-muted-foreground"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <div className="flex justify-end">
                {/* Standalone link, so it gets a real 44px target rather than
                    the 28px an inline text link would have. Inline links
                    inside a sentence are exempt; this one isn't in one. */}
                <Link
                  to="/auth/forgot-password"
                  className="inline-flex min-h-[44px] items-center px-1 text-[13px] font-medium text-edvia-600 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>

              {error && (
                <p role="alert" className="rounded-xl bg-danger/8 px-3 py-2.5 text-[13px] text-danger">
                  {error}
                </p>
              )}

              {/* Only once the wait has stopped looking like progress. */}
              {slow && !error && (
                <p role="status" className="rounded-xl bg-edvia-50/80 px-3 py-2.5 text-[13px] text-edvia-800">
                  Still working — your connection looks slow. Give it a moment rather than tapping
                  again.
                </p>
              )}

              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {loading ? (
                  <>
                    <Loader2 size={17} className="mr-2 animate-spin" /> Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          </div>

          <p className="mt-6 text-center text-small text-muted-foreground">
            New to EDVIA?{" "}
            <Link to="/auth/sign-up" className="font-semibold text-edvia-600 hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
