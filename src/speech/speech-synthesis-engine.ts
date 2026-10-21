export interface SpeechPort {
  speak(utterance: SpeechSynthesisUtterance): void;
  cancel(): void;
  getVoices(): SpeechSynthesisVoice[];
  readonly paused?: boolean;
  readonly speaking?: boolean;
  readonly pending?: boolean;
  addEventListener?(type: 'voiceschanged', listener: () => void): void;
  resume?(): void;
}

export type SpeechEndReason = 'finished' | 'stopped' | 'error';
export type SpeechVoiceStatus = 'unsupported' | 'loading' | 'japanese-voice-ready' | 'system-default';

export interface SpeechCallbacks {
  onStart?: () => void;
  onBoundary?: () => void;
  onEnd?: (reason: SpeechEndReason) => void;
  onError?: (message: string) => void;
}

export interface SpeechVoiceSettings {
  voiceURI?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}

function getBrowserPort(): SpeechPort | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return null;
  return window.speechSynthesis;
}

function makeUtterance(text: string): SpeechSynthesisUtterance {
  return new SpeechSynthesisUtterance(text);
}

/** Wraps the browser/OS voice service. It never records audio or starts the microphone. */
export class SpeechSynthesisEngine {
  private readonly port: SpeechPort | null;
  private readonly utteranceFactory: (text: string) => SpeechSynthesisUtterance;
  private generation = 0;
  private speaking = false;
  private pending = false;
  private startedCurrent = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private voiceList: SpeechSynthesisVoice[] = [];
  private selectedVoice: SpeechSynthesisVoice | null = null;
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  private settleCurrent: ((spoken: boolean) => void) | null = null;
  private callbacks: SpeechCallbacks = {};
  private voicesChangedCallback: (() => void) | null = null;
  private readonly startTimeoutMs: number;

  constructor(
    port: SpeechPort | null = getBrowserPort(),
    utteranceFactory = makeUtterance,
    startTimeoutMs = 10_000,
  ) {
    this.port = port;
    this.utteranceFactory = utteranceFactory;
    this.startTimeoutMs = startTimeoutMs;
    this.refreshVoices();
    this.port?.addEventListener?.('voiceschanged', () => {
      this.refreshVoices();
      this.voicesChangedCallback?.();
    });
  }

  get isSupported(): boolean { return this.port !== null; }
  /** True only after the browser fires SpeechSynthesisUtterance.onstart. */
  get isSpeaking(): boolean { return this.speaking; }
  get isPending(): boolean { return this.pending; }
  get isPaused(): boolean { return this.port?.paused ?? false; }
  get browserSpeaking(): boolean { return this.port?.speaking ?? false; }
  get browserPending(): boolean { return this.port?.pending ?? false; }
  get hasUtteranceReference(): boolean { return this.currentUtterance !== null; }
  get voiceStatus(): SpeechVoiceStatus {
    if (!this.port) return 'unsupported';
    if (this.voiceList.length === 0) return 'loading';
    return this.voiceList.some((voice) => voice.lang.toLowerCase().startsWith('ja'))
      ? 'japanese-voice-ready'
      : 'system-default';
  }
  get voices(): readonly SpeechSynthesisVoice[] { return this.voiceList; }
  get currentVoice(): SpeechSynthesisVoice | null { return this.selectedVoice; }
  /** Phase 3B uses this to keep recognition stopped until TTS has ended. */
  get shouldSuppressRecognition(): boolean { return this.pending || this.speaking; }

  onVoicesChanged(callback: (() => void) | null): void {
    this.voicesChangedCallback = callback;
  }

  private refreshVoices(): void {
    try {
      this.voiceList = this.port?.getVoices() ?? [];
    } catch {
      this.voiceList = [];
    }
  }

