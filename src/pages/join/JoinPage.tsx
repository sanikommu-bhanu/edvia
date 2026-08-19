import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Loader2, ShieldCheck, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EdviaOrb } from "@/components/shared/EdviaOrb";
import { useOrbSize } from "@/hooks/useOrbSize";
import { GoogleButton, AuthDivider } from "@/components/shared/GoogleButton";
import { useAuth } from "@/app/AuthContext";
import {
  previewInvite,
  redeemInvite,
  rememberPendingInvite,
  readPendingInvite,
  clearPendingInvite,
  InviteRejectedError,
  type InviteCredential,
} from "@/services/onboarding/join.service";
import {
  signInWithGoogle,
  completeGoogleRedirect,
  getCurrentUser,
  GoogleSignInCancelled,
  GoogleSignInRedirecting,
} from "@/services/firebase/auth.service";
import { roleHomePath } from "@/services/school/school.service";
import type { InvitePreview } from "@/types";

// ==========================================================================
// /join/:token  and  /join
// --------------------------------------------------------------------------
// The screen a QR scan lands on. Its whole job is to get someone from a
// camera to a dashboard with as few decisions as possible, WITHOUT ever
// letting them make the one decision that matters.
//
// THE ORDER MATTERS
//   1. describe the invitation   (no sign-in required — previewInvite)
//   2. authenticate              (Google, or the existing session)
//   3. redeem                    (server decides what the token grants)
//
// Step 1 before step 2 is deliberate: asking someone to sign in before
// telling them what they are signing in FOR is how invitations get
// abandoned, and the preview endpoint is built to reveal only what is
// already printed on the QR card itself.
//
// THE ROLE IS NOT A CHOICE
// This screen SHOWS the role ("You're joining Robo School as a Teacher") and
// offers no way to change it, because there is nothing to change: the role
// lives in the invite document on the server. The confirm button sends a
// token and nothing else. See api/invites/redeem.ts.
//
// SURVIVING THE OAUTH ROUND TRIP
// If the Google popup is unavailable the browser leaves EDVIA entirely.
// The credential is stashed in sessionStorage BEFORE the redirect starts and
// recovered on the way back, because losing it drops someone on a dashboard
// with no idea their invitation went unused — the most likely way this
// entire flow fails in practice.
// ==========================================================================

