import assert from 'node:assert/strict';
import test from 'node:test';
import { ReactionEngine } from '../src/reaction/reaction-engine.ts';

test('face discovery reacts happily once and respects its cooldown', () => {
  const engine = new ReactionEngine();
  assert.equal(engine.handle('FACE_FOUND', 0).expression, 'HAPPY');
  engine.handle('FACE_LOST', 100);
  assert.equal(engine.handle('FACE_FOUND', 1000).expression, 'IDLE');
  engine.handle('FACE_LOST', 1100);
  assert.equal(engine.handle('FACE_FOUND', 5100).expression, 'HAPPY');
});

test('voice and response events produce listen, surprise, think, and talk reactions', () => {
  const engine = new ReactionEngine();
  assert.equal(engine.handle('VOICE_INPUT_STARTED', 0).expression, 'LISTENING');
  assert.equal(engine.handle('UTTERANCE_DETECTED', 10).effect, 'VOICE_SURPRISE');
  assert.equal(engine.handle('UTTERANCE_ENDED', 200).expression, 'THINK');
  assert.equal(engine.handle('RESPONSE_STARTED', 300).mouthOpen, 0.3);
  assert.equal(engine.handle('RESPONSE_ENDED', 900).expression, 'SEARCH');
});

test('face events do not interrupt a conversation already in progress', () => {
  const engine = new ReactionEngine();
  engine.handle('VOICE_INPUT_STARTED', 0);
  engine.handle('UTTERANCE_ENDED', 200);
  assert.equal(engine.handle('FACE_FOUND', 250).expression, 'THINK');
  assert.equal(engine.handle('FACE_LOST', 300).expression, 'THINK');
  assert.equal(engine.handle('RESPONSE_ENDED', 900).expression, 'SEARCH');
});

test('sleep is ignored during interaction and wakes naturally from sleep', () => {
  const engine = new ReactionEngine();
  engine.handle('VOICE_INPUT_STARTED', 0);
  assert.equal(engine.handle('IDLE_TIMEOUT', 20_000).expression, 'LISTENING');
  engine.handle('RESPONSE_ENDED', 20_100);
  assert.equal(engine.handle('IDLE_TIMEOUT', 80_000).expression, 'SLEEP');
  assert.equal(engine.handle('WAKE', 80_100).effect, 'SLEEP_WAKE');
  assert.equal(engine.handle('WAKE', 80_100).expression, 'HAPPY');
});
