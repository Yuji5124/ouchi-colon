import assert from 'node:assert/strict';
import test from 'node:test';
import { NativeTtsDiagnostic, type DiagnosticSpeechPort, type DiagnosticUtterance } from '../src/speech/tts-diagnostic.ts';

class FakeUtterance implements DiagnosticUtterance {
  lang = '';
  voice: SpeechSynthesisVoice | null = null;
  rate = 1;
  pitch = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error?: string }) => void) | null = null;
}

class FakePort implements DiagnosticSpeechPort {
  current: FakeUtterance | null = null;
  cancelled = false;
  paused = false;
  pending = false;
  speaking = false;
  voiceList: SpeechSynthesisVoice[] = [];
  cancelHook: (() => void) | null = null;
  speak(utterance: DiagnosticUtterance): void { this.current = utterance as FakeUtterance; this.pending = true; }
  cancel(): void { this.cancelled = true; this.pending = false; this.speaking = false; this.cancelHook?.(); }
  getVoices(): SpeechSynthesisVoice[] { return this.voiceList; }
  resume(): void { this.paused = false; }
}

function create(port: FakePort | null, timeout = 15) {
  return new NativeTtsDiagnostic(port, () => new FakeUtterance(), timeout);
}

test('native API diagnostic uses no app wrapper and reports its actual start and end events', async () => {
  const port = new FakePort();
  const probe = create(port);
  const events: string[] = [];
  const resultPromise = probe.run('こんにちは', 'safari-default', { onEvent: (event) => events.push(event.type) });
  assert.equal(probe.hasUtteranceReference, true);
  assert.equal(port.current?.lang, 'ja-JP');
  assert.equal(port.current?.voice, null);
  port.current?.onstart?.();
  port.current?.onend?.();
  const result = await resultPromise;
  assert.deepEqual(events, ['onstart', 'onend']);
  assert.equal(result.outcome, 'ended');
  assert.equal(result.onstart, true);
  assert.equal(result.onend, true);
  assert.equal(probe.hasUtteranceReference, false);
});

test('selects an explicit Japanese voice and reports missing Japanese voices', async () => {
  const port = new FakePort();
  const japanese = { name: '日本語', lang: 'ja-JP' } as SpeechSynthesisVoice;
  port.voiceList = [japanese];
  const probe = create(port);
  const resultPromise = probe.run('こんにちは', 'explicit-japanese');
  assert.equal(port.current?.voice, japanese);
  assert.equal(port.current?.lang, 'ja-JP');
  port.current?.onstart?.();
  port.current?.onend?.();
  assert.equal((await resultPromise).selectedVoice, '日本語 (ja-JP)');

  const empty = create(new FakePort());
  assert.equal((await empty.run('こんにちは', 'explicit-japanese')).outcome, 'no-japanese-voice');
});

test('no-language condition leaves language and voice unset', async () => {
  const port = new FakePort();
  const probe = create(port);
  const done = probe.run('こんにちは', 'no-language');
  assert.equal(port.current?.lang, '');
  assert.equal(port.current?.voice, null);
  port.current?.onstart?.();
  port.current?.onend?.();
  assert.equal((await done).outcome, 'ended');
});

test('does not call cancel before speak unless the comparison option is selected', async () => {
  const port = new FakePort();
  const probe = create(port);
  const done = probe.run('こんにちは', 'safari-default');
  assert.equal(port.cancelled, false);
  port.current?.onstart?.();
  port.current?.onend?.();
  await done;

  const second = probe.run('もう一度', 'safari-default', { cancelBefore: true });
  assert.equal(port.cancelled, true);
  port.current?.onstart?.();
  port.current?.onend?.();
  await second;
});

test('explicit resume only calls the browser when paused', () => {
  const port = new FakePort();
  const probe = create(port);
  assert.equal(probe.resumeFromUserGesture(), 'not-paused');
  port.paused = true;
  assert.equal(probe.resumeFromUserGesture(), 'requested');
  assert.equal(port.paused, false);
  assert.equal(create(null).resumeFromUserGesture(), 'unsupported');
});

test('reports onerror content and releases its reference for a fresh user retry', async () => {
  const port = new FakePort();
  const probe = create(port);
  const first = probe.run('こんにちは', 'safari-default');
  port.current?.onerror?.({ error: 'not-allowed' });
  const result = await first;
  assert.equal(result.outcome, 'error');
  assert.equal(result.error, 'not-allowed');
  assert.equal(probe.hasUtteranceReference, false);

  const retry = probe.run('再試行', 'safari-default');
  assert.equal(port.current?.lang, 'ja-JP');
  port.current?.onstart?.();
  port.current?.onend?.();
  assert.equal((await retry).outcome, 'ended');
});

test('times out if no start or terminal event arrives and cancels the stuck utterance', async () => {
  const port = new FakePort();
  const probe = create(port, 5);
  const events: string[] = [];
  port.cancelHook = () => port.current?.onerror?.({ error: 'canceled' });
  const result = await probe.run('こんにちは', 'safari-default', { onEvent: (event) => events.push(event.type) });
  assert.equal(result.outcome, 'timeout');
  assert.equal(result.onstart, false);
  assert.match(result.error ?? '', /5ms/);
  assert.equal(port.cancelled, true);
  assert.deepEqual(events, ['timeout'], 'the cleanup cancel event cannot overwrite the timeout diagnosis');
  assert.equal(probe.hasUtteranceReference, false);
});

test('refuses overlapping diagnostic speech and resolves explicit stop for retry', async () => {
  const port = new FakePort();
  const probe = create(port);
  const first = probe.run('こんにちは', 'safari-default');
  assert.equal((await probe.run('重ねない', 'safari-default')).outcome, 'busy');
  probe.stopFromUserGesture();
  assert.equal((await first).outcome, 'canceled');
  assert.equal(port.cancelled, true);
  assert.equal(probe.isActive, false);
});

test('reports unsupported Web Speech separately from a playback failure', async () => {
  assert.equal((await create(null).run('こんにちは', 'safari-default')).outcome, 'unsupported');
});
