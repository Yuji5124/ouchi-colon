import assert from 'node:assert/strict';
import test from 'node:test';
import { ResponseLatencyTrial } from '../src/app/response-latency-trial.ts';

test('keeps A and B outcomes separate and resets only the in-memory trial counters', () => {
  const trial = new ResponseLatencyTrial();
  trial.record('A', 'turns');
  trial.record('A', 'noResponse');
  trial.record('B', 'turns');
  trial.record('B', 'resumeSuccess');
  trial.record('B', 'misrecognized');
  assert.equal(trial.summary('A').noResponse, 1);
  assert.equal(trial.summary('A').turns, 1);
  assert.equal(trial.summary('B').turns, 1);
  assert.equal(trial.summary('B').resumeSuccess, 1);
  assert.equal(trial.summary('B').misrecognized, 1);
  trial.clear();
  assert.equal(trial.summary('B').turns, 0);
});
