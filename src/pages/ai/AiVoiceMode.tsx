import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, MicOff, X } from "lucide-react";
import { EdviaRobot, stateLabel } from "@/components/shared/EdviaRobot";
import { useVoiceAssistant } from "@/hooks/useVoiceAssistant";

export default function AiVoiceMode() {
  const navigate = useNavigate();
  const { state, transcript, micAmplitude, error, connect, disconnect } = useVoiceAssistant();
  const started = useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!started.current) {
      started.current = true;
      void connect();
    }
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const listening = state === "listening";

  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-gradient-to-b from-edvia-900 via-edvia-800 to-edvia-900 px-6 py-8 text-white">
      <div className="flex w-full justify-end">
        <button
          onClick={() => {
            disconnect();
            navigate(-1);
          }}
          className="rounded-full bg-white/10 p-2"
          aria-label="Close voice mode"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center">
        <EdviaRobot size={140} state={state} />
        <p className="mt-6 text-lg font-medium">{error ?? stateLabel(state)}</p>
        <Waveform amplitude={micAmplitude} active={listening || state === "speaking"} />

        {transcript.length > 0 && (
          <div className="mt-6 max-h-40 w-full max-w-sm space-y-2 overflow-y-auto text-center">
            {transcript.slice(-4).map((t) => (
              <p key={t.id} className={t.role === "user" ? "text-sm text-white/70" : "text-sm text-white"}>
                {t.text}
              </p>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        )}
      </div>

      <button
        onClick={() => (state === "disconnected" || state === "error" ? connect() : disconnect())}
        className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-edvia-700 shadow-floating"
        aria-label={state === "disconnected" ? "Reconnect" : "Stop"}
      >
        {state === "disconnected" || state === "error" ? <Mic size={26} /> : <MicOff size={26} />}
      </button>
      <p className="text-xs text-white/60">
        {state === "disconnected" || state === "error" ? "Tap to reconnect" : "Tap to end"}
      </p>
    </div>
  );
}

function Waveform({ amplitude, active }: { amplitude: number; active: boolean }) {
  return (
    <div className="mt-6 flex h-10 items-end gap-1">
      {Array.from({ length: 24 }).map((_, i) => {
        const base = active ? 8 + amplitude * 32 * (0.4 + ((i * 37) % 100) / 100) : 4;
        return <span key={i} className="w-1 rounded-full bg-white/70 transition-[height] duration-100" style={{ height: `${base}px` }} />;
      })}
    </div>
  );
}
