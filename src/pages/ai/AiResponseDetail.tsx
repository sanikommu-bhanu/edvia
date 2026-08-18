import { useLocation, useNavigate } from "react-router-dom";
import { ShieldCheck, BookMarked, FileText, CalendarCheck2, GraduationCap, School, MessageSquare } from "lucide-react";
import { TopBar } from "@/layouts/TopBar";
import { EmptyState } from "@/components/shared/StateViews";
import { SOURCE_LABELS } from "@/services/ai/ai.service";
import type { AISource, AISourceKind } from "@/types";

const KIND_ICON: Record<AISourceKind, typeof ShieldCheck> = {
  policy: ShieldCheck,
  educational: BookMarked,
  resource: FileText,
  document: FileText,
  attendance: CalendarCheck2,
  academic: GraduationCap,
  school: School,
};

interface ResponseDetailState {
  message?: string;
  sources?: AISource[];
}

/**
 * The expanded view of one assistant answer and the records it came from.
 *
 * It renders whatever the chat screen handed over in navigation state —
 * never a canned example. Opened directly (deep link, refresh) there is
 * genuinely nothing to show, so it says so instead of inventing content.
 */
export default function AiResponseDetail() {
  const navigate = useNavigate();
  const location = useLocation() as { state?: ResponseDetailState };
  const message = location.state?.message;
  const sources = location.state?.sources ?? [];

  return (
    <div className="min-h-screen pb-8">
      <TopBar title="AI Response" showBack />
      <div className="screen-pad !pt-0">
        {!message ? (
          <EmptyState
            icon={MessageSquare}
            title="Nothing to show here"
            body="Open an answer from your chat with EDVIA to see it in full, along with the school records it came from."
            action={{ label: "Go to chat", onClick: () => navigate("/ai/chat") }}
          />
        ) : (
          <>
            {sources.length > 0 && (
              <>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Where this came from
                </p>
                <div className="mb-6 space-y-2">
                  {sources.map((s) => {
                    const Icon = KIND_ICON[s.kind] ?? FileText;
                    return (
                      <div key={s.id} className="card flex items-center gap-3 p-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-edvia-100 text-edvia-700">
                          <Icon size={16} />
                        </span>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{s.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {SOURCE_LABELS[s.kind]}
                            {s.section ? ` · §${s.section}` : ""}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Response</p>
            <div className="card whitespace-pre-wrap p-4 text-sm leading-relaxed text-slate-800">{message}</div>
          </>
        )}
      </div>
    </div>
  );
}
