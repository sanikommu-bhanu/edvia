import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/layouts/TopBar";
import { verifyOtp } from "@/services/firebase/auth.service";

export default function VerifyOtp() {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const navigate = useNavigate();

  function updateDigit(i: number, val: string) {
    if (!/^[0-9]?$/.test(val)) return;
    const next = [...digits];
    next[i] = val;
    setDigits(next);
    if (val && i < 5) refs.current[i + 1]?.focus();
  }

  async function handleVerify() {
    setError(null);
    setLoading(true);
    const ok = await verifyOtp("email", digits.join(""));
    setLoading(false);
    if (ok) navigate("/school-selection");
    else setError("That code didn't work. Please try again.");
  }

  return (
    <div className="app-shell min-h-screen">
      <TopBar title="Verify OTP" showBack />
      <div className="screen-pad">
        <p className="mb-6 text-sm text-muted-foreground">Enter the 6-digit code sent to your email.</p>
        <div className="mb-6 flex justify-between gap-2">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (refs.current[i] = el)}
              value={d}
              onChange={(e) => updateDigit(i, e.target.value)}
              maxLength={1}
              inputMode="numeric"
              className="h-14 w-11 rounded-xl border border-border bg-surface text-center text-lg font-semibold focus:border-edvia-400 focus:outline-none focus:ring-2 focus:ring-edvia-100"
            />
          ))}
        </div>
        {error && <p className="mb-4 text-sm text-danger">{error}</p>}
        <Button size="lg" className="w-full" onClick={handleVerify} disabled={loading || digits.some((d) => !d)}>
          {loading ? "Verifying…" : "Verify"}
        </Button>
        <button className="mt-4 w-full text-center text-sm font-medium text-edvia-600">Resend code (00:30)</button>
      </div>
    </div>
  );
}
