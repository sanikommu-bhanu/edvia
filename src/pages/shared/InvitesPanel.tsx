import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Ticket, Trash2, Users } from "lucide-react";
import { TopBar } from "@/layouts/TopBar";
import { Button } from "@/components/ui/button";
import { JoinQrCard } from "@/components/shared/JoinQrCard";
import { ErrorState, LoadingState } from "@/components/shared/StateViews";
import { useAuth } from "@/app/AuthContext";
import { useSchoolScope } from "@/app/SchoolContext";
import { createInvite, listInvites, revokeInvite } from "@/services/school/schoolAdmin.service";
import { joinUrlFor } from "@/services/onboarding/join.service";
import type { InviteKind, IssuedInvite, MintedInvite } from "@/types";
import { cn } from "@/lib/utils";

// ==========================================================================
// Invitations — one screen, two audiences
// --------------------------------------------------------------------------
// An administrator invites teachers; a teacher invites their class and their
// students' parents. Both are the same interaction (mint → show the QR →
// share it → revoke it later), so they are the same screen, and the SERVER
// decides which kinds each caller may create. Building two screens would
// mean two places for the authorization assumptions to drift apart, and the
// one that drifted would be the one nobody re-read.
//
// THE ONE-SHOT SECRET
// A freshly minted invitation is the only moment its QR and code exist in
// readable form — Firestore stores a hash. So the newly created card is
// rendered immediately and prominently, the list below it deliberately
// cannot re-open one, and the copy says so. An invite list that could
// re-display live secrets would be the most valuable page in the app to
// steal.
// ==========================================================================

interface KindOption {
  kind: InviteKind;
  title: string;
  blurb: string;
  /** Needs a class chosen first. */
  needsClass?: boolean;
}

const ADMIN_KINDS: KindOption[] = [
  {
    kind: "school_teacher",
    title: "Invite teachers",
    blurb: "Anyone who scans joins as a teacher at your school. Good for a staff-room noticeboard.",
  },
  {
    kind: "school_admin",
    title: "Invite an administrator",
    blurb: "Single use, expires in a week. Grants full school administration — share it directly, never publicly.",
  },
];

const CLASS_KIND: KindOption = {
  kind: "class_student",
  title: "Invite students",
  blurb: "Students scan this to join the class. Show it on the board or print it.",
  needsClass: true,
};

