import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from "@google/genai";
import { useAuth } from "@/app/AuthContext";
import { requestVoiceSession } from "@/services/ai/voiceSession.service";
import { getIdToken } from "@/services/firebase/auth.service";
import { MicCapture, CAPTURE_MIME_TYPE } from "@/lib/audioCapture";
import { PcmStreamPlayer } from "@/lib/audioPlayback";
import type { AIAgentState } from "@/types";

export interface VoiceTranscriptEntry {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** False while the speaker is still mid-utterance. */
  final: boolean;
}

export interface VoiceAssistantApi {
  state: AIAgentState;
  transcript: VoiceTranscriptEntry[];
  /** 0–1 loudness of whichever side is currently making sound. */
  amplitude: number;
  /** Safe, user-facing description of work in flight. Never internal detail. */
  activity: string | null;
  error: string | null;
  /** True when the failure leaves text chat as the sensible next step. */
  canFallBackToChat: boolean;
  muted: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  toggleMute: () => void;
  sendText: (text: string) => void;
}

interface ToolRelayResult {
  ok?: boolean;
  kind?: string;
  error?: string;
  result?: unknown;
  preview?: { summary: string };
}

/** A confirmation offer only stays valid briefly, and only for one use. */
const CONFIRMATION_WINDOW_MS = 120_000;

/**
 * Gemini Live voice session.
 *
 * Security shape, which is the part worth reading:
 *   * The browser never holds GEMINI_API_KEY. /api/ai/voice-session issues a
 *     single-use ephemeral token with the model, system instruction and
 *     allowed tool list already locked inside it.
 *   * Every function call the Live session emits is relayed to
 *     /api/ai/tool-call, which re-derives identity from the user's Firebase
 *     ID token and applies the same authorization as text chat. Nothing is
 *     executed in the browser and the browser never reads Firestore.
 *   * Data-changing actions still need a spoken confirmation, and the
 *     pending action is stored server-side, so the server — not this
 *     file — decides whether a "confirmed" call is legitimate.
 *
 * Audio shape:
 *   mic → 16 kHz PCM16 frames → sendRealtimeInput
 *   ← 24 kHz PCM16 chunks → gap-free scheduled playback with real barge-in
 */
