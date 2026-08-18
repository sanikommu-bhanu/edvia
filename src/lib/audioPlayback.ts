// ==========================================================================
// Streamed PCM playback for EDVIA's spoken replies
// --------------------------------------------------------------------------
// Gemini Live returns 24 kHz mono PCM16 in many small chunks. Playing each
// chunk with its own `start()` at "now" produces audible seams and drift,
// so this scheduler keeps a running playback cursor and queues each buffer
// to begin exactly where the previous one ends.
//
// Interruption is a first-class operation, not a nice-to-have: when the
// user starts talking over EDVIA, Gemini sends `interrupted` and every
// buffer already scheduled must be dropped immediately — otherwise the
// assistant keeps talking for several seconds after being cut off, which is
// the single most robot-like failure a voice assistant can have.
// ==========================================================================
import { base64ToArrayBuffer } from "./audioCapture";

/** Gemini Live output contract. */
export const PLAYBACK_SAMPLE_RATE = 24000;

export class PcmStreamPlayer {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private amplitudeData: Uint8Array<ArrayBuffer> | null = null;
  private scheduled = new Set<AudioBufferSourceNode>();
  /** Absolute context time where the next chunk should begin. */
  private cursor = 0;
  private onEndedCallback: (() => void) | null = null;

  get playing(): boolean {
    return this.scheduled.size > 0;
  }

  private ensureContext(): AudioContext {
    if (this.context) return this.context;
    const AudioCtor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const context = new AudioCtor({ sampleRate: PLAYBACK_SAMPLE_RATE });
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.connect(context.destination);
    this.analyser = analyser;
    this.amplitudeData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    this.context = context;
    return context;
  }

  /** Called once the queue drains — used to return the avatar to "listening". */
  onDrained(callback: () => void): void {
    this.onEndedCallback = callback;
  }

  /** Queues one base64 PCM16 chunk from a Live `inlineData` part. */
  async enqueue(base64Pcm: string): Promise<void> {
    const context = this.ensureContext();
    if (context.state === "suspended") await context.resume();

    const pcm = new Int16Array(base64ToArrayBuffer(base64Pcm));
    if (pcm.length === 0) return;

    const buffer = context.createBuffer(1, pcm.length, PLAYBACK_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i += 1) channel[i] = pcm[i] / 0x8000;

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.analyser!);

    // A small lead time absorbs network jitter without adding audible lag.
    const startAt = Math.max(context.currentTime + 0.05, this.cursor);
    source.start(startAt);
    this.cursor = startAt + buffer.duration;

    this.scheduled.add(source);
    source.onended = () => {
      this.scheduled.delete(source);
      if (this.scheduled.size === 0) this.onEndedCallback?.();
    };
  }

  /**
   * Barge-in. Stops everything already queued and resets the cursor so the
   * next reply starts immediately rather than after the discarded audio.
   */
  interrupt(): void {
    for (const source of this.scheduled) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // Already finished — nothing to stop.
      }
      source.disconnect();
    }
    this.scheduled.clear();
    this.cursor = this.context?.currentTime ?? 0;
  }

  /** 0–1 output loudness, so the waveform reacts to EDVIA's own voice too. */
  getAmplitude(): number {
    if (!this.analyser || !this.amplitudeData) return 0;
    this.analyser.getByteTimeDomainData(this.amplitudeData);
    let sumSquares = 0;
    for (let i = 0; i < this.amplitudeData.length; i += 1) {
      const normalized = (this.amplitudeData[i] - 128) / 128;
      sumSquares += normalized * normalized;
    }
    return Math.min(1, Math.sqrt(sumSquares / this.amplitudeData.length) * 3);
  }

  teardown(): void {
    this.interrupt();
    this.analyser?.disconnect();
    this.analyser = null;
    this.amplitudeData = null;
    if (this.context && this.context.state !== "closed") void this.context.close();
    this.context = null;
    this.cursor = 0;
    this.onEndedCallback = null;
  }
}
