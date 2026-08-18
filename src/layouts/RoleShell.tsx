import { Outlet } from "react-router-dom";
import { useAuth } from "@/app/AuthContext";
import { BottomNav } from "./BottomNav";
import { Navigate } from "react-router-dom";

export function RoleShell() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth/sign-in" replace />;

  return (
    <div className="app-shell">
      <Outlet />
      <BottomNav role={user.role} />
    </div>
  );
}
