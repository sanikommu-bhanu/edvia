import { useMemo, useState } from "react";
import { Inbox, Check, CheckCheck } from "lucide-react";
import { TopBar } from "@/layouts/TopBar";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState, LoadingState, ErrorState } from "@/components/shared/StateViews";
import { useAsyncData } from "@/hooks/useAsyncData";
import { getSupportInbox, updateSupportRequestStatus } from "@/services/support/support.service";
import { formatDate } from "@/lib/utils";
import { SUPPORT_NEXT_STATUSES, type SupportRequest, type SupportStatus } from "@/types";

// ==========================================================================
// Support Inbox — the staff end of escalation
// --------------------------------------------------------------------------
// Creating a request was only half a workflow. Until a teacher can see the
// request and record what they did about it, "escalation to a human" is a
// write-only queue: the parent is told someone will call, and nothing ever
// records whether anyone did.
//
// The rule this screen is built around: status shown is status CONFIRMED.
// A tap on Acknowledge or Resolve does not move the card. It calls the
// server, waits, and re-renders from the record the server returned. A 409
// (a colleague already advanced it) shows as an error and reloads the queue
// rather than leaving an optimistic lie on screen.
// ==========================================================================

const STATUS_TONE: Record<SupportStatus, "warning" | "info" | "success" | "neutral"> = {
  pending: "warning",
  acknowledged: "info",
  resolved: "success",
  cancelled: "neutral",
};

const ACTION_LABEL: Record<string, string> = {
  acknowledged: "Acknowledge",
  resolved: "Resolve",
};

const TABS = [
  { value: "pending", label: "Pending" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "resolved", label: "Resolved" },
];

export default function SupportInbox() {
  const [tab, setTab] = useState("pending");
  /** requestId currently being transitioned — one at a time, per card. */
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  // The whole queue is fetched once and filtered client-side, so switching
  // tabs is instant and the counts stay consistent with what's on screen.
  const { data, loading, error, reload } = useAsyncData(() => getSupportInbox(), []);

  const requests = useMemo(() => data?.requests ?? [], [data]);
  const visible = requests.filter((r) => r.status === tab);

  async function advance(request: SupportRequest, to: SupportStatus) {
    setBusyId(request.id);
    setActionError(null);
    setConfirmation(null);
    try {
      const updated = await updateSupportRequestStatus(
        request.id,
        to as Exclude<SupportStatus, "pending">
      );
      // Stated only after the server returned the transitioned record.
      setConfirmation(`Request marked ${updated.status}.`);
      reload();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "We couldn't update that request. Please try again."
      );
      // Whatever went wrong, the server is the authority — re-sync rather
      // than leaving the card showing a status nobody confirmed.
      reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen pb-8">
      <TopBar title="Support Inbox" />

      <div className="screen-pad !pt-0 space-y-3">
        <div className="flex gap-2.5">
          <StatCard value={data?.counts.pending ?? 0} label="Pending" tone="warning" />
          <StatCard value={data?.counts.acknowledged ?? 0} label="Acknowledged" tone="brand" />
          <StatCard value={data?.counts.resolved ?? 0} label="Resolved" tone="success" />
        </div>

        <Tabs tabs={TABS} active={tab} onChange={setTab} />

        {confirmation && (
          <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success" role="status">
            {confirmation}
          </p>
        )}
        {actionError && (
          <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
            {actionError}
          </p>
        )}
      </div>

      <div className="screen-pad space-y-2.5 pb-8">
        {loading && <LoadingState rows={3} label="Loading support requests" />}
        {!loading && error && <ErrorState body={error} onRetry={reload} />}

        {!loading && !error && visible.length === 0 && (
          <EmptyState
            icon={Inbox}
            title={tab === "pending" ? "Nothing waiting" : `No ${tab} requests`}
            body={
              tab === "pending"
                ? "Call-back and support requests routed to you appear here as soon as a family raises one."
                : "Requests move here once they've been actioned."
            }
          />
        )}

        {!loading &&
          !error &&
          visible.map((r) => {
            const next = SUPPORT_NEXT_STATUSES[r.status] ?? [];
            const working = busyId === r.id;
            return (
              <article key={r.id} className="card p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium capitalize text-edvia-600">
                    {r.requestedByRole ?? "Family"} · {r.recipientType}
                  </span>
                  <Badge tone={STATUS_TONE[r.status]}>
                    {r.status[0].toUpperCase() + r.status.slice(1)}
                  </Badge>
                </div>

                {r.studentContext && (
                  <p className="mb-1 text-xs font-medium text-slate-700">{r.studentContext}</p>
                )}
                {/* Family-authored text. Rendered as text — never as markup,
                    and never interpreted as an instruction by anything. */}
                <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{r.message}</p>

                <p className="mt-2 text-xs text-muted-foreground">
                  {formatDate(r.createdAt)}
                  {r.updatedAt ? ` · updated ${formatDate(r.updatedAt)}` : ""}
                </p>

                {next.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {next.map((status) => (
                      <button
                        key={status}
                        onClick={() => void advance(r, status)}
                        disabled={working}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-border bg-surface px-4 text-xs font-semibold text-slate-700 transition-colors hover:border-edvia-300 disabled:opacity-50"
                      >
                        {status === "resolved" ? <CheckCheck size={14} /> : <Check size={14} />}
                        {working ? "Saving…" : ACTION_LABEL[status]}
                      </button>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
      </div>
    </div>
  );
}
