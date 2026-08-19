import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  signUp,
  signInWithGoogle,
  completeGoogleRedirect,
  GoogleSignInCancelled,
  GoogleSignInRedirecting,
} from "@/services/firebase/auth.service";
import { readPendingRole, ROLE_OPTIONS } from "@/config/roles";
import { useAuth } from "@/app/AuthContext";
import { EdviaOrb } from "@/components/shared/EdviaOrb";
import { useOrbSize } from "@/hooks/useOrbSize";
import { GoogleButton, AuthDivider } from "@/components/shared/GoogleButton";
import { useSlowRequestHint } from "@/hooks/useSlowRequestHint";
import type { UserProfile } from "@/types";

// ==========================================================================
// Create account
// --------------------------------------------------------------------------
// The role shown here is the one chosen on the role-selection screen. It is
// displayed so the user can confirm it, and it is a REQUEST only: staff
// roles unlock nothing until an invite code is redeemed and the server
// writes the matching grant. The banner below says so plainly rather than
// letting someone discover it after signing up.
//
// See docs/SECURITY.md §3.5 — this is the split that closed CRIT-01.
// ==========================================================================

export default function SignUp() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  // See SignIn.tsx — same two flags, same reasons.
  const [redirecting, setRedirecting] = useState(false);
  const [resumingRedirect, setResumingRedirect] = useState(true);
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const orbSize = useOrbSize(0.2, 68, 88);

  const role = readPendingRole();
  const roleLabel = ROLE_OPTIONS.find((o) => o.role === role)?.title ?? "Student";
  const isStaffRole = role === "teacher" || role === "principal";

  const busy = loading || googleLoading || redirecting;
  const slow = useSlowRequestHint(busy);

  // Picks up a Google sign-up that went via full-page redirect.
  useEffect(() => {
    let cancelled = false;
    completeGoogleRedirect(role)
      .then((user) => {
        if (cancelled) return;
        if (user) {
          setUser(user);
          navigate(user.onboardingComplete ? `/${user.role}` : "/school-selection");
        } else {
          setResumingRedirect(false);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Google sign-up couldn't be completed.");
        setResumingRedirect(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // A second tap during a slow signup would call createUser twice and come
    // back with "email already in use" — describing an account that the
    // FIRST tap successfully created. Refusing the second tap is the fix.
    if (busy) return;
    setError(null);
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Please use at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const user = await signUp({ fullName, email, password, role });
      setUser(user);
      // Verification email is sent by signUp; the next screen reads the real
      // emailVerified flag rather than accepting a made-up code.
      navigate("/auth/verify-email");
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
      const user: UserProfile = await signInWithGoogle(role);
      setUser(user);
      // Google addresses are already verified, so this path skips the
      // verification screen and goes straight to school selection.
      navigate(user.onboardingComplete ? `/${user.role}` : "/school-selection");
    } catch (err) {
      if (err instanceof GoogleSignInRedirecting) {
        setRedirecting(true);
        return;
      }
      if (!(err instanceof GoogleSignInCancelled)) {
        setError(err instanceof Error ? err.message : "Google sign-up couldn't be completed.");
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
          <EdviaOrb size={orbSize} state="processing" label="Finishing sign-up" />
          <p className="mt-4 text-small text-muted-foreground">Finishing sign-up…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="aurora" aria-hidden="true" />

      <div className="aurora-content screen-body py-8">
        <div className="screen-column screen-center">
          <div className="mb-5 flex flex-col items-center text-center">
            <EdviaOrb
              size={orbSize}
              state={error ? "error" : busy ? "processing" : "idle"}
              label="EDVIA"
            />
            <h1 className="mt-4 font-display text-display font-bold">Create your account</h1>
            <p className="mt-1 text-small text-muted-foreground">
              Signing up as <span className="font-semibold text-edvia-700">{roleLabel}</span> ·{" "}
              <Link to="/role-selection" className="font-medium text-edvia-600 hover:underline">
                change
              </Link>
            </p>
          </div>

          {/* Staff roles: set the expectation before the account exists. */}
          {isStaffRole && (
            <div className="mb-4 flex gap-2.5 rounded-2xl border border-edvia-200/70 bg-edvia-50/70 px-3.5 py-3 backdrop-blur-sm">
              <ShieldCheck size={17} className="mt-0.5 shrink-0 text-edvia-600" />
              <p className="text-[12.5px] leading-relaxed text-edvia-800">
                Staff accounts are verified by your school. You&apos;ll need the invite code they
                issued before school records unlock.
              </p>
            </div>
          )}

          <div className="glass-panel px-5 py-5">
            <GoogleButton
              onClick={handleGoogle}
              loading={googleLoading}
              disabled={loading}
              label="Sign up with Google"
            />

            <div className="my-4">
              <AuthDivider />
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label htmlFor="signup-name" className="sr-only">
                  Full name
                </label>
                <Input
                  id="signup-name"
                  autoComplete="name"
                  placeholder="Full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="glass-field"
                />
              </div>

              <div>
                <label htmlFor="signup-email" className="sr-only">
                  Email address
                </label>
                <Input
                  id="signup-email"
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
                <label htmlFor="signup-password" className="sr-only">
                  Password
                </label>
                <Input
                  id="signup-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Password (8+ characters)"
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

              <div>
                <label htmlFor="signup-confirm" className="sr-only">
                  Confirm password
                </label>
                <Input
                  id="signup-confirm"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Confirm password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className="glass-field"
                />
              </div>

              {error && (
                <p role="alert" className="rounded-xl bg-danger/8 px-3 py-2.5 text-[13px] text-danger">
                  {error}
                </p>
              )}

              {slow && !error && (
                <p role="status" className="rounded-xl bg-edvia-50/80 px-3 py-2.5 text-[13px] text-edvia-800">
                  Still working — your connection looks slow. Give it a moment rather than tapping
                  again.
                </p>
              )}

              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {loading ? (
                  <>
                    <Loader2 size={17} className="mr-2 animate-spin" /> Creating account…
                  </>
                ) : (
                  "Create account"
                )}
              </Button>
            </form>
          </div>

          <p className="mt-6 text-center text-small text-muted-foreground">
            Already have an account?{" "}
            <Link to="/auth/sign-in" className="font-semibold text-edvia-600 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
