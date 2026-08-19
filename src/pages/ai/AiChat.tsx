import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Send,
  Mic,
  RotateCcw,
  Check,
  X,
  BookMarked,
  ShieldCheck,
  FileText,
  CalendarCheck2,
  GraduationCap,
  School,
  Copy,
  CheckCheck,
  RefreshCw,
  Square,
  AlertCircle,
} from "lucide-react";
import { TopBar } from "@/layouts/TopBar";
import { EdviaRobot } from "@/components/shared/EdviaRobot";
import { useAuth } from "@/app/AuthContext";
import { useConversation } from "@/hooks/useConversation";
import { suggestedStartersFor, SOURCE_LABELS } from "@/services/ai/ai.service";
import { cn } from "@/lib/utils";
import type { AISource, AISourceKind, ChatMessage } from "@/types";
import { useTranslation } from "@/i18n";

const SOURCE_ICON: Record<AISourceKind, typeof BookMarked> = {
  policy: ShieldCheck,
  educational: BookMarked,
  resource: FileText,
  document: FileText,
  attendance: CalendarCheck2,
  academic: GraduationCap,
  school: School,
};

export default function AiChat() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const location = useLocation() as { state?: { initialMessage?: string } };
  const navigate = useNavigate();
  const {
    messages,
    state,
    activity,
    pendingConfirmation,
    busy,
    send,
    confirm,
    decline,
    regenerate,
    retry,
    stop,
    startFresh,
  } = useConversation();
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const initialSent = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activity]);

  useEffect(() => {
    const initial = location.state?.initialMessage;
    if (initial && !initialSent.current) {
      initialSent.current = true;
      void send(initial);
    }
    // Intentionally runs once: the initial message is a navigation payload,
    // not reactive state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSend() {
    if (!draft.trim() || busy) return;
    void send(draft);
    setDraft("");
  }

  const starters = user ? suggestedStartersFor(user.role) : [];
  const lastMessage = messages[messages.length - 1];
  const canRegenerate =
    !busy && !pendingConfirmation && lastMessage?.role === "assistant" && lastMessage.status === "sent";
  const showRetry = !busy && lastMessage?.role === "assistant" && lastMessage.status === "error";

  return (
    // 100svh, not 100vh: on mobile Safari and Chrome, 100vh is the tallest
    // possible viewport, so with the URL bar visible the composer sits below
    // the fold. svh tracks the CURRENT viewport, keeping the input reachable.
    <div className="flex h-[100svh] flex-col overflow-hidden">
      <TopBar
        title="AI Chat"
        showBack
        right={
          <div className="flex items-center gap-1">
            <button
              onClick={() => void startFresh()}
              className="rounded-full p-2 hover:bg-muted"
              aria-label="Start a new conversation"
            >
              <RotateCcw size={17} />
            </button>
            <button onClick={() => navigate("/ai/voice")} className="rounded-full p-2 hover:bg-muted" aria-label="Voice mode">
              <Mic size={18} />
            </button>
          </div>
        }
      />

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain screen-pad !pt-0 pb-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center pt-10 text-center animate-fade-in">
            <EdviaRobot size={72} state="idle" />
            <p className="mt-3 text-sm font-semibold text-slate-800">
              Hello {user?.fullName?.split(" ")[0] ?? "there"} 🎓
            </p>
            <p className="mt-1 max-w-[260px] text-xs text-muted-foreground">
              Ask me anything about school — I'll look it up in your records rather than guessing.
            </p>
            <div className="mt-5 grid w-full max-w-sm grid-cols-1 gap-2">
              {starters.map((s) => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="card px-3.5 py-2.5 text-left text-sm text-slate-700 transition-colors hover:border-edvia-300"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            onFollowUp={(text) => void send(text)}
            suppressFollowUps={Boolean(pendingConfirmation) || busy}
          />
        ))}

        {pendingConfirmation && !busy && (
          <ConfirmationCard
            summary={pendingConfirmation.summary}
            details={pendingConfirmation.details}
            onConfirm={() => void confirm()}
            onDecline={() => void decline()}
          />
        )}

        {busy && <ActivityIndicator label={activity} state={state} />}

        {(canRegenerate || showRetry) && (
          <div className="flex justify-start gap-2 pt-1">
            {showRetry && (
              <button
                onClick={() => void retry()}
                className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-edvia-300"
              >
                <RefreshCw size={13} /> {t("action.retry")}
              </button>
            )}
            {canRegenerate && (
              <button
                onClick={() => void regenerate()}
                className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-edvia-300"
              >
                <RefreshCw size={13} /> Regenerate
              </button>
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Composer. Padded by --safe-bottom so it clears the home indicator;
          the chat route sits outside RoleShell so there is no bottom nav to
          account for here. */}
      <div
        className="shrink-0 border-t border-border bg-surface/95 px-3 pt-2.5 backdrop-blur-xl"
        style={{ paddingBottom: "calc(var(--safe-bottom) + 0.625rem)" }}
      >
        <div className="flex items-center gap-1 rounded-[20px] border border-border bg-surface p-1.5 shadow-soft focus-within:border-edvia-300">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={busy ? t("ai.thinking") : t("ai.askPlaceholder")}
            aria-label="Message EDVIA"
            enterKeyHint="send"
            // 16px minimum: below it, iOS zooms the viewport on focus and
            // throws the user out of the conversation mid-sentence.
            className="min-w-0 flex-1 bg-transparent px-2.5 text-base outline-none disabled:opacity-60 lg:text-[15px]"
          />
          {busy ? (
            <button onClick={stop} className="tap rounded-2xl bg-muted text-slate-700" aria-label="Stop generating">
              <Square size={16} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!draft.trim()}
              className="tap rounded-2xl bg-gradient-to-br from-edvia-500 to-edvia-600 text-white shadow-soft transition-all disabled:from-muted disabled:to-muted disabled:text-muted-foreground disabled:shadow-none"
              aria-label={t("action.send")}
            >
              <Send size={17} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  onFollowUp,
  suppressFollowUps,
}: {
  message: ChatMessage;
  onFollowUp: (text: string) => void;
  suppressFollowUps: boolean;
}) {
  const isUser = message.role === "user";
  const isError = message.status === "error";
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard permission denied — nothing useful to tell the user here.
    }
  }

  // An assistant bubble with no content yet is the streaming placeholder;
  // the activity indicator below the thread already covers that case.
  if (!isUser && !message.content) return null;

  return (
    <div className={cn("flex flex-col animate-fade-in", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "rounded-br-md bg-edvia-500 text-white"
            : isError
              ? "rounded-bl-md border border-danger/20 bg-danger/5 text-slate-800"
              : "rounded-bl-md bg-muted text-slate-800"
        )}
      >
        {isError && (
          <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-danger">
            <AlertCircle size={13} /> Couldn't complete that
          </span>
        )}
        {message.content}
      </div>

      {!isUser && message.sources && message.sources.length > 0 && (
        <div className="mt-1.5 max-w-[85%] space-y-1.5">
          {message.sources.map((s) => (
            <SourceChip key={s.id} source={s} />
          ))}
        </div>
      )}

      {!isUser && !isError && message.content.length > 40 && (
        <button
          onClick={() => void copy()}
          className="mt-1 flex items-center gap-1 px-1 text-[11px] text-muted-foreground hover:text-slate-700"
          aria-label="Copy answer"
        >
          {copied ? <CheckCheck size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      )}

      {!isUser && !suppressFollowUps && message.suggestedFollowUps && message.suggestedFollowUps.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {message.suggestedFollowUps.map((s) => (
            <button
              key={s}
              onClick={() => onFollowUp(s)}
              className="rounded-full border border-edvia-200 bg-edvia-50 px-3 py-1 text-xs font-medium text-edvia-700 hover:bg-edvia-100"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Evidence for a factual answer. Names the system of record ("Attendance
 * Records"), never an internal collection or document id.
 */
function SourceChip({ source }: { source: AISource }) {
  const Icon = SOURCE_ICON[source.kind] ?? FileText;
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] text-muted-foreground">
      <Icon size={12} className="shrink-0 text-edvia-500" />
      <span className="font-medium text-slate-700">Source:</span>
      {SOURCE_LABELS[source.kind]}
      {source.section ? ` · §${source.section}` : ""}
    </div>
  );
}

/**
 * The confirmation step for anything that changes data. The summary comes
 * from the server, which read the live record first — so it states the
 * current value, not just the requested one.
 */
function ConfirmationCard({
  summary,
  details,
  onConfirm,
  onDecline,
}: {
  summary: string;
  details?: Record<string, unknown>;
  onConfirm: () => void;
  onDecline: () => void;
}) {
  const from = details?.from as string | null | undefined;
  const to = details?.to as string | undefined;

  return (
    <div className="card animate-fade-in border-edvia-200 bg-edvia-50/60 p-3.5">
      <p className="text-sm text-slate-800">{summary}</p>
      {to && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="rounded-md bg-white px-2 py-1 font-medium capitalize text-muted-foreground">
            {from ?? "Not marked"}
          </span>
          <span className="text-muted-foreground">→</span>
          <span className="rounded-md bg-edvia-500 px-2 py-1 font-medium capitalize text-white">{to}</span>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button
          onClick={onConfirm}
          className="flex items-center gap-1.5 rounded-full bg-success px-3.5 py-2 text-xs font-semibold text-white"
        >
          <Check size={14} /> Yes, go ahead
        </button>
        <button
          onClick={onDecline}
          className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-slate-700"
        >
          <X size={14} /> Cancel
        </button>
      </div>
    </div>
  );
}

/** Shows what EDVIA is genuinely doing right now — never a fake status. */
function ActivityIndicator({ label, state }: { label: string | null; state: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-muted px-4 py-3">
        <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-edvia-400" />
        <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-edvia-400 [animation-delay:0.15s]" />
        <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-edvia-400 [animation-delay:0.3s]" />
      </div>
      {label && (
        <span
          className={cn(
            "text-xs",
            state === "tool_execution" || state === "verifying" ? "font-medium text-edvia-600" : "text-muted-foreground"
          )}
        >
          {label}
        </span>
      )}
    </div>
  );
}
