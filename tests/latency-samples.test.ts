import assert from 'node:assert/strict';
import test from 'node:test';
import { LatencySamples } from '../src/app/latency-samples.ts';

test('calculates median and p95 from bounded, in-memory timing values', () => {
  const samples = new LatencySamples(4);
  [1, 2, 3, 4, 5].forEach((value) => samples.record('render', value));
  samples.record('render', Number.NaN);
  assert.deepEqual(samples.summary('render'), { count: 4, last: 5, median: 3.5, p95: 5 });
  assert.deepEqual(samples.summary('missing'), { count: 0, last: null, median: null, p95: null });
  samples.clear();
  assert.equal(samples.summary('render').count, 0);
});

test('records only ordered finite timing intervals and preserves UNKNOWN when a mark is absent', () => {
  const samples = new LatencySamples();
  assert.equal(samples.recordBetween('stage', 10, 35), true);
  assert.equal(samples.recordBetween('stage', 40, 39), false);
  assert.equal(samples.recordBetween('stage', null, 45), false);
  assert.equal(samples.recordBetween('stage', Number.NaN, 45), false);
  assert.deepEqual(samples.summary('stage'), { count: 1, last: 25, median: 25, p95: 25 });
  assert.equal(samples.summary('unavailable').median, null);
});
