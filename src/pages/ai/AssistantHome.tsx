import { useNavigate } from "react-router-dom";
import { Mic, Send, ScanLine, ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { EdviaRobot } from "@/components/shared/EdviaRobot";
import { useEdvia } from "@/hooks/useEdvia";
import { useTranslation } from "@/i18n";
import { firstNameOf } from "@/lib/greeting";

// ==========================================================================
// Assistant home — the EDVIA experience on a phone
// --------------------------------------------------------------------------
// The robot is the hero, not a sidebar decoration: on mobile it gets the
// top third of the screen, because the assistant IS the product and this is
// the screen that has to convey that in the first second.
//
// Layout, top to bottom: robot → greeting → quick actions → input → voice.
// That order is deliberate — the composer sits at the bottom within thumb
// reach, and the quick actions above it are the fastest path to a real
// answer for someone who doesn't know what to type.
//
// Every quick action is a real query that runs the real tool path. None of
// them is a canned response.
// ==========================================================================

export default function AssistantHome() {
  const { t } = useTranslation();
  const { user, starters, capabilities } = useEdvia();
  const [draft, setDraft] = useState("");
  const navigate = useNavigate();
  const firstName = firstNameOf(user?.fullName);

  function go(text?: string) {
    const q = (text ?? draft).trim();
    if (!q) return;
    navigate("/ai/chat", { state: { initialMessage: q } });
  }

  return (
    <div className="ai-surface flex min-h-[100svh] flex-col">
      {/* ---- hero ---------------------------------------------------- */}
      <div className="screen-pad safe-top flex flex-col items-center pb-2 text-center">
        <div className="animate-scale-in">
          <EdviaRobot size={128} state="idle" />
        </div>

        <h1 className="mt-3 font-display text-title font-bold">
          Hi {firstName}, I&apos;m EDVIA
        </h1>
        <p className="mt-1 text-small text-muted-foreground">How can I help you today?</p>
      </div>

      {/* ---- quick actions --------------------------------------------
          Role-aware, and each one executes the genuine tool path. */}
      <div className="screen-pad flex-1 pt-4">
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Try asking
        </p>

        <div className="grid gap-2.5">
          {starters.map((action, i) => (
            <button
              key={action}
              onClick={() => go(action)}
              style={{ animationDelay: `${i * 60}ms` }}
              className="group flex animate-slide-up items-center justify-between gap-3 rounded-2xl border border-border bg-surface/80 px-4 py-3.5 text-left backdrop-blur transition-all duration-200 hover:border-edvia-300 hover:shadow-card active:scale-[0.99]"
            >
              <span className="text-[14.5px] font-medium leading-snug text-slate-700">{action}</span>
              <ArrowUpRight
                size={16}
                className="shrink-0 text-muted-foreground transition-colors group-hover:text-edvia-500"
              />
            </button>
          ))}
        </div>

        <p className="mt-5 text-center text-[12px] leading-relaxed text-muted-foreground">
          I can help with {capabilities.slice(0, -1).join(", ")} and{" "}
          {capabilities[capabilities.length - 1]}.
        </p>
      </div>

      {/* ---- composer --------------------------------------------------
          Sticky above the bottom nav so it is always in thumb reach, and
          inset by --safe-bottom + --nav-total so it never hides under the
          home indicator or the nav bar. */}
      <div
        className="sticky bottom-0 z-30 px-[var(--screen-gutter)] pt-2"
        style={{ paddingBottom: "calc(var(--nav-total) + 0.5rem)" }}
      >
        <div className="flex items-center gap-1 rounded-[22px] border border-border bg-surface/95 p-1.5 shadow-card backdrop-blur-xl">
          <button
            onClick={() => navigate("/scan")}
            aria-label="Scan a document"
            className="tap rounded-2xl text-muted-foreground transition-colors hover:bg-muted hover:text-edvia-600"
          >
            <ScanLine size={19} />
          </button>

          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
            placeholder={t("ai.askPlaceholder")}
            aria-label="Ask EDVIA"
            enterKeyHint="send"
            className="min-w-0 flex-1 bg-transparent px-1 outline-none placeholder:text-muted-foreground"
          />

          {/* Voice stays visible even with a draft — it is a mode, not a
              fallback for an empty input. */}
          <button
            onClick={() => navigate("/ai/voice")}
            aria-label={t("ai.voiceMode")}
            className="tap rounded-2xl text-muted-foreground transition-colors hover:bg-muted hover:text-edvia-600"
          >
            <Mic size={19} />
          </button>

          <button
            onClick={() => go()}
            aria-label={t("action.send")}
            disabled={!draft.trim()}
            className="tap rounded-2xl bg-gradient-to-br from-edvia-500 to-edvia-600 text-white shadow-soft transition-all duration-200 disabled:from-muted disabled:to-muted disabled:text-muted-foreground disabled:shadow-none"
          >
            <Send size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
