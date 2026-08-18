// ==========================================================================
// Microphone capture → 16 kHz mono PCM16, the format Gemini Live expects
// --------------------------------------------------------------------------
// getUserMedia gives us Float32 samples at the device's own rate (usually
// 44.1 or 48 kHz). The Live API wants signed 16-bit little-endian PCM at
// 16 kHz. Both conversions happen here:
//
//   * rate      — by opening the AudioContext at 16 kHz, so the browser's
//                 own resampler does the work on the audio thread
//   * bit depth — Float32 [-1, 1] → Int16, clamped
//
// Capture runs in an AudioWorklet (a real audio-thread processor) rather
// than a ScriptProcessorNode, so a slow React render can't cause dropouts.
// The worklet is compiled from an inline blob so there's no separate asset
// to keep in sync with the bundle. ScriptProcessorNode remains as a
// fallback for browsers without AudioWorklet.
// ==========================================================================

/** Gemini Live input contract. Do not change without checking the API docs. */
export const CAPTURE_SAMPLE_RATE = 16000;
export const CAPTURE_MIME_TYPE = `audio/pcm;rate=${CAPTURE_SAMPLE_RATE}`;

const FRAME_SAMPLES = 2048; // ~128 ms at 16 kHz — smooth without chattering

const WORKLET_SOURCE = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.target = (options && options.processorOptions && options.processorOptions.frameSamples) || 2048;
    this.pending = new Float32Array(this.target);
    this.filled = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    let offset = 0;
    while (offset < channel.length) {
      const room = this.target - this.filled;
      const take = Math.min(room, channel.length - offset);
      this.pending.set(channel.subarray(offset, offset + take), this.filled);
      this.filled += take;
      offset += take;
      if (this.filled === this.target) {
        this.port.postMessage(this.pending.slice(0));
        this.filled = 0;
      }
    }
    return true;
  }
}
registerProcessor('edvia-pcm-capture', PcmCaptureProcessor);
`;

export interface MicCaptureHandlers {
  /** Called with each base64-encoded PCM16 frame, ready to send to Gemini. */
  onFrame: (base64Pcm: string) => void;
  /** 0–1 loudness for the waveform, sampled from the same frames. */
  onAmplitude?: (amplitude: number) => void;
}

export class MicCapture {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private legacyNode: ScriptProcessorNode | null = null;
  private muted = false;

  get active(): boolean {
    return this.context !== null;
  }

  /**
   * Requests microphone permission and begins streaming frames.
   * Throws a user-presentable Error on denial or unsupported hardware —
   * the caller is expected to fall back to text chat, not to retry.
   */
  async start(handlers: MicCaptureHandlers): Promise<void> {
    if (this.context) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser can't access the microphone. You can continue with chat.");
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      throw new Error(micErrorMessage(err));
    }
    this.stream = stream;

    const AudioCtor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const context = new AudioCtor({ sampleRate: CAPTURE_SAMPLE_RATE });
    this.context = context;
    // Autoplay policy: a context created outside a user gesture starts
    // suspended and would silently capture nothing.
    if (context.state === "suspended") await context.resume();

    this.source = context.createMediaStreamSource(stream);

    const emit = (samples: Float32Array) => {
      if (this.muted) return;
      handlers.onAmplitude?.(rms(samples));
      handlers.onFrame(encodePcm16Base64(samples));
    };

    if (context.audioWorklet) {
      const blobUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
      try {
        await context.audioWorklet.addModule(blobUrl);
        const node = new AudioWorkletNode(context, "edvia-pcm-capture", {
          numberOfInputs: 1,
          numberOfOutputs: 0,
          processorOptions: { frameSamples: FRAME_SAMPLES },
        });
        node.port.onmessage = (event) => emit(event.data as Float32Array);
        this.source.connect(node);
        this.worklet = node;
        return;
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    }

    // Fallback path. Deprecated but still the only option on some browsers;
    // it needs a destination connection to be pulled, hence the silent gain.
    const node = context.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (event) => emit(new Float32Array(event.inputBuffer.getChannelData(0)));
    const silent = context.createGain();
    silent.gain.value = 0;
    this.source.connect(node);
    node.connect(silent);
    silent.connect(context.destination);
    this.legacyNode = node;
  }

  /** Stops sending audio without tearing the session down (push-to-mute). */
  setMuted(muted: boolean): void {
    this.muted = muted;
    this.stream?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }

  stop(): void {
    if (this.worklet) {
      this.worklet.port.onmessage = null;
      this.worklet.disconnect();
      this.worklet = null;
    }
    if (this.legacyNode) {
      this.legacyNode.onaudioprocess = null;
      this.legacyNode.disconnect();
      this.legacyNode = null;
    }
    this.source?.disconnect();
    this.source = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.context && this.context.state !== "closed") void this.context.close();
    this.context = null;
    this.muted = false;
  }
}

/** Float32 [-1,1] → little-endian Int16 → base64, as the Live API expects. */
export function encodePcm16Base64(samples: Float32Array): string {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return arrayBufferToBase64(buffer);
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  // Chunked so a long buffer can't blow the argument limit of String.fromCharCode.
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return Math.min(1, Math.sqrt(sum / samples.length) * 4);
}

function micErrorMessage(err: unknown): string {
  const name = (err as { name?: string })?.name;
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "EDVIA needs microphone access for voice mode. You can enable it in your browser's site settings, or continue with chat.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "I couldn't find a microphone on this device. You can continue with chat.";
    case "NotReadableError":
      return "Your microphone is being used by another app. Close it and try again, or continue with chat.";
    default:
      return "I couldn't start the microphone. You can continue with chat.";
  }
}
