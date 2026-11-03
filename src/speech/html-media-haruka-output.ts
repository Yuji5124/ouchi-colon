import type { HarukaAudioOutput } from './haruka-nana-audio-player.ts';

interface MediaPort {
  src: string;
  pause(): void;
  play(): Promise<void>;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/** Dictionary playback and native replay controls share the same media element. */
export class HtmlMediaHarukaOutput implements HarukaAudioOutput {
  private readonly audio: MediaPort;
  private objectUrl: string | null = null;
  private finishCurrent: ((reason: 'finished' | 'stopped') => void) | null = null;
  private primed = false;

  constructor(audio: MediaPort) { this.audio = audio; }

  unlock(): Promise<void> {
    if (this.primed || this.finishCurrent || (this.audio.src && !this.audio.src.startsWith('data:'))) return Promise.resolve();
    const silent = 'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    this.audio.src = silent;
    // play() is called synchronously while the parent button gesture is active.
    return this.audio.play().then(() => {
      this.primed = true;
      if (this.audio.src === silent) this.audio.pause();
    });
  }

  play(wav: ArrayBuffer, onStart: () => void): Promise<'finished' | 'stopped'> {
    return this.startSource(URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })), onStart, true);
  }

  playUrl(url: string, onStart: () => void): Promise<'finished' | 'stopped'> {
    return this.startSource(url, onStart, false);
  }

  private startSource(url: string, onStart: () => void, objectUrl: boolean): Promise<'finished' | 'stopped'> {
    this.stop();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = objectUrl ? url : null;
    this.audio.src = url;
    return new Promise((resolve, reject) => {
      let settled = false;
      let started = false;
      const cleanup = (): void => {
        this.audio.removeEventListener('playing', start);
        this.audio.removeEventListener('ended', end);
        this.audio.removeEventListener('error', fail);
        if (this.finishCurrent === finish) this.finishCurrent = null;
      };
      const finish = (reason: 'finished' | 'stopped'): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        cleanup();
        resolve(reason);
      };
      const start = (): void => {
        if (started || settled) return;
        started = true;
        this.primed = true;
        onStart();
      };
      const end = (): void => { if (started) finish('finished'); else fail(); };
      const fail = (cause?: unknown): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        cleanup();
        this.audio.pause();
        reject(cause instanceof Error ? cause : new Error('media playback unavailable'));
      };
      const timeout = setTimeout(() => fail(new Error('playback-timeout')), 18000);
      this.finishCurrent = finish;
      this.audio.addEventListener('playing', start);
      this.audio.addEventListener('ended', end);
      this.audio.addEventListener('error', fail);
      try { void this.audio.play().catch(fail); } catch { fail(); }
    });
  }

  stop(): void {
    // The TOHOKU path also calls stop; do not touch an unused native player.
    if (!this.finishCurrent && !this.audio.src) return;
    this.finishCurrent?.('stopped');
    this.audio.pause();
  }
}
