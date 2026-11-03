import type { SpeechEndReason } from './speech-synthesis-engine';

export class HarukaNanaAudioPlayer {
  private generation = 0;
  private current: HTMLAudioElement | null = null;
  private reusableAudio: HTMLAudioElement | null = null;
  private finishCurrent: ((reason: SpeechEndReason) => void) | null = null;
  private unlocked = false;

  get isPlaying(): boolean { return this.current !== null; }
  get isUnlocked(): boolean { return this.unlocked; }

  play(url: string, onStart: () => void): Promise<SpeechEndReason> {
    this.stop();
    if (typeof Audio === 'undefined') return Promise.resolve('error');
    const generation = ++this.generation;
    const audio = this.reusableAudio ?? new Audio();
    this.reusableAudio = audio;
    audio.src = url;
    audio.preload = 'auto';
    this.current = audio;

    return new Promise((resolve) => {
      let settled = false;
      let started = false;
      const cleanup = (): void => {
        audio.removeEventListener('playing', start);
        audio.removeEventListener('ended', end);
        audio.removeEventListener('error', fail);
        if (this.current === audio) this.current = null;
        if (this.finishCurrent === finish) this.finishCurrent = null;
      };
      const finish = (reason: SpeechEndReason): void => {
        if (settled || generation !== this.generation) return;
        settled = true;
        cleanup();
        if (reason !== 'finished') audio.pause();
        resolve(reason);
      };
      const start = (): void => {
        if (generation !== this.generation || started) return;
        started = true;
        this.unlocked = true;
        onStart();
      };
      const end = (): void => finish(started ? 'finished' : 'error');
      const fail = (): void => finish('error');
      this.finishCurrent = finish;
      audio.addEventListener('playing', start);
      audio.addEventListener('ended', end);
      audio.addEventListener('error', fail);
      try {
        void audio.play().catch(fail);
      } catch {
        fail();
      }
    });
  }

  stop(): void {
    this.finishCurrent?.('stopped');
  }
}

