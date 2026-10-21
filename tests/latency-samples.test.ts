import assert from 'node:assert/strict';
import test from 'node:test';
import { LatencySamples } from '../src/app/latency-samples.ts';

test('calculates median and p95 from bounded, in-memory timing values', () => {
  const samples = new LatencySamples(4);
  [1, 2, 3, 4, 5].forEach((value) => samples.record('render', value));
  samples.record('render', Number.NaN);
  assert.deepEqual(samples.summary('render'), { count: 4, median: 3.5, p95: 5 });
  assert.deepEqual(samples.summary('missing'), { count: 0, median: null, p95: null });
  samples.clear();
  assert.equal(samples.summary('render').count, 0);
});
