import assert from 'node:assert/strict';
import test from 'node:test';
import {
  runTohokuBenchmark,
  summarizeTohokuSamples,
  TOHOKU_BENCHMARK_TEXTS,
} from '../src/speech/tohoku-benchmark.ts';

test('runs 20 distinct dynamic Japanese prompts sequentially and reports each result', async () => {
  const received: string[] = [];
  const progress: number[] = [];
  let active = 0;
  let maxActive = 0;
  const result = await runTohokuBenchmark(async (text) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    received.push(text);
    await Promise.resolve();
    active -= 1;
    return received.length * 10;
  }, ({ generationMs }) => progress.push(generationMs));

  assert.equal(result.cancelled, false);
  assert.equal(result.samples.length, 20);
  assert.equal(received.length, 20);
  assert.equal(new Set(received).size, 20);
  assert.deepEqual(received, TOHOKU_BENCHMARK_TEXTS);
  assert.deepEqual(progress, result.samples);
  assert.equal(maxActive, 1);
});

test('cancels between generations without issuing more work', async () => {
  const received: string[] = [];
  const result = await runTohokuBenchmark(async (text) => {
    received.push(text);
    return 15;
  }, () => undefined, () => received.length >= 3);
  assert.equal(result.cancelled, true);
  assert.equal(result.samples.length, 3);
  assert.equal(received.length, 3);
});

test('stops at the failed generation and does not retry it', async () => {
  const received: string[] = [];
  await assert.rejects(runTohokuBenchmark(async (text) => {
    received.push(text);
    if (received.length === 4) throw new Error('WASM error');
    return 40;
  }, () => undefined), (error: unknown) => {
    assert.equal((error as { iteration: number }).iteration, 4);
    assert.match((error as Error).message, /4\/20/);
    return true;
  });
  assert.equal(received.length, 4);
});

test('calculates median, nearest-rank p95, and maximum for the 20-run report', () => {
  assert.deepEqual(summarizeTohokuSamples(Array.from({ length: 20 }, (_, index) => index + 1)), {
    count: 20,
    median: 10.5,
    p95: 19,
    max: 20,
  });
  assert.deepEqual(summarizeTohokuSamples([]), { count: 0, median: null, p95: null, max: null });
});
