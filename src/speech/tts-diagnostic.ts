export type DiagnosticVoiceMode = 'safari-default' | 'explicit-japanese' | 'no-language';

export interface DiagnosticUtterance {
  lang: string;
  voice: SpeechSynthesisVoice | null;
  rate: number;
  pitch: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
}

export interface DiagnosticSpeechPort {
  speak(utterance: DiagnosticUtterance): void;
  cancel(): void;
  getVoices(): SpeechSynthesisVoice[];
  resume?(): void;
  readonly paused?: boolean;
  readonly pending?: boolean;
  readonly speaking?: boolean;
  addEventListener?(type: 'voiceschanged', listener: () => void): void;
}

export interface DiagnosticResult {
  outcome: 'ended' | 'error' | 'timeout' | 'canceled' | 'unsupported' | 'no-japanese-voice' | 'busy';
  onstart: boolean;
  onend: boolean;
  error: string | null;
  startDelayMs: number | null;
  timeoutMs: number;
  mode: DiagnosticVoiceMode;
  selectedVoice: string;
}

export type DiagnosticUtteranceFactory = (text: string) => DiagnosticUtterance;
export type NativeDiagnosticEvent = { type: 'onstart' | 'onend' | 'onerror' | 'timeout' | 'cancel'; elapsedMs: number; error?: string };

/** Direct Web Speech API probe. It intentionally knows nothing about app engines or UI. */
export class NativeTtsDiagnostic {
  private utterance: DiagnosticUtterance | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active = false;
  private activeFinish: ((outcome: DiagnosticResult['outcome'], onend: boolean) => void) | null = null;
  private selectedVoice = 'なし';
  private readonly port: DiagnosticSpeechPort | null;
  private readonly createUtterance: DiagnosticUtteranceFactory;
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(
    port: DiagnosticSpeechPort | null,
    createUtterance: DiagnosticUtteranceFactory,
    timeoutMs = 10_000,
    now: () => number = () => performance.now(),
  ) {
    this.port = port;
    this.createUtterance = createUtterance;
    this.timeoutMs = timeoutMs;
    this.now = now;
  }

  get hasUtteranceReference(): boolean { return this.utterance !== null; }
  get currentSelectedVoice(): string { return this.selectedVoice; }
  get isActive(): boolean { return this.active; }
  get voices(): readonly SpeechSynthesisVoice[] {
    try { return this.port?.getVoices() ?? []; } catch { return []; }
  }

  resumeFromUserGesture(): 'unsupported' | 'not-paused' | 'requested' | 'error' {
    if (!this.port?.resume) return 'unsupported';
    if (!this.port.paused) return 'not-paused';
    try {
      this.port.resume();
      return 'requested';
    } catch {
      return 'error';
    }
  }

  run(
    text: string,
    mode: DiagnosticVoiceMode,
    options: { cancelBefore?: boolean; onEvent?: (event: NativeDiagnosticEvent) => void } = {},
  ): Promise<DiagnosticResult> {
    const noVoice: DiagnosticResult = {
      outcome: !this.port ? 'unsupported' : 'busy', onstart: false, onend: false,
      error: null, startDelayMs: null, timeoutMs: this.timeoutMs, mode, selectedVoice: 'なし',
    };
    if (!this.port) return Promise.resolve(noVoice);
    if (this.active) return Promise.resolve(noVoice);
    const port = this.port;
    if (options.cancelBefore) {
      try { port.cancel(); } catch { /* Report playback outcome through the utterance events. */ }
    }

    let utterance: DiagnosticUtterance;
    try { utterance = this.createUtterance(text); }
    catch (cause) {
      return Promise.resolve({ ...noVoice, outcome: 'error', error: cause instanceof Error ? cause.message : 'utterance construction failed' });
    }
    const voices = this.voices;
    let selectedVoice = 'ブラウザー既定';
    if (mode === 'safari-default') {
      utterance.lang = 'ja-JP';
      utterance.voice = null;
    } else if (mode === 'explicit-japanese') {
      const voice = voices.find((item) => item.lang.toLowerCase() === 'ja-jp')
        ?? voices.find((item) => item.lang.toLowerCase().startsWith('ja'));
      if (!voice) return Promise.resolve({ ...noVoice, outcome: 'no-japanese-voice', mode });
      utterance.lang = voice.lang;
      utterance.voice = voice;
      selectedVoice = `${voice.name} (${voice.lang})`;
    } else {
      utterance.lang = '';
      utterance.voice = null;
    }
    this.selectedVoice = selectedVoice;
    utterance.rate = 0.9;
    utterance.pitch = 1;

    this.active = true;
    this.utterance = utterance;
    const requestedAt = this.now();
    return new Promise((resolve) => {
      let terminal = false;
      let didStart = false;
      let error: string | null = null;
      let startDelayMs: number | null = null;
      const finish = (outcome: DiagnosticResult['outcome'], onend: boolean): void => {
        if (terminal) return;
        terminal = true;
        this.active = false;
        this.utterance = null;
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = null;
        this.activeFinish = null;
        resolve({ outcome, onstart: didStart, onend, error, startDelayMs, timeoutMs: this.timeoutMs, mode, selectedVoice });
      };
      this.activeFinish = finish;

      utterance.onstart = () => {
        if (terminal) return;
        didStart = true;
        startDelayMs = this.now() - requestedAt;
        options.onEvent?.({ type: 'onstart', elapsedMs: startDelayMs });
      };
      utterance.onend = () => {
        if (terminal) return;
        options.onEvent?.({ type: 'onend', elapsedMs: this.now() - requestedAt });
        finish(didStart ? 'ended' : 'error', true);
      };
      utterance.onerror = (event) => {
        if (terminal) return;
        error = event.error || 'unspecified';
        options.onEvent?.({ type: 'onerror', elapsedMs: this.now() - requestedAt, error });
        finish('error', false);
      };
      this.timer = setTimeout(() => {
        if (terminal) return;
        error = `no terminal event within ${this.timeoutMs}ms`;
        options.onEvent?.({ type: 'timeout', elapsedMs: this.now() - requestedAt, error });
        finish('timeout', false);
        try { port.cancel(); } catch { /* Local timeout already released the retained utterance. */ }
      }, this.timeoutMs);
      try {
        port.speak(utterance);
      } catch (cause) {
        error = cause instanceof Error ? cause.message : 'speak threw';
        finish('error', false);
      }
    });
  }

  stopFromUserGesture(): void {
    if (!this.port || !this.active) return;
    const finish = this.activeFinish;
    finish?.('canceled', false);
    try { this.port.cancel(); } catch { /* Keep diagnostic UI usable if native cancel throws. */ }
  }
}
