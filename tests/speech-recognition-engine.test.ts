import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SpeechRecognitionEngine,
  type RecognitionResultEventLike,
  type SpeechRecognitionPort,
} from '../src/speech/speech-recognition-engine.ts';

class FakeRecognizer implements SpeechRecognitionPort {
  lang = '';
  continuous = true;
  interimResults = false;
  maxAlternatives = 0;
  onstart: (() => void) | null = null;
  onaudiostart: (() => void) | null = null;
  onspeechstart: (() => void) | null = null;
  onspeechend: (() => void) | null = null;
  onresult: ((event: RecognitionResultEventLike) => void) | null = null;
  onerror: ((event: { error: string; message?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  startCalls = 0;
  stopCalls = 0;
  abortCalls = 0;
  start(): void { this.startCalls += 1; }
  stop(): void { this.stopCalls += 1; }
  abort(): void { this.abortCalls += 1; }

  result(transcript: string, isFinal: boolean): void {
    const alternative = { transcript, confidence: 0.9 };
    const result = Object.assign([alternative], { isFinal });
    this.onresult?.({ resultIndex: 0, results: [result] });
  }
}

test('starts one explicit ja-JP turn and reports speech start, end, and final result', () => {
  const recognizer = new FakeRecognizer();
  const engine = new SpeechRecognitionEngine(() => recognizer);
  const events: string[] = [];
  const interim: string[] = [];
  let finalText = '';
  assert.equal(engine.start({
    onStart: () => events.push('start'),
    onSpeechStart: () => events.push('speechstart'),
    onSpeechEnd: () => events.push('speechend'),
    onInterim: (text) => interim.push(text),
    onEnd: (text) => { finalText = text; events.push('end'); },
  }), 'started');
  assert.equal(recognizer.startCalls, 1);
  assert.equal(recognizer.lang, 'ja-JP');
  assert.equal(recognizer.continuous, false);
  assert.equal(recognizer.interimResults, true);
  assert.equal(engine.start({}), 'already-active');

  recognizer.onstart?.();
  recognizer.onspeechstart?.();
  recognizer.result('きょう', false);
  recognizer.result('きょうは公園で遊んだ', true);
  recognizer.onspeechend?.();
  assert.deepEqual(events, ['start', 'speechstart', 'speechend']);
  assert.deepEqual(interim, ['きょう', 'きょうは公園で遊んだ']);
  recognizer.onend?.();
  assert.equal(finalText, 'きょうは公園で遊んだ');
  assert.equal(engine.isActive, false);
  assert.deepEqual(events, ['start', 'speechstart', 'speechend', 'end']);
});

test('interim text changes are surfaced without finalizing the turn early', () => {
  const recognizer = new FakeRecognizer();
  const engine = new SpeechRecognitionEngine(() => recognizer);
  const seen: string[] = [];
  let ended = false;
  engine.start({ onInterim: (text) => seen.push(text), onEnd: () => { ended = true; } });
  recognizer.result('ねこ', false);
  recognizer.result('ねこが', false);
  assert.deepEqual(seen, ['ねこ', 'ねこが']);
  assert.equal(ended, false);
  recognizer.onend?.();
  assert.equal(ended, true);
});

test('reports microphone permission denial and does not return a transcript', () => {
  const recognizer = new FakeRecognizer();
  const engine = new SpeechRecognitionEngine(() => recognizer);
  let errorCode = '';
  let result = 'pending';
  engine.start({ onError: (code) => { errorCode = code; }, onEnd: (text) => { result = text; } });
  recognizer.onerror?.({ error: 'not-allowed' });
  recognizer.onend?.();
  assert.equal(errorCode, 'not-allowed');
  assert.equal(result, '');
  assert.equal(engine.isActive, false);
});

test('network recognition failure ends the one-shot session without retrying', () => {
  const recognizer = new FakeRecognizer();
  const engine = new SpeechRecognitionEngine(() => recognizer);
  let errorCode = '';
  let transcript = 'pending';
  engine.start({ onError: (code) => { errorCode = code; }, onEnd: (text) => { transcript = text; } });
  recognizer.onerror?.({ error: 'network' });
  recognizer.onend?.();
  assert.equal(errorCode, 'network');
  assert.equal(transcript, '');
  assert.equal(recognizer.startCalls, 1);
  assert.equal(engine.isActive, false);
});

test('aborts recognition before character speech and suppresses stale callbacks', () => {
  const recognizer = new FakeRecognizer();
  const engine = new SpeechRecognitionEngine(() => recognizer);
  let finalized = false;
  engine.start({ onEnd: () => { finalized = true; } });
  engine.abort();
  recognizer.result('こんにちは', true);
  recognizer.onend?.();
  assert.equal(recognizer.abortCalls, 1);
  assert.equal(finalized, false);
  assert.equal(engine.isActive, false);
  assert.equal(engine.start({}), 'started');
});

test('unsupported browsers use the hand-input fallback', () => {
  const engine = new SpeechRecognitionEngine(null);
  assert.equal(engine.isSupported, false);
  assert.equal(engine.start({}), 'unsupported');
});

test('Safari final result finishes once even when onend never arrives', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const recognizer = new FakeRecognizer();
  const engine = new SpeechRecognitionEngine(() => recognizer);
  const replies: string[] = [];
  engine.start({ onEnd: text => replies.push(text) });
  recognizer.onstart?.();
  recognizer.result('おはよう', true);
  assert.equal(recognizer.stopCalls, 0);
  assert.deepEqual(replies, []);
  t.mock.timers.tick(1200);
  recognizer.onend?.();
  assert.deepEqual(replies, ['おはよう']);
  assert.equal(engine.isActive, false);
  engine.start({ onEnd: text => replies.push(text) });
  recognizer.onstart?.();
  recognizer.result('こんにちは', true);
  recognizer.onend?.();
  t.mock.timers.tick(1200);
  assert.deepEqual(replies, ['おはよう', 'こんにちは']);
});

test('missing recognition start reports a bounded failure and permits a fresh tap', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const recognizer = new FakeRecognizer();
  const engine = new SpeechRecognitionEngine(() => recognizer);
  const errors: string[] = [];
  engine.start({ onError: code => errors.push(code) });
  t.mock.timers.tick(8000);
  assert.deepEqual(errors, ['start-timeout']);
  assert.equal(engine.isActive, false);
  assert.equal(engine.start({}), 'started');
  recognizer.onstart?.();
  t.mock.timers.tick(8000);
  assert.deepEqual(errors, ['start-timeout']);
  engine.abort();
});

test('manual stop discards a pending Safari final-result timer', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const recognizer = new FakeRecognizer();
  const engine = new SpeechRecognitionEngine(() => recognizer);
  let replies = 0;
  engine.start({ onEnd: () => replies++ });
  recognizer.onstart?.();
  recognizer.result('ありがとう', true);
  engine.abort();
  t.mock.timers.tick(1200);
  assert.equal(replies, 0);
});

