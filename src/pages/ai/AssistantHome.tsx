import { useNavigate } from "react-router-dom";
import { Mic, Send, ScanLine } from "lucide-react";
import { useState } from "react";
import { EdviaRobot } from "@/components/shared/EdviaRobot";
import { useEdvia } from "@/hooks/useEdvia";
import { useTranslation } from "@/i18n";

export default function AssistantHome() {
  const { t } = useTranslation();
  const { firstName, starters, capabilities } = useEdvia();
  const [draft, setDraft] = useState("");
  const navigate = useNavigate();

  function go(text?: string) {
    const q = (text ?? draft).trim();
    if (!q) return;
    navigate("/ai/chat", { state: { initialMessage: q } });
  }

  return (
    <div className="flex min-h-screen flex-col justify-between px-5 pb-6 pt-8">
      <div className="flex flex-col items-center text-center">
        <EdviaRobot size={104} state="idle" />
        <h1 className="mt-4 font-display text-xl font-bold">Hello {firstName}! 👋</h1>
        <p className="mt-1 text-sm text-muted-foreground">How can I help you today?</p>

        {/* Role-aware starters: what EDVIA can actually do for THIS user. */}
        <div className="mt-6 grid w-full gap-2.5">
          {starters.map((action) => (
            <button
              key={action}
              onClick={() => go(action)}
              className="card px-4 py-3 text-left text-sm font-medium text-slate-700 transition-colors hover:border-edvia-300"
            >
              {action}
            </button>
          ))}
        </div>

        <p className="mt-5 max-w-[280px] text-xs text-muted-foreground">
          I can help with {capabilities.slice(0, -1).join(", ")} and {capabilities[capabilities.length - 1]}.
        </p>
      </div>

      <div className="mt-8">
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-2 shadow-soft">
          <button
            onClick={() => navigate("/scan")}
            aria-label="Scan document"
            className="rounded-xl p-2.5 text-muted-foreground hover:bg-muted"
          >
            <ScanLine size={18} />
          </button>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
            placeholder={t("ai.askPlaceholder")}
            aria-label="Ask EDVIA"
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <button
            onClick={() => navigate("/ai/voice")}
            aria-label="Voice mode"
            className="rounded-xl p-2.5 text-muted-foreground hover:bg-muted"
          >
            <Mic size={18} />
          </button>
          <button
            onClick={() => go()}
            aria-label="Send"
            disabled={!draft.trim()}
            className="rounded-xl bg-edvia-500 p-2.5 text-white transition-colors hover:bg-edvia-600 disabled:opacity-40"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