export function useVoiceAssistant(): VoiceAssistantApi {
  const { user } = useAuth();
  const [state, setState] = useState<AIAgentState>("idle");
  const [transcript, setTranscript] = useState<VoiceTranscriptEntry[]>([]);
  const [amplitude, setAmplitude] = useState(0);
  const [activity, setActivity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canFallBackToChat, setCanFallBackToChat] = useState(false);
  const [muted, setMuted] = useState(false);

  const sessionRef = useRef<Session | null>(null);
  const micRef = useRef<MicCapture | null>(null);
  const playerRef = useRef<PcmStreamPlayer | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const connectingRef = useRef(false);
  const closedByUserRef = useRef(false);
  const amplitudeRafRef = useRef<number | null>(null);
  const micAmplitudeRef = useRef(0);
  const awaitingConfirmationRef = useRef<{ key: string; at: number } | null>(null);
  /** Buffers for the in-progress utterance on each side. */
  const pendingUserTextRef = useRef("");
  const pendingModelTextRef = useRef("");

  const pushTranscript = useCallback((role: "user" | "assistant", text: string, final: boolean) => {
    if (!text.trim()) return;
    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      // Collapse streaming updates into the same bubble until it's final.
      if (last && last.role === role && !last.final) {
        return [...prev.slice(0, -1), { ...last, text, final }];
      }
      return [...prev, { id: `t_${role}_${Date.now()}_${prev.length}`, role, text, final }];
    });
  }, []);

  const teardown = useCallback(() => {
    if (amplitudeRafRef.current !== null) {
      cancelAnimationFrame(amplitudeRafRef.current);
      amplitudeRafRef.current = null;
    }
    micRef.current?.stop();
    micRef.current = null;
    playerRef.current?.teardown();
    playerRef.current = null;
    try {
      sessionRef.current?.close();
    } catch {
      // Already closed.
    }
    sessionRef.current = null;
    awaitingConfirmationRef.current = null;
    pendingUserTextRef.current = "";
    pendingModelTextRef.current = "";
    micAmplitudeRef.current = 0;
    setAmplitude(0);
    setActivity(null);
  }, []);

  const disconnect = useCallback(() => {
    closedByUserRef.current = true;
    teardown();
    setState("disconnected");
  }, [teardown]);

  /** Relays one Live function call through the server's authorization path. */
  const relayToolCall = useCallback(
    async (name: string, args: Record<string, unknown>, confirmed: boolean): Promise<ToolRelayResult> => {
      const idToken = await getIdToken();
      if (!idToken) return { ok: false, kind: "error", error: "You need to be signed in to do that." };
      try {
        const res = await fetch("/api/ai/tool-call", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ conversationId: conversationIdRef.current, toolName: name, args, confirmed }),
        });
        return (await res.json()) as ToolRelayResult;
      } catch {
        return { ok: false, kind: "error", error: "I couldn't reach the school's records just now." };
      }
    },
    []
  );

  /**
   * Two-phase confirmation over voice.
   *
   * Phase 1: the model asks for a write tool. The server answers
   * "needs_confirmation" with a preview and remembers the pending action.
   * That preview goes back to the model, which asks the user out loud.
   *
   * Phase 2: the user says yes, so the model calls the same tool again.
   * Seeing that we already offered exactly this action, we retry with
   * confirmed:true — and the SERVER still only accepts it if it matches the
   * pending action it stored. A stale offer expires after two minutes.
   */
  const executeToolCall = useCallback(
    async (name: string, args: Record<string, unknown>): Promise<ToolRelayResult> => {
      const key = `${name}:${stableKey(args)}`;
      const offered = awaitingConfirmationRef.current;
      const offerIsLive = offered?.key === key && Date.now() - offered.at < CONFIRMATION_WINDOW_MS;

      let result = await relayToolCall(name, args, false);
      if (result.kind === "needs_confirmation" && offerIsLive) {
        awaitingConfirmationRef.current = null;
        result = await relayToolCall(name, args, true);
      } else if (result.kind === "needs_confirmation") {
        awaitingConfirmationRef.current = { key, at: Date.now() };
      } else {
        awaitingConfirmationRef.current = null;
      }
      return result;
    },
    [relayToolCall]
  );

  const handleMessage = useCallback(
    async (message: LiveServerMessage) => {
      const content = message.serverContent;

      // --- barge-in: stop talking the instant the user does -----------------
      if (content?.interrupted) {
        playerRef.current?.interrupt();
        pendingModelTextRef.current = "";
        setState("listening");
        setActivity(null);
        return;
      }

      // --- tool calls -------------------------------------------------------
      if (message.toolCall?.functionCalls?.length) {
        setState("verifying");
        setActivity("Verifying access…");
        const functionResponses = [];

        for (const call of message.toolCall.functionCalls) {
          const name = String(call.name);
          const args = (call.args ?? {}) as Record<string, unknown>;
          setState("tool_execution");
          setActivity(voiceActivityLabel(name));
          const result = await executeToolCall(name, args);
          functionResponses.push({
            id: call.id,
            name: call.name,
            response: result as unknown as Record<string, unknown>,
          });
        }

        setState("thinking");
        setActivity("Preparing your answer…");
        sessionRef.current?.sendToolResponse({ functionResponses });
        return;
      }

      // --- transcripts ------------------------------------------------------
      if (content?.inputTranscription?.text) {
        pendingUserTextRef.current += content.inputTranscription.text;
        pushTranscript("user", pendingUserTextRef.current, false);
      }
      if (content?.outputTranscription?.text) {
        pendingModelTextRef.current += content.outputTranscription.text;
        pushTranscript("assistant", pendingModelTextRef.current, false);
      }

      // --- audio ------------------------------------------------------------
      for (const part of content?.modelTurn?.parts ?? []) {
        const data = part.inlineData?.data;
        if (data && part.inlineData?.mimeType?.startsWith("audio/")) {
          setState("speaking");
          setActivity(null);
          await playerRef.current?.enqueue(data);
        }
      }

      if (content?.turnComplete) {
        if (pendingUserTextRef.current.trim()) {
          pushTranscript("user", pendingUserTextRef.current, true);
          pendingUserTextRef.current = "";
        }
        if (pendingModelTextRef.current.trim()) {
          pushTranscript("assistant", pendingModelTextRef.current, true);
          pendingModelTextRef.current = "";
        }
        // Stay in "speaking" until queued audio actually drains — the avatar
        // must not go back to listening while EDVIA is still talking.
        if (!playerRef.current?.playing) setState("listening");
      }

      if (message.goAway) {
        setError("The voice session is about to end. Tap the mic to reconnect, or continue with chat.");
        setCanFallBackToChat(true);
      }
    },
    [pushTranscript, executeToolCall]
  );

  const connect = useCallback(async () => {
    if (!user || connectingRef.current || sessionRef.current) return;
    connectingRef.current = true;
    closedByUserRef.current = false;
    setError(null);
    setCanFallBackToChat(false);
    setState("connected");
    setActivity("Connecting…");

    let mic: MicCapture | null = null;
    try {
      const voiceSession = await requestVoiceSession();
      if (!voiceSession) {
        setError("Voice isn't available right now. You can continue with chat.");
        setCanFallBackToChat(true);
        setState("error");
        return;
      }

      conversationIdRef.current = `voice_${user.uid}_${Date.now()}`;

      // Microphone first: if permission is refused there's no point opening a
      // billed session, and the user gets one clear message instead of two.
      mic = new MicCapture();
      const player = new PcmStreamPlayer();
      player.onDrained(() => setState((s) => (s === "speaking" ? "listening" : s)));
      micRef.current = mic;
      playerRef.current = player;

      // The ephemeral token is used in place of an API key; v1alpha is the
      // surface where the Gemini Developer API accepts one.
      const ai = new GoogleGenAI({ apiKey: voiceSession.token, httpOptions: { apiVersion: "v1alpha" } });

      const session = await ai.live.connect({
        model: voiceSession.model,
        // Model, system instruction and tool list are already fixed inside
        // the ephemeral token; this only declares the response modality.
        config: { responseModalities: [Modality.AUDIO] },
        callbacks: {
          onopen: () => {
            setState("listening");
            setActivity(null);
          },
          onmessage: (message) => {
            void handleMessage(message);
          },
          onerror: () => {
            setError("The voice connection dropped. You can reconnect, or continue with chat.");
            setCanFallBackToChat(true);
            setState("error");
          },
          onclose: () => {
            if (!closedByUserRef.current) {
              setError("The voice session ended. Tap the mic to start again, or continue with chat.");
              setCanFallBackToChat(true);
            }
            setState("disconnected");
          },
        },
      });
      sessionRef.current = session;

      await mic.start({
        onFrame: (base64Pcm) => {
          sessionRef.current?.sendRealtimeInput({ audio: { data: base64Pcm, mimeType: CAPTURE_MIME_TYPE } });
        },
        onAmplitude: (value) => {
          micAmplitudeRef.current = value;
        },
      });

      // One rAF loop drives the waveform from whichever side is audible, so
      // the visualisation always reflects real audio energy.
      const tick = () => {
        const player = playerRef.current;
        setAmplitude(player?.playing ? player.getAmplitude() : micAmplitudeRef.current);
        amplitudeRafRef.current = requestAnimationFrame(tick);
      };
      amplitudeRafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      teardown();
      setError(err instanceof Error ? err.message : "Voice isn't available right now. You can continue with chat.");
      setCanFallBackToChat(true);
      setState("error");
    } finally {
      connectingRef.current = false;
    }
  }, [user, handleMessage, teardown]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      micRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const sendText = useCallback(
    (text: string) => {
      if (!text.trim() || !sessionRef.current) return;
      pushTranscript("user", text, true);
      sessionRef.current.sendClientContent({ turns: [{ role: "user", parts: [{ text }] }], turnComplete: true });
      setState("thinking");
    },
    [pushTranscript]
  );

  useEffect(() => () => teardown(), [teardown]);

  return {
    state,
    transcript,
    amplitude,
    activity,
    error,
    canFallBackToChat,
    muted,
    connect,
    disconnect,
    toggleMute,
    sendText,
  };
}

/** Key-order-independent argument key, matching the server's comparison. */
function stableKey(args: Record<string, unknown>): string {
  return JSON.stringify(
    Object.keys(args)
      .sort()
      .map((k) => [k, args[k]])
  );
}

function voiceActivityLabel(toolName: string): string {
  if (toolName.toLowerCase().includes("attendance")) return "Checking attendance…";
  if (toolName.startsWith("create")) return "Submitting your request…";
  if (toolName === "getSchoolPolicy") return "Looking up the handbook…";
  if (toolName === "getAssignments") return "Checking assignments…";
  if (toolName === "getExams") return "Checking the exam schedule…";
  return "Checking school records…";
}
