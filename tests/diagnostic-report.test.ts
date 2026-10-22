import assert from 'node:assert/strict';
import test from 'node:test';
import { createDiagnosticReport } from '../src/app/diagnostic-report.ts';

test('diagnostic report includes operational status and timing only', () => {
  const report = createDiagnosticReport({
    appVersion: '0.1.0', commit: 'abc1234', serviceWorker: 'ouchicolon-shell-v16',
    voiceEngine: 'TOHOKU Happy', tohokuModel: 'ready', microphone: 'OFF', camera: 'ON',
    lastGenerationMs: 138, lastPlaybackStartMs: 12, conversationTurns: 4, errorCode: 'none', fallbackCount: 1, microphoneResume: 'started',
    conversationEngine: 'natural', conversationTopic: 'things', conversationIntent: 'report', replyType: 'REACT',
    recentQuestionRate: 0.2, duplicateReplyCount: 0, conversationFallbackCount: 0,
  });
  assert.match(report, /TOHOKU Happy/);
  assert.match(report, /138 ms/);
  assert.match(report, /連続会話回数: 4/);
  assert.match(report, /マイク再開状態: started/);
  assert.match(report, /直近の質問率: 20%/);
  assert.match(report, /会話話題: things/);
  assert.doesNotMatch(report, /transcript|recognition text|会話全文|音声データ|映像/);
  assert.doesNotMatch(report, /電車|クモ|りんご|赤い/);
});

test('diagnostic report handles unavailable values and strips line breaks', () => {
  const report = createDiagnosticReport({
    appVersion: '0.1.0\nprivate', commit: 'local', serviceWorker: 'unknown', voiceEngine: 'iOS',
    tohokuModel: 'not loaded', microphone: 'OFF', camera: 'OFF', lastGenerationMs: null,
    lastPlaybackStartMs: Number.NaN, conversationTurns: 0, errorCode: '', fallbackCount: 0, microphoneResume: 'blocked:session-changed\nunsafe',
    conversationEngine: 'natural', conversationTopic: 'unknown', conversationIntent: 'unknown', replyType: 'UNKNOWN',
    recentQuestionRate: null, duplicateReplyCount: 0, conversationFallbackCount: 0,
  });
  assert.match(report, /0.1.0 private/);
  assert.match(report, /UNKNOWN/);
  assert.match(report, /エラーコード: なし/);
  assert.match(report, /直近の質問率: UNKNOWN/);
});
