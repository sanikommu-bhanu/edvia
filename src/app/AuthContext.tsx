import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthChange, signOutUser } from "@/services/firebase/auth.service";
import { isFirebaseConfigured } from "@/services/firebase/config";
import type { UserProfile } from "@/types";

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  setUser: (u: UserProfile | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      // No project configured — nothing to subscribe to. The relevant
      // screens (SignIn/SignUp/AI chat) surface a clear setup message.
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthChange((profile) => {
      setUser(profile);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  async function logout() {
    await signOutUser();
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, setUser, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
