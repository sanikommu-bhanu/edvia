import { Outlet, Navigate } from "react-router-dom";
import { useAuth } from "@/app/AuthContext";
import { BottomNav } from "./BottomNav";
import { Sidebar } from "./Sidebar";

// ==========================================================================
// RoleShell — the authenticated app frame
// --------------------------------------------------------------------------
// Mobile gets a bottom bar; desktop (lg and up) gets a sidebar and the
// content column shifts to clear it. Both come from the same nav config, so
// a destination can never exist on one and be missing from the other.
// ==========================================================================

export function RoleShell() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth/sign-in" replace />;
  // Authenticated but not yet part of a school. Every screen inside this
  // shell reads school-scoped data, so rendering one would produce a wall of
  // empty states instead of the one sentence that is actually true: this
  // account needs to create or join a school first.
  if (!user.schoolId) return <Navigate to="/welcome" replace />;

  return (
    <div className="min-h-screen bg-background">
      <Sidebar role={user.role} />
      {/* The left offset matches the sidebar width exactly; below lg it is
          zero and the shell is a centred phone-width column. */}
      <div className="lg:pl-[248px]">
        <div className="app-shell">
          <Outlet />
        </div>
      </div>
      <BottomNav role={user.role} />
    </div>
  );
}
