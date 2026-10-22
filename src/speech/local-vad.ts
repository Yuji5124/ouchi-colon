export type VadEndpointEvent =
  | { type: 'speech-start'; at: number }
  | { type: 'speech-end-candidate'; at: number }
  | { type: 'error'; reason: string };

export interface VadDetectorOptions {
  threshold?: number;
  speechConfirmMs?: number;
  silenceConfirmMs?: number;
}

/**
 * A conservative RMS silence candidate detector. It is only a local timing
 * aid; it never controls or stops speech recognition.
 */
export class SilenceEndpointDetector {
  private readonly threshold: number;
  private readonly speechConfirmMs: number;
  private readonly silenceConfirmMs: number;
  private aboveSince: number | null = null;
  private belowSince: number | null = null;
  private active = false;

  constructor(options: VadDetectorOptions = {}) {
    this.threshold = options.threshold ?? 0.018;
    this.speechConfirmMs = options.speechConfirmMs ?? 140;
    this.silenceConfirmMs = options.silenceConfirmMs ?? 900;
  }

  process(rms: number, at: number): VadEndpointEvent | null {
    if (!Number.isFinite(rms) || !Number.isFinite(at)) return null;
    if (!this.active) {
      if (rms < this.threshold) { this.aboveSince = null; return null; }
      this.aboveSince ??= at;
      if (at - this.aboveSince < this.speechConfirmMs) return null;
      this.active = true;
      this.belowSince = null;
      return { type: 'speech-start', at };
    }

    if (rms >= this.threshold) { this.belowSince = null; return null; }
    this.belowSince ??= at;
    if (at - this.belowSince < this.silenceConfirmMs) return null;
    this.active = false;
    this.aboveSince = null;
    this.belowSince = null;
    return { type: 'speech-end-candidate', at };
  }

  reset(): void {
    this.aboveSince = null;
    this.belowSince = null;
    this.active = false;
  }
}

type AudioContextLike = AudioContext & { createMediaStreamSource(stream: MediaStream): MediaStreamAudioSourceNode };

/** Explicitly started, local-only RMS monitor for guardian A/B diagnostics. */
export class LocalVadMonitor {
  private stream: MediaStream | null = null;
  private context: AudioContextLike | null = null;
  private timer: number | null = null;
  private generation = 0;
  private starting = false;
  private callback: ((event: VadEndpointEvent) => void) | null = null;
  private analyser: AnalyserNode | null = null;
  private buffer: Float32Array<ArrayBuffer> | null = null;
  private readonly detector = new SilenceEndpointDetector();

  get isActive(): boolean { return this.timer !== null || this.starting; }

  async start(callback: (event: VadEndpointEvent) => void): Promise<void> {
    if (this.isActive) return;
    const mediaDevices = navigator.mediaDevices;
    const Context = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!mediaDevices?.getUserMedia || !Context) throw new Error('このSafariではローカルVAD用の音声入力を利用できません');

    const generation = ++this.generation;
    this.starting = true;
    this.callback = callback;
    this.detector.reset();
    let stream: MediaStream | null = null;
    let context: AudioContextLike | null = null;
    try {
      // Called only from the guardian's explicit debug button. No audio is
      // connected to an output, encoded, retained, or sent anywhere.
      stream = await mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (generation !== this.generation) { stream.getTracks().forEach((track) => track.stop()); return; }
      context = new Context() as AudioContextLike;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);
      if (context.state === 'suspended') await context.resume();
      if (generation !== this.generation) {
        source.disconnect();
        await context.close();
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      this.context = context;
      this.analyser = analyser;
      this.buffer = new Float32Array(analyser.fftSize);
      this.timer = window.setInterval(() => this.sample(), 40);
      this.starting = false;
    } catch (error) {
      this.starting = false;
      if (generation === this.generation) this.callback?.({ type: 'error', reason: error instanceof Error ? error.message : 'VAD初期化に失敗しました' });
      stream?.getTracks().forEach((track) => track.stop());
      if (context && context.state !== 'closed') await context.close().catch(() => undefined);
      this.callback = null;
      throw error;
    }
  }

  stop(): void {
    this.generation += 1;
    this.starting = false;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.analyser = null;
    this.buffer = null;
    this.callback = null;
    this.detector.reset();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') void context.close().catch(() => undefined);
  }

  private sample(): void {
    const analyser = this.analyser;
    const buffer = this.buffer;
    if (!analyser || !buffer || document.hidden) return;
    analyser.getFloatTimeDomainData(buffer);
    let sum = 0;
    for (let index = 0; index < buffer.length; index += 1) sum += buffer[index]! * buffer[index]!;
    const event = this.detector.process(Math.sqrt(sum / buffer.length), performance.now());
    if (event) this.callback?.(event);
  }
}
