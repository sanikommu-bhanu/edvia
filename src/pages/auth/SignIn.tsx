import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn } from "@/services/firebase/auth.service";
import { useAuth } from "@/app/AuthContext";
import { EdviaRobot } from "@/components/shared/EdviaRobot";

export default function SignIn() {
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setUser } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await signIn({ emailOrPhone, password });
      setUser(user);
      navigate(user.onboardingComplete ? `/${user.role}` : "/school-selection");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell min-h-screen px-6 py-8">
      <div className="mb-8 flex flex-col items-center text-center">
        <EdviaRobot size={72} />
        <h1 className="mt-4 font-display text-2xl font-bold">Welcome Back! 👋</h1>
        <p className="mt-1 text-sm text-muted-foreground">Login to continue</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input placeholder="Email or Phone Number" value={emailOrPhone} onChange={(e) => setEmailOrPhone(e.target.value)} required />
        <div className="relative">
          <Input
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="pr-11"
          />
          <button type="button" onClick={() => setShowPassword((s) => !s)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <div className="text-right">
          <Link to="/auth/forgot-password" className="text-sm font-medium text-edvia-600">
            Forgot Password?
          </Link>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? "Logging in…" : "Log In"}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or continue with</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <SocialRow />

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link to="/auth/sign-up" className="font-semibold text-edvia-600">
          Sign Up
        </Link>
      </p>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Demo tip: try <span className="font-medium">henryjames@example.com</span> with any password.
      </p>
    </div>
  );
}

export function SocialRow() {
  return (
    <div className="flex justify-center gap-3">
      {["Google", "Apple", "Microsoft"].map((provider) => (
        <button
          key={provider}
          type="button"
          disabled
          title={`${provider} sign-in isn't configured in this build`}
          className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface text-xs font-semibold text-muted-foreground opacity-60"
        >
          {provider[0]}
        </button>
      ))}
    </div>
  );
}