test('normal one-shot completion never forces stop or abort and cancels the fallback', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const recognizer = new FakeRecognizer();
  const engine = new SpeechRecognitionEngine(() => recognizer);
  const replies: string[] = [];
  engine.start({ onEnd: text => replies.push(text) });
  recognizer.onstart?.();
  recognizer.result('こんにちは', true);
  recognizer.result('こんにちは', true);
  assert.equal(recognizer.stopCalls, 0);
  assert.equal(recognizer.abortCalls, 0);
  assert.deepEqual(replies, []);
  t.mock.timers.tick(200);
  recognizer.onend?.();
  t.mock.timers.tick(1500);
  recognizer.onend?.();
  assert.deepEqual(replies, ['こんにちは']);
  assert.equal(recognizer.stopCalls, 0);
  assert.equal(recognizer.abortCalls, 0);
  assert.equal(engine.isActive, false);
});

test('missing terminal event still releases recognition once without forcing an early stop', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const recognizer = new FakeRecognizer();
  const engine = new SpeechRecognitionEngine(() => recognizer);
  const replies: string[] = [];
  engine.start({ onEnd: text => replies.push(text) });
  recognizer.onstart?.();
  recognizer.result('おはよう', true);
  t.mock.timers.tick(1199);
  assert.deepEqual(replies, []);
  assert.equal(recognizer.stopCalls, 0);
  assert.equal(recognizer.abortCalls, 0);
  t.mock.timers.tick(1);
  assert.equal(recognizer.abortCalls, 1);
  assert.deepEqual(replies, ['おはよう']);
  recognizer.onend?.();
  t.mock.timers.tick(5000);
  assert.deepEqual(replies, ['おはよう']);
});
