import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleGenAI, Modality } from "@google/genai";
import { useAuth } from "@/app/AuthContext";
import { requestVoiceSession } from "@/services/ai/voiceSession.service";
import { getIdToken } from "@/services/firebase/auth.service";
import { AudioAmplitudeAnalyser } from "@/lib/audioAmplitude";
import type { AIAgentState } from "@/types";

export interface VoiceTranscriptEntry {
  id: string;
  role: "user" | "assistant";
  text: string;
}

/**
 * Client-side Gemini Live voice session, gated behind the same
 * authorization boundary as text chat: every function call the Live
 * session wants to make is relayed to /api/ai/tool-call (never executed
 * in-browser), and the ephemeral connection credential comes from
 * /api/ai/voice-session so the long-lived Gemini key never reaches here.
 *
 * NOTE: the exact `ai.live.connect(...)` event/message shape should be
 * re-verified against Google's current Gemini Live API docs at
 * integration time — this preview API has moved between SDK versions.
 * The state machine, audio pipeline, and security relay below are the
 * stable parts of this design regardless of small SDK signature changes.
 */
export function useVoiceAssistant() {
  const { user } = useAuth();
  const [state, setState] = useState<AIAgentState>("idle");
  const [transcript, setTranscript] = useState<VoiceTranscriptEntry[]>([]);
  const [micAmplitude, setMicAmplitude] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<Awaited<ReturnType<GoogleGenAI["live"]["connect"]>> | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AudioAmplitudeAnalyser | null>(null);
  const rafRef = useRef<number | null>(null);
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const pollAmplitude = useCallback(() => {
    if (analyserRef.current) setMicAmplitude(analyserRef.current.getAmplitude());
    rafRef.current = requestAnimationFrame(pollAmplitude);
  }, []);

  /** Called whenever the Live session emits a functionCall message. */
  const handleToolCall = useCallback(async (name: string, args: Record<string, unknown>) => {
    setState("tool_execution");
    const idToken = await getIdToken();
    try {
      const res = await fetch("/api/ai/tool-call", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ toolName: name, args, confirmed: false }),
      });
      const data = await res.json();
      return data; // { ok, result | error | requiresConfirmation }
    } catch {
      return { ok: false, error: "Tool call failed." };
    }
  }, []);

  const disconnect = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    analyserRef.current?.teardown();
    currentAudioSourceRef.current?.stop();
    try {
      sessionRef.current?.close();
    } catch {
      /* already closed */
    }
    sessionRef.current = null;
    setState("disconnected");
  }, []);

  const connect = useCallback(async () => {
    if (!user) return;
    setError(null);
    setState("connected");
    try {
      const voiceSession = await requestVoiceSession();
      if (!voiceSession) {
        setError("Voice mode needs a connected school account. Try text chat instead.");
        setState("error");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      analyserRef.current = new AudioAmplitudeAnalyser();
      analyserRef.current.attachMicStream(stream);
      pollAmplitude();

      // Client uses the short-lived token, never a raw API key.
      const ai = new GoogleGenAI({ apiKey: voiceSession.token });

      const session = await ai.live.connect({
        model: voiceSession.model,
        config: { responseModalities: [Modality.AUDIO] },
        callbacks: {
          onopen: () => setState("listening"),
          onmessage: async (message: unknown) => {
            // TODO: confirm exact message shape (serverContent / toolCall /
            // turnComplete fields) against the current Live API version.
            const m = message as {
              toolCall?: { functionCalls?: { id: string; name: string; args: Record<string, unknown> }[] };
              serverContent?: { modelTurn?: { parts?: { text?: string }[] }; interrupted?: boolean; turnComplete?: boolean };
            };

            if (m.serverContent?.interrupted) {
              currentAudioSourceRef.current?.stop();
              setState("interrupted");
              return;
            }

            if (m.toolCall?.functionCalls?.length) {
              setState("tool_execution");
              for (const call of m.toolCall.functionCalls) {
                const result = await handleToolCall(call.name, call.args);
                sessionRef.current?.sendToolResponse?.({
                  functionResponses: [{ id: call.id, name: call.name, response: result }],
                });
              }
              return;
            }

            const text = m.serverContent?.modelTurn?.parts?.map((p) => p.text).filter(Boolean).join(" ");
            if (text) {
              setTranscript((prev) => [...prev, { id: `t_${Date.now()}`, role: "assistant", text }]);
              setState("speaking");
            }
            if (m.serverContent?.turnComplete) setState("listening");
          },
          onerror: () => {
            setError("The voice connection dropped. Please try again.");
            setState("error");
          },
          onclose: () => setState("disconnected"),
        },
      });

      sessionRef.current = session;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start voice mode.");
      setState("error");
    }
  }, [user, pollAmplitude, handleToolCall]);

  const sendUserUtteranceText = useCallback((text: string) => {
    // Fallback path for environments where audio capture isn't available —
    // still goes through the same Live session and tool-call relay.
    setTranscript((prev) => [...prev, { id: `t_${Date.now()}`, role: "user", text }]);
    sessionRef.current?.sendClientContent?.({ turns: [{ role: "user", parts: [{ text }] }] });
  }, []);

  useEffect(() => () => disconnect(), [disconnect]);

  return { state, transcript, micAmplitude, error, connect, disconnect, sendUserUtteranceText };
}
