import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MailCheck, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/layouts/TopBar";
import { sendVerificationEmail, refreshEmailVerified, currentEmail } from "@/services/firebase/auth.service";

const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Real email verification, replacing the six-box OTP screen.
 *
 * Firebase verifies email addresses with a signed link, not a numeric code.
 * The previous screen accepted any six digits, which verified nothing —
 * this one sends the actual verification mail and reads the actual
 * `emailVerified` flag off the account.
 *
 * Verification is not a gate on using EDVIA: what actually links an account
 * to a real student record is the school's single-use invite code, checked
 * server-side. So the screen is honest about that too, rather than blocking
 * a parent whose mail is slow.
 */
export default function VerifyEmail() {
  const navigate = useNavigate();
  const [email] = useState(() => currentEmail());
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [verified, setVerified] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Poll gently while the tab is open — most people click the link on their
  // phone and come back, and having to press a button then feels broken.
  useEffect(() => {
    if (verified) return;
    const interval = setInterval(async () => {
      const ok = await refreshEmailVerified().catch(() => false);
      if (ok) setVerified(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [verified]);

  async function check() {
    setChecking(true);
    setError(null);
    setMessage(null);
    try {
      const ok = await refreshEmailVerified();
      setVerified(ok);
      if (!ok) setMessage("Not verified yet. Open the link in the email, then try again.");
    } catch {
      setError("We couldn't check that just now. Please try again.");
    } finally {
      setChecking(false);
    }
  }

  async function resend() {
    setSending(true);
    setError(null);
    setMessage(null);
    try {
      await sendVerificationEmail();
      setMessage("Verification email sent. Check your inbox and spam folder.");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      setError("We couldn't send the email right now. Please try again in a moment.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="app-shell min-h-screen">
      <TopBar title="Verify Your Email" showBack />
      <div className="screen-pad">
        <div className="flex flex-col items-center text-center">
          <span
            className={`flex h-16 w-16 items-center justify-center rounded-2xl ${
              verified ? "bg-success/10 text-success" : "bg-edvia-100 text-edvia-600"
            }`}
          >
            {verified ? <CheckCircle2 size={28} /> : <MailCheck size={28} />}
          </span>
          <h2 className="mt-4 font-display text-lg font-bold">
            {verified ? "Email verified" : "Check your inbox"}
          </h2>
          <p className="mt-1 max-w-[300px] text-sm text-muted-foreground">
            {verified
              ? "Thanks — your email address is confirmed."
              : `We sent a verification link${email ? ` to ${email}` : ""}. Open it, then come back here.`}
          </p>
        </div>

        {message && <p className="mt-5 text-center text-sm text-muted-foreground">{message}</p>}
        {error && <p className="mt-5 text-center text-sm text-danger">{error}</p>}

        <div className="mt-8 space-y-3">
          {verified ? (
            <Button size="lg" className="w-full" onClick={() => navigate("/school-selection")}>
              Continue
            </Button>
          ) : (
            <>
              <Button size="lg" className="w-full" onClick={() => void check()} disabled={checking}>
                {checking ? "Checking…" : "I've verified my email"}
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                onClick={() => void resend()}
                disabled={sending || cooldown > 0}
              >
                <RefreshCw size={16} />
                {cooldown > 0 ? `Resend in ${String(cooldown).padStart(2, "0")}s` : sending ? "Sending…" : "Resend email"}
              </Button>
              <button
                onClick={() => navigate("/school-selection")}
                className="w-full py-2 text-center text-sm font-medium text-edvia-600"
              >
                Continue and verify later
              </button>
              <p className="text-center text-xs text-muted-foreground">
                You can set up your school now. Access to your child's or your own records is unlocked by your
                school's invite code, not by this step.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
