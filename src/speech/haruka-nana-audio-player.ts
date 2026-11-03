import { setAudioSessionType } from './audio-session.ts';
import type { SpeechEndReason } from './speech-synthesis-engine';

export interface HarukaAudioOutput {
  unlock(): Promise<void>;
  play(wav: ArrayBuffer, onStart: () => void): Promise<'finished' | 'stopped'>;
  playUrl?(url: string, onStart: () => void): Promise<'finished' | 'stopped'>;
  stop(): void;
}

/** Uses the same gesture-enabled voice output throughout a conversation. */
export class HarukaNanaAudioPlayer {
  private generation = 0;
  private current = false;
  private lastErrorValue: string | null = null;
  private request: AbortController | null = null;
  private finishCurrent: ((reason: SpeechEndReason) => void) | null = null;

  private readonly output: HarukaAudioOutput;
  private readonly fetcher: typeof fetch;

  constructor(output: HarukaAudioOutput, fetcher: typeof fetch = fetch) {
    this.output = output;
    this.fetcher = fetcher;
  }

  get isPlaying(): boolean { return this.current; }
  get lastError(): string | null { return this.lastErrorValue; }

  unlock(): Promise<void> {
    setAudioSessionType('playback');
    return this.output.unlock();
  }

  play(url: string, onStart: () => void): Promise<SpeechEndReason> {
    this.stop();
    this.lastErrorValue = null;
    const generation = ++this.generation;
    const request = new AbortController();
    this.request = request;
    this.current = true;
    return new Promise((resolve) => {
      let settled = false;
      const finish = (reason: SpeechEndReason): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (this.request === request) this.request = null;
        if (this.finishCurrent === finish) this.finishCurrent = null;
        if (generation === this.generation) this.current = false;
        resolve(reason);
      };
      const timeout = setTimeout(() => {
        request.abort();
        this.output.stop();
        this.lastErrorValue = 'playback-timeout';
        finish('error');
      }, 20000);
      this.finishCurrent = finish;
      void (async () => {
        try {
          if (this.output.playUrl) {
            setAudioSessionType('playback');
            // The media play request stays in the caller's tap stack, without fetch or Blob.
            const reason = await this.output.playUrl(url, () => {
              if (!settled && generation === this.generation) onStart();
            });
            finish(reason);
            return;
          }
          const response = await this.fetcher(url, { signal: request.signal });
          if (!response.ok) throw new Error('voice unavailable');
          const wav = await response.arrayBuffer();
          if (settled || generation !== this.generation) return;
          setAudioSessionType('playback');
          const reason = await this.output.play(wav, () => {
            if (!settled && generation === this.generation) onStart();
          });
          finish(reason);
        } catch (error) {
          if (!settled && generation === this.generation && !request.signal.aborted) {
            this.lastErrorValue = error instanceof Error ? error.name + ': ' + error.message : 'playback-error';
          }
          finish(request.signal.aborted ? 'stopped' : 'error');
        }
      })();
    });
  }

  stop(): void {
    this.request?.abort();
    this.output.stop();
    this.finishCurrent?.('stopped');
    this.generation += 1;
    this.current = false;
  }
}