type Phase = "loading" | "ready" | "invalid" | "joining" | "joined";

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, setUser, status } = useAuth();
  const orbSize = useOrbSize(0.2, 72, 96);

  const [phase, setPhase] = useState<Phase>(token ? "loading" : "ready");
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [credential, setCredential] = useState<InviteCredential | null>(token ? { token } : null);
  const [codeInput, setCodeInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  // Guards the auto-redeem effect: without it, a re-render after setUser
  // fires a second redemption while the first is still in flight.
  const redeeming = useRef(false);

  // ---- 1. describe the invitation ---------------------------------------
  const loadPreview = useCallback(async (cred: InviteCredential) => {
    setPhase("loading");
    setError(null);
    setGone(false);
    try {
      const result = await previewInvite(cred);
      setPreview(result);
      setCredential(cred);
      rememberPendingInvite(cred);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That invitation couldn't be checked.");
      setGone(err instanceof InviteRejectedError && err.gone);
      setPhase("invalid");
    }
  }, []);

  useEffect(() => {
    // A token in the URL, or one stashed before a Google redirect took the
    // whole tab away. Either is a valid way to arrive here.
    const fromUrl = token ? { token } : null;
    const pending = fromUrl ?? readPendingInvite();
    if (pending) void loadPreview(pending);
  }, [token, loadPreview]);

  // ---- 2b. returning from a full-page Google redirect --------------------
  useEffect(() => {
    let cancelled = false;
    completeGoogleRedirect("student")
      .then((profile) => {
        if (!cancelled && profile) setUser(profile);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Google sign-in couldn't be completed.");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- 3. redeem ---------------------------------------------------------
  const join = useCallback(async () => {
    if (!credential || redeeming.current) return;
    redeeming.current = true;
    setPhase("joining");
    setError(null);
    try {
      const result = await redeemInvite(credential);
      clearPendingInvite();
      // The profile has changed server-side (role, school, grants), so it is
      // re-read rather than patched locally — the server's copy is the only
      // one that decides anything, and guessing at it here would show a
      // dashboard the account cannot actually load.
      const refreshed = await getCurrentUser();
      if (refreshed) setUser(refreshed);
      setPhase("joined");
      navigate(roleHomePath(result.role), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't complete your joining. Please try again.");
      setPhase("ready");
    } finally {
      redeeming.current = false;
    }
  }, [credential, navigate, setUser]);

  // Someone who is already signed in and arrives from a QR should not have
  // to press anything: the invitation named them, they are authenticated,
  // and the confirm screen would be a step that asks nothing.
  useEffect(() => {
    if (user && credential && phase === "ready" && preview) void join();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, credential, preview]);

  async function handleGoogle() {
    if (googleLoading || !credential) return;
    setError(null);
    setGoogleLoading(true);
    // Stashed BEFORE the attempt, because signInWithRedirect never returns.
    rememberPendingInvite(credential);
    try {
      // "student" is the placeholder role a brand-new profile is created
      // with. It grants nothing, and redemption overwrites it with the role
      // the INVITE specifies a moment later.
      setUser(await signInWithGoogle("student"));
    } catch (err) {
      if (err instanceof GoogleSignInRedirecting) return; // tab is leaving
      if (!(err instanceof GoogleSignInCancelled)) {
        setError(err instanceof Error ? err.message : "Google sign-in couldn't be completed.");
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  // ---- render ------------------------------------------------------------
  if (status === "initializing" || phase === "loading") {
    return (
      <Shell orbSize={orbSize} state="verifying">
        <p className="mt-4 text-small text-muted-foreground">Checking your invitation…</p>
      </Shell>
    );
  }

  if (phase === "invalid") {
    return (
      <Shell orbSize={orbSize} state="error">
        <h1 className="mt-4 font-display text-title font-bold text-slate-900">
          {gone ? "This invitation is no longer active" : "We don't recognise that invitation"}
        </h1>
        <p className="mt-2 max-w-[320px] text-small leading-relaxed text-muted-foreground">{error}</p>
        <div className="mt-6 w-full max-w-[320px] space-y-2.5">
          <Button size="lg" className="w-full" onClick={() => navigate("/join", { replace: true })}>
            Enter a code instead
          </Button>
          <Link to="/" className="block">
            <Button variant="ghost" size="lg" className="w-full">
              Back to EDVIA
            </Button>
          </Link>
        </div>
      </Shell>
    );
  }

  // No token in the URL — the typed-code path.
  if (!preview) {
    return (
      <Shell orbSize={orbSize} state="listening">
        <h1 className="mt-4 font-display text-display font-bold">Join your school</h1>
        <p className="mt-1.5 max-w-[300px] text-small text-muted-foreground">
          Enter the join code your school, teacher or class gave you.
        </p>
        <form
          className="mt-6 w-full max-w-[320px] space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (codeInput.trim()) void loadPreview({ code: codeInput.trim() });
          }}
        >
          <label htmlFor="join-code" className="sr-only">
            Join code
          </label>
          <Input
            id="join-code"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            placeholder="ABCDE-FGHJK"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="glass-field text-center font-mono text-lg tracking-[0.14em]"
          />
          {error && (
            <p role="alert" className="rounded-xl bg-danger/8 px-3 py-2.5 text-[13px] text-danger">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={!codeInput.trim()}>
            Continue
          </Button>
        </form>
      </Shell>
    );
  }

  const joining = phase === "joining" || phase === "joined";

  return (
    <Shell orbSize={orbSize} state={joining ? "verifying" : "listening"}>
      <p className="mt-4 text-small font-medium text-muted-foreground">You're invited to join</p>
      <h1 className="mt-1 font-display text-display font-bold text-slate-900">{preview.schoolName}</h1>

      <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-edvia-100 px-3.5 py-1.5 text-[13px] font-semibold text-edvia-700">
        <Ticket size={14} /> {preview.roleLabel}
      </span>

      {preview.className && (
        <p className="mt-2 text-small font-medium text-slate-700">{preview.className}</p>
      )}
      {preview.childFirstName && (
        <p className="mt-2 text-small text-muted-foreground">
          Linking you to <span className="font-semibold text-slate-800">{preview.childFirstName}</span>
        </p>
      )}

      <div className="mt-7 w-full max-w-[320px]">
        {user ? (
          <>
            <p className="mb-3 text-center text-[13px] text-muted-foreground">
              Signed in as <span className="font-semibold text-slate-800">{user.email}</span>
            </p>
            <Button size="lg" className="w-full" onClick={join} disabled={joining}>
              {joining ? (
                <>
                  <Loader2 size={17} className="mr-2 animate-spin" /> Joining…
                </>
              ) : (
                "Continue"
              )}
            </Button>
          </>
        ) : (
          <>
            <GoogleButton onClick={handleGoogle} loading={googleLoading} />
            <div className="my-4">
              <AuthDivider />
            </div>
            <Link to="/auth/sign-in" className="block">
              <Button variant="outline" size="lg" className="w-full">
                Sign in with email
              </Button>
            </Link>
          </>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-danger/8 px-3 py-2.5 text-[13px] text-danger">
            {error}
          </p>
        )}

        {/* Says plainly that the role is not theirs to pick. Someone who
            expected a different role needs to go back to their school, not
            hunt for a dropdown that deliberately does not exist. */}
        <p className="mt-5 flex items-start gap-1.5 text-[12px] leading-relaxed text-muted-foreground">
          <ShieldCheck size={14} className="mt-px shrink-0 text-edvia-500" />
          <span>
            Your access is set by {preview.schoolName}, not by you. If this isn't the right role, ask
            your school for a different invitation.
          </span>
        </p>
      </div>
    </Shell>
  );
}

function Shell({
  children,
  orbSize,
  state,
}: {
  children: React.ReactNode;
  orbSize: number;
  state: "verifying" | "listening" | "error";
}) {
  return (
    <div className="screen">
      <div className="aurora" aria-hidden="true" />
      <div className="aurora-content screen-body items-center justify-center py-8 text-center">
        <div className="screen-column flex flex-col items-center">
          <EdviaOrb size={orbSize} state={state} label="EDVIA" />
          {children}
        </div>
      </div>
    </div>
  );
}
