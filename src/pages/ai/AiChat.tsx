import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Send, Mic, RotateCcw, Check, X, BookMarked, ShieldCheck, FileText } from "lucide-react";
import { TopBar } from "@/layouts/TopBar";
import { EdviaRobot } from "@/components/shared/EdviaRobot";
import { useAuth } from "@/app/AuthContext";
import { useConversation } from "@/hooks/useConversation";
import { cn } from "@/lib/utils";
import type { AISource } from "@/types";

const SOURCE_ICON: Record<AISource["kind"], typeof BookMarked> = {
  policy: ShieldCheck, educational: BookMarked, resource: FileText, document: FileText,
};

export default function AiChat() {
  const { user } = useAuth();
  const location = useLocation() as { state?: { initialMessage?: string } };
  const navigate = useNavigate();
  const { messages, state, pendingConfirmation, send, confirm, decline, startFresh } = useConversation();
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const initialSent = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, state]);

  useEffect(() => {
    const initial = location.state?.initialMessage;
    if (initial && !initialSent.current) {
      initialSent.current = true;
      void send(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSend() {
    if (!draft.trim()) return;
    void send(draft);
    setDraft("");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar
        title="AI Chat"
        showBack
        right={
          <div className="flex items-center gap-1">
            <button onClick={() => startFresh()} className="rounded-full p-2 hover:bg-muted" aria-label="New conversation">
              <RotateCcw size={17} />
            </button>
            <button onClick={() => navigate("/ai/voice")} className="rounded-full p-2 hover:bg-muted" aria-label="Voice mode">
              <Mic size={18} />
            </button>
          </div>
        }
      />

      <div className="flex-1 space-y-4 overflow-y-auto screen-pad !pt-0 pb-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center pt-10 text-center">
            <EdviaRobot size={72} />
            <p className="mt-3 text-sm font-semibold text-slate-800">Hello {user?.fullName?.split(" ")[0]} 🎓</p>
            <p className="mt-1 max-w-[240px] text-xs text-muted-foreground">
              You can ask me about: Homework Help, Concept Explanation, Summaries, Study Tips, and more!
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex flex-col", m.role === "user" ? "items-end" : "items-start")}>
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                m.role === "user" ? "rounded-br-md bg-edvia-500 text-white" : "rounded-bl-md bg-muted text-slate-800"
              )}
            >
              {m.content}
            </div>

            {m.role === "assistant" && m.sources && m.sources.length > 0 && (
              <div className="mt-1.5 max-w-[80%] space-y-1.5">
                {m.sources.map((s) => {
                  const Icon = SOURCE_ICON[s.kind];
                  return (
                    <div key={s.id} className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] text-muted-foreground">
                      <Icon size={12} className="text-edvia-500" />
                      {s.title}
                      {s.section ? ` · ${s.section}` : ""}
                    </div>
                  );
                })}
              </div>
            )}

            {m.role === "assistant" && m.suggestedFollowUps && m.suggestedFollowUps.length > 0 && !pendingConfirmation && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {m.suggestedFollowUps.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-full border border-edvia-200 bg-edvia-50 px-3 py-1 text-xs font-medium text-edvia-700">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {pendingConfirmation && (
          <div className="flex justify-start gap-2">
            <button onClick={confirm} className="flex items-center gap-1.5 rounded-full bg-success/10 px-3.5 py-2 text-xs font-semibold text-success">
              <Check size={14} /> Confirm
            </button>
            <button onClick={decline} className="flex items-center gap-1.5 rounded-full bg-danger/10 px-3.5 py-2 text-xs font-semibold text-danger">
              <X size={14} /> Cancel
            </button>
          </div>
        )}

        {state === "thinking" && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-muted px-4 py-3">
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-edvia-400" />
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-edvia-400 [animation-delay:0.15s]" />
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-edvia-400 [animation-delay:0.3s]" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask anything…"
            className="flex-1 bg-transparent px-3 text-sm outline-none"
          />
          <button onClick={handleSend} className="rounded-xl bg-edvia-500 p-2.5 text-white hover:bg-edvia-600" aria-label="Send">
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
