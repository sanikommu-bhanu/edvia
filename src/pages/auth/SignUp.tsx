import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signUp } from "@/services/firebase/auth.service";
import { useAuth } from "@/app/AuthContext";
import { SocialRow } from "./SignIn";
import type { Role } from "@/types";

export default function SignUp() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setUser } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const role = (sessionStorage.getItem("edvia.pendingRole") as Role | null) ?? "student";
      const user = await signUp({ fullName, email, password, role });
      setUser(user);
      navigate("/school-selection");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell min-h-screen px-6 py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold">Create Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign up to get started</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        <Input type="email" placeholder="Email or Phone Number" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Input type="password" placeholder="Confirm Password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? "Creating account…" : "Sign Up"}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or continue with</span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <SocialRow />

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/auth/sign-in" className="font-semibold text-edvia-600">
          Log In
        </Link>
      </p>
    </div>
  );
}
