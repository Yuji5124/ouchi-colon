import assert from 'node:assert/strict';
import test from 'node:test';
import { canStartConversation, fallbackReplyVoice, INITIAL_REPLY_VOICE_MODE } from '../src/speech/reply-voice-policy.ts';

test('TOHOKU Happy is preferred but blocks conversation until model and audio are ready', () => {
  assert.equal(INITIAL_REPLY_VOICE_MODE, 'tohoku');
  assert.equal(canStartConversation('tohoku', false, false), false);
  assert.equal(canStartConversation('tohoku', true, false), false);
  assert.equal(canStartConversation('tohoku', true, true), true);
});

test('iOS TTS remains available as an explicit fallback when TOHOKU is unprepared', () => {
  assert.equal(fallbackReplyVoice(), 'ios');
  assert.equal(canStartConversation('ios', false, false), true);
});
