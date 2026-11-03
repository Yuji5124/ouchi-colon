import assert from 'node:assert/strict';
import test from 'node:test';
import { setAudioSessionType, type AudioSessionNavigator } from '../src/speech/audio-session.ts';

test('reply playback selects the media session and microphone input releases it', () => {
  const browser = { audioSession: { type: 'auto' } };
  assert.equal(setAudioSessionType('playback', browser), true);
  assert.equal(browser.audioSession.type, 'playback');
  assert.equal(setAudioSessionType('auto', browser), true);
  assert.equal(browser.audioSession.type, 'auto');
});
test('unsupported and rejected audio-session preferences do not break conversation', () => {
  assert.equal(setAudioSessionType('playback', {}), false);
  const browser: AudioSessionNavigator = { get audioSession() { throw new Error('unavailable'); } };
  assert.equal(setAudioSessionType('playback', browser), false);
  const readonly = { audioSession: { get type() { return 'auto'; }, set type(_value: string) { throw new Error('denied'); } } };
  assert.equal(setAudioSessionType('playback', readonly), false);
});
