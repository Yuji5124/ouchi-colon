import assert from 'node:assert/strict';
import test from 'node:test';
import { TurnLatencySegments } from '../src/app/turn-latency.ts';

test('sums only ordered intervals from the same current turn and reports its slowest part', () => {
  const turn = new TurnLatencySegments();
  turn.record('recognition', 10, 110);
  turn.record('reply', 110, 120);
  turn.record('synthesis', 120, 180);
  turn.record('playback-start', 180, 193);
  assert.deepEqual(turn.summarize(['recognition', 'reply', 'synthesis', 'playback-start']), {
    measurableTotalMs: 183,
    complete: true,
    missing: [],
    slowest: { name: 'recognition', milliseconds: 100 },
  });
});

test('keeps totals partial and explains absent or unordered event marks', () => {
  const turn = new TurnLatencySegments();
  turn.record('reply', 20, 30);
  turn.record('speech-end', 40, 39);
  turn.markUnavailable('speech-end', 'Safari onspeechend event was not received');
  const result = turn.summarize(['speech-end', 'reply', 'playback-start']);
  assert.equal(result.measurableTotalMs, 10);
  assert.equal(result.complete, false);
  assert.deepEqual(result.missing, ['speech-end (Safari onspeechend event was not received)', 'playback-start']);
});
