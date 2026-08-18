import { useEffect, useState } from "react";
import { TopBar } from "@/layouts/TopBar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Building2 } from "lucide-react";
import { useAuth } from "@/app/AuthContext";
import { createSupportRequest, listSupportRequests } from "@/services/support/support.service";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { SupportRecipient, SupportRequest, SupportStatus } from "@/types";

const STATUS_TONE: Record<SupportStatus, "warning" | "info" | "success" | "neutral"> = {
  pending: "warning",
  acknowledged: "info",
  resolved: "success",
  cancelled: "neutral",
};

export default function Support() {
  const { user } = useAuth();
  const [recipient, setRecipient] = useState<SupportRecipient | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState<SupportRequest[]>([]);

  useEffect(() => {
    if (user) listSupportRequests(user.uid).then(setRequests);
  }, [user]);

  async function submit() {
    if (!recipient || !message.trim() || !user) return;
    setSubmitting(true);
    try {
      const created = await createSupportRequest({
        recipientType: recipient,
        message,
        studentContext: user.role === "student" ? "Class 10 - A · Roll 23" : undefined,
      });
      setRequests((prev) => [created, ...prev]);
      setMessage("");
      setRecipient(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen pb-8">
      <TopBar title="Support" showBack />
      <div className="screen-pad !pt-0">
        <p className="mb-3 text-sm text-muted-foreground">Who would you like to reach?</p>
        <div className="flex gap-3">
          <RecipientButton icon={GraduationCap} label="Talk to Teacher" active={recipient === "teacher"} onClick={() => setRecipient("teacher")} />
          <RecipientButton icon={Building2} label="Contact Management" active={recipient === "management"} onClick={() => setRecipient("management")} />
        </div>

        {recipient && (
          <div className="mt-5">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe what you need help with…"
              rows={4}
              className="w-full rounded-xl border border-border bg-surface p-3.5 text-sm focus:border-edvia-400 focus:outline-none focus:ring-2 focus:ring-edvia-100"
            />
            <Button size="lg" className="mt-3 w-full" onClick={submit} disabled={submitting || !message.trim()}>
              {submitting ? "Submitting request…" : "Submit Request"}
            </Button>
          </div>
        )}
      </div>

      {requests.length > 0 && (
        <div className="screen-pad !pt-6">
          <p className="mb-2 text-sm font-semibold text-slate-800">Your Requests</p>
          <div className="space-y-2.5">
            {requests.map((r) => (
              <div key={r.id} className="card p-3.5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium text-edvia-600 capitalize">{r.recipientType}</span>
                  <Badge tone={STATUS_TONE[r.status]}>{r.status[0].toUpperCase() + r.status.slice(1)}</Badge>
                </div>
                <p className="text-sm text-slate-800">{r.message}</p>
                <p className="mt-1.5 text-xs text-muted-foreground">{formatDate(r.createdAt)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RecipientButton({ icon: Icon, label, active, onClick }: { icon: typeof GraduationCap; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-center gap-2 rounded-2xl border bg-surface p-4 text-center",
        active ? "border-edvia-400 ring-2 ring-edvia-100" : "border-border"
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-edvia-100 text-edvia-700">
        <Icon size={18} />
      </span>
      <span className="text-xs font-semibold text-slate-800">{label}</span>
    </button>
  );
}
