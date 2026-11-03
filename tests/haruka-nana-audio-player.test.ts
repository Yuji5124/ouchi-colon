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