export default function InvitesPanel() {
  const { user } = useAuth();
  const { school, classes, activeClassId, selectClass } = useSchoolScope();

  const [invites, setInvites] = useState<IssuedInvite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [minting, setMinting] = useState<InviteKind | null>(null);
  const [minted, setMinted] = useState<MintedInvite | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const isAdmin = Boolean(user?.principalOfSchoolId && user.principalOfSchoolId === user.schoolId);

  const load = useCallback(async () => {
    setError(null);
    try {
      setInvites(await listInvites());
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't load your invitations.");
      setInvites(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const options = [...(isAdmin ? ADMIN_KINDS : []), ...(classes.length ? [CLASS_KIND] : [])];

  async function mint(option: KindOption) {
    if (minting) return;
    if (option.needsClass && !activeClassId) {
      setError("Choose a class first.");
      return;
    }
    setMinting(option.kind);
    setError(null);
    try {
      const result = await createInvite({
        kind: option.kind,
        ...(option.needsClass && activeClassId ? { classId: activeClassId } : {}),
        label: option.title,
      });
      setMinted(result);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't create that invitation.");
    } finally {
      setMinting(null);
    }
  }

  async function revoke(id: string) {
    setRevoking(id);
    setError(null);
    try {
      await revokeInvite(id);
      // If the card on screen is the one just revoked, take it down — a
      // shareable QR for a dead invitation is worse than no QR.
      if (minted?.invite.id === id) setMinted(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't withdraw that invitation.");
    } finally {
      setRevoking(null);
    }
  }

  const activeClass = classes.find((c) => c.id === activeClassId) ?? null;

  return (
    <div className="app-shell min-h-screen">
      <TopBar title="Invitations" />
      <div className="screen-pad space-y-6 pb-12">
        {/* ---- the freshly minted card ---- */}
        {minted && (
          <section>
            <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-muted-foreground">
              New invitation
            </h2>
            <JoinQrCard
              url={joinUrlFor(minted.secret)}
              code={minted.humanCode}
              schoolName={school?.name ?? "Your school"}
              subtitle={subtitleFor(minted.invite.kind, activeClass?.className)}
              instruction={instructionFor(minted.invite.kind)}
            />
            <p className="mt-3 rounded-xl bg-edvia-50/80 px-3 py-2.5 text-[12.5px] leading-relaxed text-edvia-800">
              Save or share this now. For security EDVIA stores only a scrambled copy, so this QR
              and code can't be shown again — if you lose them, create a new invitation.
            </p>
          </section>
        )}

        {/* ---- class picker, when a class-scoped invite is available ---- */}
        {classes.length > 0 && (
          <section>
            <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-muted-foreground">
              Class
            </h2>
            <div className="flex flex-wrap gap-2">
              {classes.map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectClass(c.id)}
                  aria-pressed={activeClassId === c.id}
                  className={cn(
                    "min-h-[44px] rounded-full border px-4 text-[13px] font-semibold transition-colors",
                    activeClassId === c.id
                      ? "border-edvia-500 bg-edvia-500 text-white"
                      : "border-border bg-surface text-slate-700 hover:border-edvia-300"
                  )}
                >
                  {c.className}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ---- mint ---- */}
        <section>
          <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-muted-foreground">
            Create an invitation
          </h2>
          {options.length === 0 ? (
            <p className="rounded-2xl border border-border bg-surface px-4 py-5 text-sm text-muted-foreground">
              You'll be able to invite students once you have a class. Create one from your
              dashboard first.
            </p>
          ) : (
            <div className="space-y-2.5">
              {options.map((option) => (
                <button
                  key={option.kind}
                  onClick={() => mint(option)}
                  disabled={Boolean(minting)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-left shadow-soft transition-colors hover:border-edvia-300 disabled:opacity-60"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-edvia-100 text-edvia-700">
                    {minting === option.kind ? (
                      <Loader2 size={19} className="animate-spin" />
                    ) : (
                      <Plus size={19} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-slate-900">{option.title}</span>
                    <span className="block text-[12.5px] leading-snug text-muted-foreground">
                      {option.blurb}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {error && <ErrorState body={error} onRetry={load} />}

        {/* ---- existing ---- */}
        <section>
          <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-muted-foreground">
            Active invitations
          </h2>
          {invites === null && !error ? (
            <LoadingState rows={2} />
          ) : invites && invites.length > 0 ? (
            <ul className="space-y-2.5">
              {invites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5"
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                      invite.status === "active"
                        ? "bg-edvia-100 text-edvia-700"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    <Ticket size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-slate-900">
                      {subtitleFor(invite.kind)}
                    </p>
                    <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                      <Users size={11} />
                      {invite.usedCount} joined
                      {invite.usageLimit !== null && ` of ${invite.usageLimit}`}
                      {invite.expiresAt && ` · expires ${formatDate(invite.expiresAt)}`}
                      {invite.status === "revoked" && " · withdrawn"}
                    </p>
                  </div>
                  {invite.status === "active" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Withdraw ${subtitleFor(invite.kind)}`}
                      onClick={() => revoke(invite.id)}
                      disabled={revoking === invite.id}
                    >
                      {revoking === invite.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Trash2 size={16} className="text-danger" />
                      )}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            !error && (
              <p className="rounded-2xl border border-border bg-surface px-4 py-5 text-sm text-muted-foreground">
                No invitations yet.
              </p>
            )
          )}
        </section>
      </div>
    </div>
  );
}

function subtitleFor(kind: InviteKind, className?: string): string {
  switch (kind) {
    case "school_teacher":
      return "Teacher invitation";
    case "school_admin":
      return "Administrator invitation";
    case "class_student":
      return className ? `Students · ${className}` : "Student invitation";
    case "parent_link":
      return "Parent invitation";
  }
}

function instructionFor(kind: InviteKind): string {
  switch (kind) {
    case "school_teacher":
      return "Teachers: scan with your phone camera, sign in with Google, and you're in.";
    case "school_admin":
      return "Single use. Share this with one person directly — never on a public board.";
    case "class_student":
      return "Students: scan with your phone camera and sign in with Google to join this class.";
    case "parent_link":
      return "For this child's parent only. Single use.";
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
