import assert from 'node:assert/strict';
import test from 'node:test';
import { HtmlMediaHarukaOutput } from '../src/speech/html-media-haruka-output.ts';

class Media {
  src = '';
  plays: string[] = [];
  rejectPlay = false;
  paused = true;
  listeners = new Map<string, Set<() => void>>();
  play(): Promise<void> {
    this.plays.push(this.src);
    this.paused = false;
    return this.rejectPlay ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve();
  }
  pause(): void { this.paused = true; }
  addEventListener(type: string, listener: () => void): void {
    const items = this.listeners.get(type) ?? new Set();
    items.add(listener); this.listeners.set(type, items);
  }
  removeEventListener(type: string, listener: () => void): void { this.listeners.get(type)?.delete(listener); }
  emit(type: string): void { for (const callback of [...(this.listeners.get(type) ?? [])]) callback(); }
}

test('silent priming runs within the tap and cannot pause a later reply', async () => {
  const media = new Media();
  const output = new HtmlMediaHarukaOutput(media);
  const unlocked = output.unlock();
  assert.match(media.plays[0]!, /^data:audio\/wav;base64,/);
  const reply = output.play(new ArrayBuffer(4), () => {});
  await unlocked;
  assert.equal(media.paused, false);
  assert.match(media.src, /^blob:/);
  media.emit('playing'); media.emit('ended');
  assert.equal(await reply, 'finished');
});

test('automatic replies use one media element and retain exactly the same audio for native replay', async () => {
  const media = new Media();
  const output = new HtmlMediaHarukaOutput(media);
  let starts = 0;
  const first = output.play(new ArrayBuffer(4), () => starts++);
  const firstUrl = media.src;
  media.emit('playing'); media.emit('playing'); media.emit('ended');
  assert.equal(await first, 'finished');
  assert.equal(media.src, firstUrl, 'native replay keeps this response, not a fixed greeting');
  const second = output.play(new ArrayBuffer(8), () => starts++);
  assert.notEqual(media.src, firstUrl);
  media.emit('playing'); media.emit('ended');
  assert.equal(await second, 'finished');
  assert.equal(starts, 2);
});

test('autoplay denial retains current reply for a direct native replay and permits retry', async () => {
  const media = new Media(); media.rejectPlay = true;
  const output = new HtmlMediaHarukaOutput(media);
  await assert.rejects(output.play(new ArrayBuffer(4), () => assert.fail()));
  assert.match(media.src, /^blob:/);
  const currentReply = media.src;
  await output.unlock();
  assert.equal(media.src, currentReply, 'a later conversation tap must not replace the visible reply with silence');
  media.rejectPlay = false;
  await media.play(); // A later direct tap can play the very same src.
  const next = output.play(new ArrayBuffer(8), () => {});
  output.stop(); media.emit('ended');
  assert.equal(await next, 'stopped');
});

test('native recording URL is preserved for repeated automatic turns without Blob conversion', async () => {
  const media = new Media();
  const output = new HtmlMediaHarukaOutput(media);
  const setup = output.playUrl('/voice/wav/0003.wav', () => {});
  assert.equal(media.plays[0], '/voice/wav/0003.wav');
  media.emit('playing'); media.emit('ended');
  assert.equal(await setup, 'finished');
  const reply = output.playUrl('/voice/wav/0071.wav', () => {});
  assert.equal(media.src, '/voice/wav/0071.wav');
  media.emit('playing'); media.emit('ended');
  assert.equal(await reply, 'finished');
  assert.equal(media.src, '/voice/wav/0071.wav');
});
