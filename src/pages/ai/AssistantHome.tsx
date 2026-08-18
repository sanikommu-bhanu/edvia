import { useNavigate } from "react-router-dom";
import { Mic, Send, ScanLine } from "lucide-react";
import { useState } from "react";
import { EdviaRobot } from "@/components/shared/EdviaRobot";
import { useAuth } from "@/app/AuthContext";
import { SUGGESTED_ACTIONS } from "@/services/ai/ai.service";

export default function AssistantHome() {
  const { user } = useAuth();
  const [draft, setDraft] = useState("");
  const navigate = useNavigate();

  function go(text?: string) {
    const q = text ?? draft;
    if (!q.trim()) return;
    navigate("/ai/chat", { state: { initialMessage: q } });
  }

  return (
    <div className="flex min-h-screen flex-col justify-between px-5 pb-6 pt-8">
      <div className="flex flex-col items-center text-center">
        <EdviaRobot size={104} />
        <h1 className="mt-4 font-display text-xl font-bold">Hello {user?.fullName?.split(" ")[0] ?? "there"}! 👋</h1>
        <p className="mt-1 text-sm text-muted-foreground">How can I help you today?</p>

        <div className="mt-6 grid w-full grid-cols-2 gap-2.5">
          {SUGGESTED_ACTIONS.map((action) => (
            <button
              key={action}
              onClick={() => go(action)}
              className="card px-3 py-3 text-left text-sm font-medium text-slate-700 hover:border-edvia-300"
            >
              {action}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-2 shadow-soft">
          <button onClick={() => navigate("/scan")} aria-label="Scan document" className="rounded-xl p-2.5 text-muted-foreground hover:bg-muted">
            <ScanLine size={18} />
          </button>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
            placeholder="Ask anything…"
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <button onClick={() => navigate("/ai/voice")} aria-label="Voice mode" className="rounded-xl p-2.5 text-muted-foreground hover:bg-muted">
            <Mic size={18} />
          </button>
          <button onClick={() => go()} aria-label="Send" className="rounded-xl bg-edvia-500 p-2.5 text-white hover:bg-edvia-600">
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
