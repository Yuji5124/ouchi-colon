import assert from 'node:assert/strict';
import test from 'node:test';
import { canRecoverFromEmptyRecognitionResult, recognitionErrorAction, recognitionResumeBlockReason, RESUME_BUSY_RETRY_DELAYS_MS, shouldResumeAfterReply } from '../src/speech/recognition-resume.ts';
import { TurnCompletionGate } from '../src/speech/turn-completion.ts';

test('a successful TOHOKU reply completes once and requests one microphone resume', () => {
  const gate = new TurnCompletionGate();
  let finishCalls = 0;
  let resumeRequests = 0;
  const complete = () => gate.complete(5, 5, () => {
    finishCalls += 1;
    resumeRequests += 1;
  });
  assert.equal(complete(), true);
  assert.equal(complete(), false);
  assert.equal(finishCalls, 1);
  assert.equal(resumeRequests, 1);
});

test('duplicate completion and a stale voice generation cannot resume recognition', () => {
  const gate = new TurnCompletionGate();
  let finishCalls = 0;
  assert.equal(gate.complete(4, 5, () => { finishCalls += 1; }), false);
  assert.equal(gate.complete(5, 5, () => { finishCalls += 1; }), true);
  assert.equal(gate.complete(5, 6, () => { finishCalls += 1; }), false);
  assert.equal(finishCalls, 1);
  assert.equal(recognitionResumeBlockReason({
    isCurrentReply: false, pageVisible: true, sessionEnabled: true, sameSession: true,
    voiceReplyFinished: true, recognitionActive: false, speechOutputBusy: false,
  }), 'stale-reply');
});

test('resume is blocked after guardian stop, hidden page, or active speech, and retries are bounded', () => {
  const common = {
    isCurrentReply: true, pageVisible: true, sessionEnabled: true, sameSession: true,
    voiceReplyFinished: true, recognitionActive: false, speechOutputBusy: false,
  };
  assert.equal(recognitionResumeBlockReason({ ...common, sessionEnabled: false }), 'guardian-stopped');
  assert.equal(recognitionResumeBlockReason({ ...common, pageVisible: false }), 'page-hidden');
  assert.equal(recognitionResumeBlockReason({ ...common, speechOutputBusy: true }), 'speech-output-busy');
  assert.deepEqual(RESUME_BUSY_RETRY_DELAYS_MS, [150, 300, 600]);
});

test('brief empty recognition results recover, then stop after the configured consecutive limit', () => {
  assert.equal(canRecoverFromEmptyRecognitionResult(1, 3), true);
  assert.equal(canRecoverFromEmptyRecognitionResult(3, 3), true);
  assert.equal(canRecoverFromEmptyRecognitionResult(4, 3), false);
  assert.equal(canRecoverFromEmptyRecognitionResult(0, 3), false);
});

test('recognition errors only retry silence and one transient network failure', () => {
  assert.equal(recognitionErrorAction('no-speech', 0), 'recover-quietly');
  assert.equal(recognitionErrorAction('network', 0), 'retry-network-once');
  assert.equal(recognitionErrorAction('network', 1), 'stop');
  assert.equal(recognitionErrorAction('not-allowed', 0), 'stop');
  assert.equal(recognitionErrorAction('service-not-allowed', 0), 'stop');
  assert.equal(recognitionErrorAction('audio-capture', 0), 'stop');
});

test('only finished voice replies resume the guardian-enabled microphone', () => {
  assert.equal(shouldResumeAfterReply('finished', true, true), true);
  assert.equal(shouldResumeAfterReply('text-only', true, true), true);
  assert.equal(shouldResumeAfterReply('stopped', true, true), false);
  assert.equal(shouldResumeAfterReply('error', true, true), false);
  assert.equal(shouldResumeAfterReply('finished', false, true), false);
  assert.equal(shouldResumeAfterReply('finished', true, false), false);
});

test('a failed TOHOKU turn can finish once through the iOS fallback', () => {
  const gate = new TurnCompletionGate();
  let engines: string[] = [];
  const fallbackResult = { reason: 'finished' as const };
  engines.push('TOHOKU:error');
  engines.push(`iOS:${fallbackResult.reason}`);
  let resumed = 0;
  assert.equal(gate.complete(8, 8, () => { resumed += 1; }), true);
  assert.equal(gate.complete(8, 8, () => { resumed += 1; }), false);
  assert.deepEqual(engines, ['TOHOKU:error', 'iOS:finished']);
  assert.equal(resumed, 1);
});
