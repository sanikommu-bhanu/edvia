import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { TopBar } from "@/layouts/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JoinQrCard } from "@/components/shared/JoinQrCard";
import { useSchoolScope } from "@/app/SchoolContext";
import { createClass, createInvite } from "@/services/school/schoolAdmin.service";
import { joinUrlFor } from "@/services/onboarding/join.service";
import type { MintedInvite } from "@/types";

// ==========================================================================
// Create a class
// --------------------------------------------------------------------------
// A teacher names a class and immediately gets the QR their students scan.
// Those two steps are one screen on purpose: a class with no way to join it
// is not yet useful to anybody, and making the invitation a separate errand
// is how classes end up empty.
//
// Both writes are server-side (api/classes/create.ts, api/invites/create.ts).
// classes/{id}.teacherId is read by firestore.rules, by the AI tool layer and
// by the invite route to decide who may add students — so a client that could
// write it could write itself onto someone else's class.
// ==========================================================================

export default function CreateClass() {
  const navigate = useNavigate();
  const { school, reload } = useSchoolScope();

  const [className, setClassName] = useState("");
  const [section, setSection] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; invite: MintedInvite } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !className.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const { class: record } = await createClass({
        className: className.trim(),
        section: section.trim(),
      });
      // The join QR is minted right here rather than on a later screen. If
      // THIS call fails the class still exists and is fine — the teacher just
      // creates the invitation from the Invitations screen — so the failure
      // is reported without pretending the class creation failed too.
      try {
        const invite = await createInvite({
          kind: "class_student",
          classId: record.id,
          label: `Students · ${record.className}`,
        });
        setCreated({ name: record.className, invite });
      } catch (inviteErr) {
        console.error("class created but its join QR could not be minted", inviteErr);
        setError(
          `${record.className} was created, but we couldn't generate its join QR just now. You can create one from the Invitations screen.`
        );
      }
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't create that class. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <div className="app-shell min-h-screen">
        <TopBar title={created.name} />
        <div className="screen-pad space-y-4 pb-12">
          <p className="text-sm leading-relaxed text-muted-foreground">
            <span className="font-semibold text-slate-900">{created.name}</span> is ready. Show this
            to your students — they scan it, sign in, and they're in the class.
          </p>
          <JoinQrCard
            url={joinUrlFor(created.invite.secret)}
            code={created.invite.humanCode}
            schoolName={school?.name ?? "Your school"}
            subtitle={created.name}
            instruction="Students: scan with your phone camera and sign in with Google to join this class."
          />
          <p className="rounded-xl bg-edvia-50/80 px-3 py-2.5 text-[12.5px] leading-relaxed text-edvia-800">
            Save or share this now — EDVIA stores only a scrambled copy, so it can't be shown again.
          </p>
          <Button variant="outline" size="lg" className="w-full" onClick={() => navigate("/teacher")}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen">
      <TopBar title="Create a class" />
      <form onSubmit={submit} className="screen-pad space-y-5 pb-10">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Name the class, and EDVIA will generate the QR code your students use to join it.
        </p>

        <div>
          <label htmlFor="class-name" className="mb-1.5 block text-[13px] font-semibold text-slate-800">
            Class
          </label>
          <Input
            id="class-name"
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            placeholder="Class 10"
            maxLength={60}
            required
            autoFocus
          />
        </div>

        <div>
          <label htmlFor="class-section" className="mb-1.5 block text-[13px] font-semibold text-slate-800">
            Section <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
          </label>
          <Input
            id="class-section"
            value={section}
            onChange={(e) => setSection(e.target.value.toUpperCase())}
            placeholder="A"
            maxLength={20}
          />
          <p className="mt-1.5 text-[12px] text-muted-foreground">
            Shown as{" "}
            <span className="font-semibold text-slate-700">
              {className.trim() || "Class 10"}
              {section.trim() ? ` - ${section.trim()}` : ""}
            </span>
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-danger/8 px-3 py-2.5 text-[13px] text-danger">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={saving || !className.trim()}>
          {saving ? (
            <>
              <Loader2 size={17} className="mr-2 animate-spin" /> Creating…
            </>
          ) : (
            "Create class"
          )}
        </Button>
      </form>
    </div>
  );
}
