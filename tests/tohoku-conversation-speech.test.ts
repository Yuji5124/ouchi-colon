import assert from 'node:assert/strict';
import test from 'node:test';
import { TohokuConversationSpeech, WebAudioTohokuOutput, type TohokuAudioOutput } from '../src/speech/tohoku-conversation-speech.ts';
import type { TohokuLabEvent } from '../src/speech/tohoku-voice-lab.ts';

class FakeOutput implements TohokuAudioOutput {
  unlocked = false;
  plays: ArrayBuffer[] = [];
  starts = 0;
  stopped = 0;
  async unlock(): Promise<void> { this.unlocked = true; }
  async play(wav: ArrayBuffer, onStart: () => void): Promise<'finished' | 'stopped'> {
    this.plays.push(wav);
    this.starts += 1;
    onStart();
    return 'finished';
  }
  stop(): void { this.stopped += 1; }
  close(): void { this.stop(); }
}

function generated(): TohokuLabEvent {
  return { type: 'generated', purpose: 'conversation', generationMs: 138, wav: new ArrayBuffer(8), byteLength: 8 };
}

test('synthesizes a dynamic reply, starts playback, and waits for actual playback completion', async () => {
  const output = new FakeOutput();
  const purposes: string[] = [];
  const lab = {
    state: 'ready',
    async generate(text: string, purpose?: string) {
      assert.equal(text, 'こんにちは、コロンだよ。');
      purposes.push(purpose ?? '');
      return generated();
    },
  };
  const speech = new TohokuConversationSpeech(lab, output);
  await speech.unlock();
  let started = 0;
  const result = await speech.speak('こんにちは、コロンだよ。', () => { started += 1; });
  assert.equal(output.unlocked, true);
  assert.deepEqual(purposes, ['conversation']);
  assert.equal(output.plays.length, 1);
  assert.equal(started, 1);
  assert.deepEqual(result, { reason: 'finished', generationMs: 138 });
  assert.equal(speech.isBusy, false);
});

test('does not play a stale WAV after cancellation while synthesis is underway', async () => {
  const output = new FakeOutput();
  let resolveFirst!: (event: TohokuLabEvent) => void;
  let call = 0;
  const lab = {
    state: 'ready',
    generate() {
      call += 1;
      if (call === 1) return new Promise<TohokuLabEvent>((resolve) => { resolveFirst = resolve; });
      return Promise.resolve(generated());
    },
  };
  const speech = new TohokuConversationSpeech(lab, output);
  const stale = speech.speak('古い返答', () => assert.fail('stale response must not start'));
  await Promise.resolve();
  speech.stop();
  const current = speech.speak('新しい返答', () => undefined);
  resolveFirst(generated());
  assert.equal((await stale).reason, 'stopped');
  assert.equal((await current).reason, 'finished');
  assert.equal(output.plays.length, 1);
  assert.equal(call, 2);
});

test('returns a recoverable error for the caller to route to iOS TTS', async () => {
  const output = new FakeOutput();
  const lab = { state: 'ready', async generate() { throw new Error('Open JTalk failed'); } };
  const speech = new TohokuConversationSpeech(lab, output);
  const result = await speech.speak('返事', () => undefined);
  assert.deepEqual(result, { reason: 'error', error: 'Open JTalk failed' });
  assert.equal(output.plays.length, 0);
});

test('stop and close cancel active audio and clear playback state', async () => {
  const output = new FakeOutput();
  const lab = { state: 'ready', async generate() { return generated(); } };
  const speech = new TohokuConversationSpeech(lab, output);
  assert.equal((await speech.speak('あいさつ', () => undefined)).reason, 'finished');
  speech.close();
  assert.equal(output.stopped, 1);
  assert.equal(speech.isBusy, false);
});

test('Web Audio unlocks from the explicit action and resolves playback from source end or stop', async () => {
  class FakeSource {
    buffer: unknown = null;
    onended: (() => void) | null = null;
    started = false;
    stopped = false;
    connect(): void {}
    disconnect(): void {}
    start(): void { this.started = true; }
    stop(): void { this.stopped = true; }
    end(): void { this.onended?.(); }
  }
  const sources: FakeSource[] = [];
  let state: AudioContextState = 'suspended';
  const context = {
    get state() { return state; },
    destination: {},
    async resume() { state = 'running'; },
    async close() { state = 'closed'; },
    async decodeAudioData() { return { duration: 0.1 } as AudioBuffer; },
    createBufferSource() {
      const source = new FakeSource();
      sources.push(source);
      return source;
    },
  } as unknown as AudioContext;
  const output = new WebAudioTohokuOutput(() => context);
  await output.unlock();
  let starts = 0;
  const finished = output.play(new ArrayBuffer(4), () => { starts += 1; });
  await Promise.resolve();
  assert.equal(sources[0]?.started, true);
  assert.equal(starts, 1);
  sources[0]?.end();
  assert.equal(await finished, 'finished');

  const stopped = output.play(new ArrayBuffer(4), () => undefined);
  await Promise.resolve();
  output.stop();
  assert.equal(sources[1]?.stopped, true);
  assert.equal(await stopped, 'stopped');
  output.close();
  assert.equal(state, 'closed');
});

test('supports 20 serial dynamic replies on one warmed conversation engine', async () => {
  const output = new FakeOutput();
  const received: string[] = [];
  let active = 0;
  let maximumActive = 0;
  const lab = {
    state: 'ready',
    async generate(text: string) {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      received.push(text);
      active -= 1;
      return generated();
    },
  };
  const speech = new TohokuConversationSpeech(lab, output);
  const results = [];
  for (let index = 0; index < 20; index += 1) {
    results.push(await speech.speak(`返答 ${index + 1}`, () => undefined));
  }
  assert.equal(received.length, 20);
  assert.equal(output.plays.length, 20);
  assert.equal(maximumActive, 1);
  assert.equal(results.filter((result) => result.reason === 'finished').length, 20);
});
