import assert from 'node:assert/strict';
import test from 'node:test';
import { canStartConversation, conversationLaunchSettings, fallbackReplyVoice, INITIAL_REPLY_VOICE_MODE } from '../src/speech/reply-voice-policy.ts';

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

test('normal launch keeps TOHOKU without opening microphone controls', () => {
  assert.deepEqual(conversationLaunchSettings(''), {
    simpleConversationMode: false, debug: false, voiceMode: 'tohoku',
  });
});

test('previous conversation links including v27 use the TOHOKU controls', () => {
  for (const search of ['?talk=1', '?talk=1&v=27', '?talk=1&v=28']) {
    assert.deepEqual(conversationLaunchSettings(search), {
      simpleConversationMode: false, debug: true, voiceMode: 'tohoku',
    });
  }
});

test('debug link keeps TOHOKU as the preferred voice', () => {
  assert.deepEqual(conversationLaunchSettings('?debug=1'), {
    simpleConversationMode: false, debug: true, voiceMode: 'tohoku',
  });
});

test('Haruka conversation requires explicit opt-in and does not replace the default', () => {
  assert.deepEqual(conversationLaunchSettings('?talk=haruka'), {
    simpleConversationMode: true, debug: true, voiceMode: 'haruka',
  });
  assert.equal(conversationLaunchSettings('?talk=unknown').voiceMode, 'tohoku');
});
