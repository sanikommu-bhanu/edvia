import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TopBar } from "@/layouts/TopBar";
import { sendPasswordReset } from "@/services/firebase/auth.service";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await sendPasswordReset(email);
    setLoading(false);
    setSent(true);
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
