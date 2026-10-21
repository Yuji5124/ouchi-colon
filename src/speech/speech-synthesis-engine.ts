export interface SpeechPort {
  speak(utterance: SpeechSynthesisUtterance): void;
  cancel(): void;
  getVoices(): SpeechSynthesisVoice[];
}

export type SpeechEndReason = 'finished' | 'stopped' | 'error';

export interface SpeechCallbacks {
  onStart?: () => void;
  onBoundary?: () => void;
  onEnd?: (reason: SpeechEndReason) => void;
  onError?: (message: string) => void;
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
  private settleCurrent: ((spoken: boolean) => void) | null = null;
  private callbacks: SpeechCallbacks = {};

  constructor(port: SpeechPort | null = getBrowserPort(), utteranceFactory = makeUtterance) {
    this.port = port;
    this.utteranceFactory = utteranceFactory;
  }

  get isSupported(): boolean { return this.port !== null; }
  get isSpeaking(): boolean { return this.speaking; }
  /** Phase 3B can use this to avoid recognizing the character's own TTS audio. */
  get shouldSuppressRecognition(): boolean { return this.speaking; }

  speak(text: string, callbacks: SpeechCallbacks = {}): Promise<boolean> {
    if (!this.port || !text.trim()) return Promise.resolve(false);
    if (this.speaking) this.stop();

    const utterance = this.utteranceFactory(text);
    utterance.lang = 'ja-JP';
    utterance.rate = 0.88;
    utterance.pitch = 1.08;
    const japaneseVoice = this.port.getVoices().find((voice) => voice.lang.toLowerCase().startsWith('ja'));
    if (japaneseVoice) utterance.voice = japaneseVoice;

    const generation = ++this.generation;
    this.callbacks = callbacks;
    this.speaking = true;
    return new Promise((resolve) => {
      this.settleCurrent = resolve;
      const finish = (spoken: boolean, reason: SpeechEndReason): void => {
        if (generation !== this.generation) return;
        this.speaking = false;
        this.settleCurrent = null;
        const currentCallbacks = this.callbacks;
        this.callbacks = {};
        currentCallbacks.onEnd?.(reason);
        resolve(spoken);
      };

      utterance.onstart = () => {
        if (generation === this.generation) this.callbacks.onStart?.();
      };
      utterance.onboundary = () => {
        if (generation === this.generation) this.callbacks.onBoundary?.();
      };
      utterance.onend = () => finish(true, 'finished');
      utterance.onerror = (event) => {
        if (generation === this.generation) this.callbacks.onError?.(event.error || '音声を再生できませんでした');
        finish(false, 'error');
      };

      try {
        this.port!.speak(utterance);
      } catch (error) {
        const message = error instanceof Error ? error.message : '音声を再生できませんでした';
        this.callbacks.onError?.(message);
        finish(false, 'error');
      }
    });
  }

  stop(): void {
    if (!this.speaking) return;
    this.generation += 1;
    this.speaking = false;
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
