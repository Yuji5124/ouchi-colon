import { test } from 'node:test';
import assert from 'node:assert/strict';
import { motionForReply, ReplyMotionGate } from '../src/robot/reply-motion.ts';
import { EMPTY_CONVERSATION_CONTEXT, type ConversationResult } from '../src/conversation/conversation-engine.ts';
const reply = (quality = {}): ConversationResult => ({ text: 'やったね', topic: 'happy', context: EMPTY_CONVERSATION_CONTEXT, quality: { intent: 'report', replyType: 'REACT', questionRate: 0, duplicateReplyCount: 0, contextUsed: false, fallback: false, ...quality } });
test('motion respects safety, unknown, goodbye, refusal and neutral replies', () => {
  for (const result of [reply({ fallback: true }), reply({ intent: 'farewell' }), reply({ intent: 'unknown' }), reply({ intent: 'refusal' }), { ...reply(), topic: 'safety' as const }, reply({ category: 'safety' })]) assert.equal(motionForReply(result, 'JOY'), null);
  assert.equal(motionForReply(reply(), 'NORMAL'), null);
  assert.equal(motionForReply(reply(), 'JOY')?.left, 1);
});
test('only one current playback start may move; RC, OFF and cancelled replies do not', () => {
  const gate = new ReplyMotionGate(); gate.prepare(1, reply(), 'JOY'); assert.equal(gate.start(1), null);
  gate.mode = 'reply'; gate.prepare(2, reply(), 'JOY'); assert.equal(gate.start(1), null); assert.ok(gate.start(2)); assert.equal(gate.start(2), null);
  gate.prepare(3, reply(), 'JOY'); gate.cancel(); assert.equal(gate.start(3), null);
  gate.mode = 'rc'; gate.prepare(4, reply(), 'JOY'); assert.equal(gate.start(4), null);
});
