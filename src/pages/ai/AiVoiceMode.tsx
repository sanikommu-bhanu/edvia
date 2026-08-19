import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, MicOff, X, MessageSquare, Volume2 } from "lucide-react";
import { EdviaRobot } from "@/components/shared/EdviaRobot";
import { stateLabel } from "@/components/shared/agentState";
import { useVoiceAssistant } from "@/hooks/useVoiceAssistant";
import { cn } from "@/lib/utils";

export default function AiVoiceMode() {
  const navigate = useNavigate();
  const { state, transcript, amplitude, activity, error, canFallBackToChat, muted, connect, disconnect, toggleMute } =
    useVoiceAssistant();
  const started = useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!started.current) {
      started.current = true;
      void connect();
    }
    return () => disconnect();
    // Connect exactly once on mount; connect/disconnect are stable callbacks
    // but re-running this would tear down a live session on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const ended = state === "disconnected" || state === "error";
  const audible = state === "listening" || state === "speaking";

  function leave() {
    disconnect();
    navigate(-1);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-gradient-to-b from-edvia-900 via-edvia-800 to-edvia-900 px-6 py-8 text-white">
      <div className="flex w-full items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-white/50">Voice Mode</span>
        <button onClick={leave} className="rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="Close voice mode">
          <X size={18} />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center">
        <EdviaRobot size={140} state={state} amplitude={amplitude} />

        <p className="mt-6 text-center text-lg font-medium" aria-live="polite">
          {activity ?? stateLabel(state)}
        </p>
        {state === "speaking" && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-white/60">
            <Volume2 size={12} /> Speak any time to interrupt
          </p>
        )}

        <Waveform amplitude={amplitude} active={audible} />

        {error && (
          <div className="mt-6 w-full max-w-sm rounded-2xl bg-white/10 p-4 text-center">
            <p className="text-sm text-white/90">{error}</p>
            {canFallBackToChat && (
              <button
                onClick={() => navigate("/ai/chat")}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-semibold text-edvia-700"
              >
                <MessageSquare size={13} /> Continue with chat
              </button>
            )}
          </div>
        )}

        {transcript.length > 0 && (
          <div className="mt-6 max-h-44 w-full max-w-sm space-y-2 overflow-y-auto text-center">
            {transcript.slice(-5).map((t) => (
              <p
                key={t.id}
                className={cn(
                  "text-sm",
                  t.role === "user" ? "text-white/60" : "text-white",
                  !t.final && "opacity-70"
                )}
              >
                {t.text}
              </p>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-4">
          {!ended && (
            <button
              onClick={toggleMute}
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-full transition-colors",
                muted ? "bg-white/25 text-white" : "bg-white/10 text-white/80 hover:bg-white/20"
              )}
              aria-label={muted ? "Unmute microphone" : "Mute microphone"}
              aria-pressed={muted}
            >
              {muted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
          )}

          <button
            onClick={() => (ended ? void connect() : disconnect())}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-edvia-700 shadow-floating transition-transform active:scale-95"
            aria-label={ended ? "Reconnect" : "End voice session"}
          >
            {ended ? <Mic size={26} /> : <X size={26} />}
          </button>

          {!ended && (
            <button
              onClick={() => navigate("/ai/chat")}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20"
              aria-label="Switch to chat"
            >
              <MessageSquare size={20} />
            </button>
          )}
        </div>
        <p className="text-xs text-white/60">
          {ended ? "Tap to reconnect" : muted ? "Microphone muted" : "Tap the centre button to end"}
        </p>
      </div>
    </div>
  );
}

/** Bars are driven by real audio energy from the mic or EDVIA's own voice. */
function Waveform({ amplitude, active }: { amplitude: number; active: boolean }) {
  return (
    <div className="mt-6 flex h-10 items-end gap-1" aria-hidden>
      {Array.from({ length: 24 }).map((_, i) => {
        // A fixed per-bar weighting keeps the shape organic without being
        // random — the same input always produces the same silhouette.
        const weight = 0.4 + ((i * 37) % 100) / 100;
        const height = active ? 6 + amplitude * 34 * weight : 4;
        return (
          <span
            key={i}
            className="w-1 rounded-full bg-white/70 transition-[height] duration-100"
            style={{ height: `${height}px` }}
          />
        );
      })}
    </div>
  );
}
