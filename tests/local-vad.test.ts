import assert from 'node:assert/strict';
import test from 'node:test';
import { SilenceEndpointDetector } from '../src/speech/local-vad.ts';

test('requires sustained local sound and a long silence before reporting candidates', () => {
  const detector = new SilenceEndpointDetector({ threshold: 0.02, speechConfirmMs: 100, silenceConfirmMs: 900 });
  assert.equal(detector.process(0.03, 0), null);
  assert.equal(detector.process(0.03, 99), null);
  assert.deepEqual(detector.process(0.03, 100), { type: 'speech-start', at: 100 });
  assert.equal(detector.process(0, 101), null);
  assert.equal(detector.process(0, 1000), null);
  assert.deepEqual(detector.process(0, 1001), { type: 'speech-end-candidate', at: 1001 });
});

test('short pauses and renewed speech cancel the silence candidate', () => {
  const detector = new SilenceEndpointDetector({ threshold: 0.02, speechConfirmMs: 0, silenceConfirmMs: 900 });
  assert.deepEqual(detector.process(0.05, 10), { type: 'speech-start', at: 10 });
  assert.equal(detector.process(0, 20), null);
  assert.equal(detector.process(0, 800), null);
  assert.equal(detector.process(0.04, 810), null);
  assert.equal(detector.process(0, 820), null);
  assert.deepEqual(detector.process(0, 1720), { type: 'speech-end-candidate', at: 1720 });
});

test('invalid samples and reset do not produce endpoint events', () => {
  const detector = new SilenceEndpointDetector({ threshold: 0.02, speechConfirmMs: 0 });
  assert.equal(detector.process(Number.NaN, 0), null);
  assert.deepEqual(detector.process(0.03, 1), { type: 'speech-start', at: 1 });
  detector.reset();
  assert.equal(detector.process(0, 2), null);
});
