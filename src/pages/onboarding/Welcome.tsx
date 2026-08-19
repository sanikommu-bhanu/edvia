import { useNavigate } from "react-router-dom";
import { Building2, LogOut, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EdviaOrb } from "@/components/shared/EdviaOrb";
import { useOrbSize } from "@/hooks/useOrbSize";
import { useAuth } from "@/app/AuthContext";

// ==========================================================================
// Welcome — where an authenticated account with no school lands
// --------------------------------------------------------------------------
// This screen replaces the old "choose your role" step, and the replacement
// is the point rather than a redesign.
//
// The old flow asked a brand-new account to declare itself a Principal, a
// Teacher, a Parent or a Student, and then carried that declaration forward
// as though it meant something. It never did — every server check reads a
// grant, not a role — but a screen that offers "Principal" as a tappable
// option teaches exactly the wrong mental model, and it left the honest
// answer ("you are not anything yet") impossible to express.
//
// There are only two ways to become part of a school, and they are the only
// two things here:
//
//   Create a school   → you are its administrator, because you made it
//   Join a school     → you are whatever the invitation says you are
//
// Neither is a claim the user gets to make about themselves.
// ==========================================================================

export default function Welcome() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const orbSize = useOrbSize(0.24, 84, 116);

  const firstName = user?.fullName?.split(" ")[0];

  return (
    <div className="screen">
      <div className="aurora" aria-hidden="true" />

      <div className="aurora-content screen-body py-8">
        <div className="screen-column screen-center">
          <div className="flex flex-col items-center text-center">
            <EdviaOrb size={orbSize} state="idle" label="EDVIA" />
            <h1 className="mt-5 font-display text-display font-bold text-slate-900">
              {firstName ? `Welcome, ${firstName}` : "Welcome to EDVIA"}
            </h1>
            <p className="mt-1.5 max-w-[300px] text-small leading-relaxed text-muted-foreground">
              You're signed in. Now connect this account to a school — either the one you run, or
              the one that invited you.
            </p>
          </div>

          <div className="mt-7 space-y-3">
            <button
              onClick={() => navigate("/join")}
              className="glass-tile flex w-full items-center gap-3.5 p-4 text-left"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-edvia-100 text-edvia-700">
                <QrCode size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-slate-900">Join a school</span>
                <span className="block text-[12.5px] leading-snug text-muted-foreground">
                  Scan the QR your school gave you, or enter its join code. Teachers, students and
                  parents all join this way.
                </span>
              </span>
            </button>

            <button
              onClick={() => navigate("/school/create")}
              className="glass-tile flex w-full items-center gap-3.5 p-4 text-left"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-info/10 text-info">
                <Building2 size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-slate-900">Create a school</span>
                <span className="block text-[12.5px] leading-snug text-muted-foreground">
                  Set up your school on EDVIA and become its administrator. You'll get a QR code to
                  invite your teachers straight away.
                </span>
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="screen-actions">
        <div className="screen-column">
          <Button variant="ghost" size="lg" className="w-full" onClick={() => void logout()}>
            <LogOut size={17} /> Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
