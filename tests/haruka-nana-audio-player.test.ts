import assert from 'node:assert/strict';
import test from 'node:test';
import { HarukaNanaAudioPlayer, type HarukaAudioOutput } from '../src/speech/haruka-nana-audio-player.ts';

class Output implements HarukaAudioOutput {
  unlockCalls = 0;
  plays = 0;
  unlock(): Promise<void> { this.unlockCalls++; return Promise.resolve(); }
  async play(_wav: ArrayBuffer, onStart: () => void): Promise<'finished'> {
    this.plays++;
    onStart();
    return 'finished';
  }
  stop(): void {}
}
const okFetch = (async () => new Response(new Uint8Array([1, 2, 3]))) as typeof fetch;

test('audio unlock is requested synchronously and later replies reuse its output', async () => {
  const output = new Output();
  const player = new HarukaNanaAudioPlayer(output, okFetch);
  const ready = player.unlock();
  assert.equal(output.unlockCalls, 1);
  await ready;
  let starts = 0;
  assert.equal(await player.play('first.wav', () => starts++), 'finished');
  assert.equal(await player.play('second.wav', () => starts++), 'finished');
  assert.equal(output.plays, 2);
  assert.equal(starts, 2);
  assert.equal(player.isPlaying, false);
});

test('stopping while a clip loads completes immediately and suppresses stale playback', async () => {
  let release!: (response: Response) => void;
  const output = new Output();
  const player = new HarukaNanaAudioPlayer(output, (() => new Promise(resolve => { release = resolve; })) as typeof fetch);
  const playing = player.play('slow.wav', () => assert.fail('stale audio started'));
  player.stop();
  assert.equal(await playing, 'stopped');
  release(new Response(new Uint8Array([1])));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(output.plays, 0);
  assert.equal(player.isPlaying, false);
});

test('missing audio reports an error and a subsequent turn can play', async () => {
  let calls = 0;
  const output = new Output();
  const player = new HarukaNanaAudioPlayer(output, (async () => ++calls === 1
    ? new Response(null, { status: 404 }) : new Response(new Uint8Array([1]))) as typeof fetch);
  assert.equal(await player.play('missing.wav', () => {}), 'error');
  assert.equal(player.isPlaying, false);
  assert.equal(await player.play('next.wav', () => {}), 'finished');
});

test('native URL playback is invoked in the tap stack without waiting for a fetch', async () => {
  const output = new Output();
  const urls: string[] = [];
  const native = Object.assign(output, {
    async playUrl(url: string, onStart: () => void): Promise<'finished'> {
      urls.push(url);
      onStart();
      return 'finished';
    },
  });
  const noFetch = (() => { throw new Error('native playback must not fetch or create a Blob first'); }) as typeof fetch;
  const player = new HarukaNanaAudioPlayer(native, noFetch);
  const first = player.play('/voice/wav/0003.wav', () => {});
  assert.deepEqual(urls, ['/voice/wav/0003.wav']);
  assert.equal(await first, 'finished');
  assert.equal(await player.play('/voice/wav/0071.wav', () => {}), 'finished');
  assert.deepEqual(urls, ['/voice/wav/0003.wav', '/voice/wav/0071.wav']);
});
test('native autoplay denial is reported with its original reason, not flattened', async () => {
  const output = Object.assign(new Output(), {
    playUrl(): Promise<'finished'> { return Promise.reject(new DOMException('gesture required', 'NotAllowedError')); },
  });
  const player = new HarukaNanaAudioPlayer(output, okFetch);
  assert.equal(await player.play('/voice/wav/0071.wav', () => {}), 'error');
  assert.match(player.lastError ?? '', /NotAllowedError/);
  assert.equal(player.isPlaying, false);
});
