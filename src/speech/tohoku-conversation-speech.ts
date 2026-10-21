import type { SpeechEndReason } from './speech-synthesis-engine';
import type { TohokuVoiceLab } from './tohoku-voice-lab';

export type TohokuReplyResult = {
  reason: SpeechEndReason;
  error?: string;
  generationMs?: number;
};

export interface TohokuAudioOutput {
  unlock(): Promise<void>;
  play(wav: ArrayBuffer, onStart: () => void): Promise<'finished' | 'stopped'>;
  stop(): void;
  close(): void;
}

/** Keeps Open JTalk generation and Web Audio playback separate from normal iOS TTS. */
export class TohokuConversationSpeech {
  private generation = 0;
  private queue: Promise<void> = Promise.resolve();
  private requests = 0;
  private playbackActive = false;
  private readonly lab: Pick<TohokuVoiceLab, 'generate' | 'state'>;
  private readonly audio: TohokuAudioOutput;

  constructor(lab: Pick<TohokuVoiceLab, 'generate' | 'state'>, audio: TohokuAudioOutput) {
    this.lab = lab;
    this.audio = audio;
  }

  get isBusy(): boolean { return this.requests > 0 || this.lab.state === 'generating' || this.playbackActive; }

  unlock(): Promise<void> {
    return this.audio.unlock();
  }

  speak(text: string, onStart: () => void): Promise<TohokuReplyResult> {
    const generation = ++this.generation;
    this.requests += 1;
    const operation = this.queue.then(async (): Promise<TohokuReplyResult> => {
      if (generation !== this.generation) return { reason: 'stopped' };
      try {
        const generated = await this.lab.generate(text, 'conversation');
        if (generation !== this.generation) return { reason: 'stopped' };
        if (!generated.wav) throw new Error('Open JTalkからWAVが返りませんでした。');
        this.playbackActive = true;
        let reason: 'finished' | 'stopped';
        try {
          reason = await this.audio.play(generated.wav, () => {
            if (generation === this.generation) onStart();
          });
        } finally {
          this.playbackActive = false;
        }
        return generation === this.generation
          ? { reason, generationMs: generated.generationMs }
          : { reason: 'stopped', generationMs: generated.generationMs };
      } catch (error) {
        if (generation !== this.generation) return { reason: 'stopped' };
        return {
          reason: 'error',
          error: error instanceof Error ? error.message : 'TOHOKU音声の生成または再生に失敗しました。',
        };
      }
    });
    this.queue = operation.then(() => {
      this.requests -= 1;
    }, () => {
      this.requests -= 1;
    });
    return operation;
  }

  stop(): void {
    this.generation += 1;
    this.audio.stop();
  }

  close(): void {
    this.generation += 1;
    this.audio.close();
  }
}

/** Safari/iOS Web Audio must be resumed from an explicit guardian gesture. */
export class WebAudioTohokuOutput implements TohokuAudioOutput {
  private context: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private playbackGeneration = 0;
  private settlePlayback: ((reason: 'finished' | 'stopped') => void) | null = null;
  private readonly createContext: () => AudioContext;

  constructor(createContext: () => AudioContext = () => new AudioContext()) {
    this.createContext = createContext;
  }

  async unlock(): Promise<void> {
    if (!this.context || this.context.state === 'closed') this.context = this.createContext();
    const context = this.context;
    // resume() is invoked synchronously from the calling button handler before this await.
    await context.resume();
    if (context.state !== 'running') throw new Error('Web Audioを開始できませんでした。もう一度「会話用の音声を有効化」を押してください。');
  }

  async play(wav: ArrayBuffer, onStart: () => void): Promise<'finished' | 'stopped'> {
    const context = this.context;
    if (!context || context.state !== 'running') throw new Error('会話用の音声が有効ではありません。保護者の有効化操作が必要です。');
    const playbackGeneration = ++this.playbackGeneration;
    const buffer = await context.decodeAudioData(wav.slice(0));
    if (playbackGeneration !== this.playbackGeneration) return 'stopped';
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    this.source = source;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (reason: 'finished' | 'stopped'): void => {
        if (settled) return;
        settled = true;
        source.onended = null;
        source.disconnect();
        if (this.source === source) this.source = null;
        if (this.settlePlayback === finish) this.settlePlayback = null;
        resolve(reason);
      };
      this.settlePlayback = finish;
      source.onended = () => {
        finish(playbackGeneration === this.playbackGeneration ? 'finished' : 'stopped');
      };
      try {
        source.start(0);
        onStart();
      } catch (error) {
        settled = true;
        source.disconnect();
        if (this.source === source) this.source = null;
        if (this.settlePlayback === finish) this.settlePlayback = null;
        reject(error);
      }
    });
  }

  stop(): void {
    this.playbackGeneration += 1;
    const source = this.source;
    this.source = null;
    if (!source) return;
    this.settlePlayback?.('stopped');
    try { source.stop(); } catch { /* A source may already have ended. */ }
    source.disconnect();
  }

  close(): void {
    this.stop();
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') void context.close();
  }
}
