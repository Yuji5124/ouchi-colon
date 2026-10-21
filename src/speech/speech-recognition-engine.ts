export interface RecognitionAlternativeLike { transcript: string; confidence?: number }
export interface RecognitionResultLike extends ArrayLike<RecognitionAlternativeLike> { isFinal: boolean }
export interface RecognitionResultEventLike { resultIndex: number; results: ArrayLike<RecognitionResultLike> }
export interface RecognitionErrorEventLike { error: string; message?: string }

export interface SpeechRecognitionPort {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onresult: ((event: RecognitionResultEventLike) => void) | null;
  onerror: ((event: RecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export interface RecognitionCallbacks {
  onStart?: () => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onInterim?: (text: string) => void;
  onError?: (code: string, message?: string) => void;
  onEnd?: (finalText: string) => void;
}

export type RecognitionStartResult = 'started' | 'unsupported' | 'already-active' | 'error';
type RecognitionConstructor = new () => SpeechRecognitionPort;

function getBrowserConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const speechWindow = window as Window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function getBrowserFactory(): (() => SpeechRecognitionPort) | null {
  const Constructor = getBrowserConstructor();
  return Constructor ? () => new Constructor() : null;
}

/**
 * Small adapter for the browser's opt-in Web Speech recognizer.
 * It opens one recognition turn at a time and never restarts itself.
 */
export class SpeechRecognitionEngine {
  private readonly createRecognizer: (() => SpeechRecognitionPort) | null;
  private recognizer: SpeechRecognitionPort | null = null;
  private callbacks: RecognitionCallbacks = {};
  private generation = 0;
  private active = false;
  private finalText = '';
  private speechStarted = false;
  private errored = false;

  constructor(createRecognizer: (() => SpeechRecognitionPort) | null = getBrowserFactory()) {
    this.createRecognizer = createRecognizer;
  }

  get isSupported(): boolean { return this.createRecognizer !== null; }
  get isActive(): boolean { return this.active; }

  start(callbacks: RecognitionCallbacks): RecognitionStartResult {
    if (!this.createRecognizer) return 'unsupported';
    if (this.active) return 'already-active';

    let recognizer: SpeechRecognitionPort;
    try {
      recognizer = this.createRecognizer();
    } catch (error) {
      callbacks.onError?.('constructor', error instanceof Error ? error.message : undefined);
      return 'error';
    }
    const generation = ++this.generation;
    this.recognizer = recognizer;
    this.callbacks = callbacks;
    this.active = true;
    this.finalText = '';
    this.speechStarted = false;
    this.errored = false;
    recognizer.lang = 'ja-JP';
    recognizer.continuous = false;
    recognizer.interimResults = true;
    recognizer.maxAlternatives = 1;

    const current = (): boolean => generation === this.generation && this.recognizer === recognizer;
    const markSpeechStart = (): void => {
      if (!current() || this.speechStarted) return;
      this.speechStarted = true;
      this.callbacks.onSpeechStart?.();
    };

    recognizer.onstart = () => {
      if (current()) this.callbacks.onStart?.();
    };
    recognizer.onaudiostart = () => {
      // Some implementations omit the speechstart event. Interim results below
      // are the fallback signal so silence does not look like a voice event.
    };
    recognizer.onspeechstart = markSpeechStart;
    recognizer.onspeechend = () => {
      if (!current() || !this.speechStarted) return;
      this.callbacks.onSpeechEnd?.();
    };
    recognizer.onresult = (event) => {
      if (!current()) return;
      const finals: string[] = [];
      const interims: string[] = [];
      for (let index = 0; index < event.results.length; index += 1) {
        const alternative = event.results[index]?.[0];
        if (!alternative?.transcript) continue;
        if (event.results[index]?.isFinal) finals.push(alternative.transcript.trim());
        else interims.push(alternative.transcript.trim());
      }
      const finalText = finals.join(' ').trim();
      const interimText = interims.join(' ').trim();
      if (interimText || finalText) markSpeechStart();
      if (finalText) this.finalText = finalText;
      this.callbacks.onInterim?.([this.finalText, interimText].filter(Boolean).join(' ').trim());
    };
    recognizer.onerror = (event) => {
      if (!current()) return;
      this.errored = true;
      this.callbacks.onError?.(event.error || 'unknown', event.message);
    };
    recognizer.onend = () => {
      if (!current()) return;
      this.active = false;
      const finalText = this.errored ? '' : this.finalText;
      const end = this.callbacks.onEnd;
      this.callbacks = {};
      this.recognizer = null;
      end?.(finalText);
    };

    try {
      // Called directly from the explicit parent-operated button gesture.
      recognizer.start();
      return 'started';
    } catch (error) {
      this.active = false;
      this.recognizer = null;
      this.callbacks = {};
      const message = error instanceof Error ? error.message : undefined;
      callbacks.onError?.('start-failed', message);
      return 'error';
    }
  }

  stop(): void {
    if (!this.active || !this.recognizer) return;
    try {
      this.recognizer.stop();
    } catch {
      this.abort();
    }
  }

  /** Discards pending recognition before TTS or when the parent turns the mic off. */
  abort(): void {
    const recognizer = this.recognizer;
    this.generation += 1;
    this.active = false;
    this.recognizer = null;
    this.callbacks = {};
    this.finalText = '';
    try {
      recognizer?.abort();
    } catch {
      // Local state remains stopped if the browser has already ended the session.
    }
  }
}
