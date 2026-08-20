import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TopBar } from "@/layouts/TopBar";
import { sendPasswordReset } from "@/services/firebase/auth.service";

/**
 * Password reset.
 *
 * Two behaviours that have to coexist and are easy to get wrong together:
 *
 *   1. The confirmation is deliberately non-committal ("if an account
 *      exists…"). Firebase does not error on an unknown address — by design,
 *      so a reset form can't be used to enumerate who has an account here —
 *      and the wording must not undo that by implying the address was found.
 *   2. It must still be shown ONLY after the send actually succeeded. A real
 *      failure (Firebase not configured, network down, rate limited) is a
 *      different thing from "we didn't tell you whether the account exists",
 *      and collapsing the two would leave someone waiting for an email that
 *      was never requested.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await sendPasswordReset(email);
      // Only after the request genuinely went through.
      setSent(true);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "We couldn't send the reset link right now. Please try again."
      );
    } finally {
      // In `finally` so a failure can't leave the button stuck on "Sending…".
      setLoading(false);
    }
  }

  return (
    <div className="app-shell min-h-screen">
      <TopBar title="Reset Password" showBack />
      <div className="screen-pad">
        {!sent ? (
          <>
            <p className="mb-6 text-sm text-muted-foreground">
              Enter the email linked to your account and we&apos;ll send you a reset link.
            </p>
            {error && (
              <p className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
                {error}
              </p>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading ? "Sending…" : "Send Reset Link"}
              </Button>
            </form>
          </>
        ) : (
          <div className="text-center">
            <p className="mb-6 text-sm text-slate-700">
              If an account exists for <span className="font-semibold">{email}</span>, a reset link is on its way.
            </p>
            <Button size="lg" className="w-full" onClick={() => navigate("/auth/sign-in")}>
              Back to Log In
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
