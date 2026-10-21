import assert from 'node:assert/strict';
import test from 'node:test';
import { SpeechSynthesisEngine, type SpeechPort } from '../src/speech/speech-synthesis-engine.ts';

class FakeUtterance {
  lang = '';
  rate = 1;
  pitch = 1;
  voice?: SpeechSynthesisVoice;
  onstart: (() => void) | null = null;
  onboundary: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
}

class FakeSpeechPort implements SpeechPort {
  current: SpeechSynthesisUtterance | null = null;
  cancelled = false;
  speak(utterance: SpeechSynthesisUtterance): void { this.current = utterance; }
  cancel(): void { this.cancelled = true; }
  getVoices(): SpeechSynthesisVoice[] { return []; }
  utterance(): FakeUtterance { return this.current as unknown as FakeUtterance; }
}

const factory = (text: string): SpeechSynthesisUtterance => {
  const utterance = new FakeUtterance() as unknown as SpeechSynthesisUtterance & { text: string };
  utterance.text = text;
  return utterance;
};

test('speaks Japanese and reports start, boundary, and end events', async () => {
  const port = new FakeSpeechPort();
  const engine = new SpeechSynthesisEngine(port, factory);
  const events: string[] = [];
  const result = engine.speak('こんにちは', {
    onStart: () => events.push('start'),
    onBoundary: () => events.push('boundary'),
    onEnd: (reason) => events.push(reason),
  });
  assert.equal(engine.isSpeaking, true);
  assert.equal(engine.shouldSuppressRecognition, true);
  assert.equal(port.utterance().lang, 'ja-JP');
  assert.equal(port.utterance().rate, 0.88);
  port.utterance().onstart?.();
  port.utterance().onboundary?.();
  port.utterance().onend?.();
  assert.equal(await result, true);
  assert.deepEqual(events, ['start', 'boundary', 'finished']);
  assert.equal(engine.shouldSuppressRecognition, false);
});

test('stops speech and restores recognition-suppression state', async () => {
  const port = new FakeSpeechPort();
  const engine = new SpeechSynthesisEngine(port, factory);
  const ended: string[] = [];
  const result = engine.speak('おはよう', { onEnd: (reason) => ended.push(reason) });
  engine.stop();
  assert.equal(await result, false);
  assert.equal(port.cancelled, true);
  assert.equal(engine.isSpeaking, false);
  assert.equal(engine.shouldSuppressRecognition, false);
  assert.deepEqual(ended, ['stopped']);
});

test('reports TTS errors and clears speaking state', async () => {
  const port = new FakeSpeechPort();
  const engine = new SpeechSynthesisEngine(port, factory);
  let message = '';
  const result = engine.speak('こんにちは', { onError: (value) => { message = value; } });
  port.utterance().onerror?.({ error: 'synthesis-failed' });
  assert.equal(await result, false);
  assert.equal(message, 'synthesis-failed');
  assert.equal(engine.isSpeaking, false);
});

test('unsupported speech synthesis returns without speaking', async () => {
  const engine = new SpeechSynthesisEngine(null, factory);
  assert.equal(engine.isSupported, false);
  assert.equal(await engine.speak('こんにちは'), false);
});