  speak(text: string, callbacks: SpeechCallbacks = {}, settings: SpeechVoiceSettings = {}): Promise<boolean> {
    if (!this.port || !text.trim()) return Promise.resolve(false);
    if (this.speaking || this.pending) this.stop();

    const utterance = this.utteranceFactory(text);
    utterance.lang = 'ja-JP';
    utterance.rate = clamp(settings.rate ?? 0.88, 0.5, 2);
    utterance.pitch = clamp(settings.pitch ?? 1.08, 0, 2);
    utterance.volume = clamp(settings.volume ?? 1, 0, 1);
    this.refreshVoices();
    const requestedVoice = settings.voiceURI
      ? this.voiceList.find((voice) => voice.voiceURI === settings.voiceURI)
      : undefined;
    const japaneseVoice = requestedVoice ?? this.voiceList.find((voice) => voice.lang.toLowerCase() === 'ja-jp')
      ?? this.voiceList.find((voice) => voice.lang.toLowerCase().startsWith('ja'));
    this.selectedVoice = japaneseVoice ?? null;
    if (japaneseVoice) utterance.voice = japaneseVoice;

    const generation = ++this.generation;
    this.callbacks = callbacks;
    this.speaking = false;
    this.pending = true;
    this.startedCurrent = false;
    this.currentUtterance = utterance;
    return new Promise((resolve) => {
      this.settleCurrent = resolve;
      let terminalEventHandled = false;
      const finish = (spoken: boolean, reason: SpeechEndReason): void => {
        if (generation !== this.generation || terminalEventHandled) return;
        terminalEventHandled = true;
        this.speaking = false;
        this.pending = false;
        this.startedCurrent = false;
        this.currentUtterance = null;
        if (this.startTimer !== null) clearTimeout(this.startTimer);
        this.startTimer = null;
        this.settleCurrent = null;
        const currentCallbacks = this.callbacks;
        this.callbacks = {};
        currentCallbacks.onEnd?.(reason);
        resolve(spoken);
      };

      utterance.onstart = () => {
        if (generation !== this.generation || !this.pending) return;
        this.pending = false;
        this.speaking = true;
        this.startedCurrent = true;
        if (this.startTimer !== null) clearTimeout(this.startTimer);
        this.startTimer = null;
        this.callbacks.onStart?.();
      };
      utterance.onboundary = () => {
        if (generation === this.generation) this.callbacks.onBoundary?.();
      };
      utterance.onend = () => {
        if (generation !== this.generation || terminalEventHandled) return;
        if (!this.startedCurrent) {
          this.callbacks.onError?.('音声開始イベント前に再生が終了しました');
          finish(false, 'error');
          return;
        }
        finish(true, 'finished');
      };
      utterance.onerror = (event) => {
        if (generation !== this.generation || terminalEventHandled) return;
        if (generation === this.generation) this.callbacks.onError?.(event.error || '音声を再生できませんでした');
        finish(false, 'error');
      };

      try {
        this.startTimer = setTimeout(() => {
          if (generation !== this.generation || !this.pending) return;
          this.callbacks.onError?.('一定時間内に音声開始イベントがありませんでした');
          finish(false, 'error');
          try { this.port?.cancel(); } catch { /* Local state is already released. */ }
        }, this.startTimeoutMs);
        this.port!.speak(utterance);
      } catch (error) {
        const message = error instanceof Error ? error.message : '音声を再生できませんでした';
        this.callbacks.onError?.(message);
        finish(false, 'error');
      }
    });
  }

  stop(): void {
    if (!this.speaking && !this.pending) return;
    this.generation += 1;
    this.speaking = false;
    this.pending = false;
    this.startedCurrent = false;
    this.currentUtterance = null;
    if (this.startTimer !== null) clearTimeout(this.startTimer);
    this.startTimer = null;
    try {
      this.port?.cancel();
    } catch {
      // Clear local speaking state even if the browser voice service cannot cancel cleanly.
    }
    const settle = this.settleCurrent;
    this.settleCurrent = null;
    const callbacks = this.callbacks;
    this.callbacks = {};
    callbacks.onEnd?.('stopped');
    settle?.(false);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
}
