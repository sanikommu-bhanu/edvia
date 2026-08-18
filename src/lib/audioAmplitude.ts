// ==========================================================================
// AudioAnalyser — real amplitude sampling for EDVIAWaveform
// --------------------------------------------------------------------------
// Wraps a MediaStream (mic input) or an <audio>/AudioBufferSourceNode
// (EDVIA's spoken output) in a Web Audio AnalyserNode so the waveform
// component reflects actual audio energy, never a random/fake animation.
// ==========================================================================

export class AudioAmplitudeAnalyser {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private source: MediaStreamAudioSourceNode | AudioBufferSourceNode | null = null;

  attachMicStream(stream: MediaStream) {
    this.teardown();
    this.audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 256;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.source = this.audioCtx.createMediaStreamSource(stream);
    this.source.connect(this.analyser);
  }

  /** Returns 0–1 normalized amplitude for the current audio frame. */
  getAmplitude(): number {
    if (!this.analyser || !this.dataArray) return 0;
    this.analyser.getByteTimeDomainData(this.dataArray);
    let sumSquares = 0;
    for (const v of this.dataArray) {
      const normalized = (v - 128) / 128;
      sumSquares += normalized * normalized;
    }
    return Math.min(1, Math.sqrt(sumSquares / this.dataArray.length) * 3);
  }

  teardown() {
    this.source?.disconnect();
    this.analyser?.disconnect();
    if (this.audioCtx && this.audioCtx.state !== "closed") void this.audioCtx.close();
    this.audioCtx = null;
    this.analyser = null;
    this.dataArray = null;
    this.source = null;
  }
}
