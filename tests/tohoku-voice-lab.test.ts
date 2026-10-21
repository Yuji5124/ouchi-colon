import assert from 'node:assert/strict';
import test from 'node:test';
import { TohokuVoiceLab, type TohokuLabEvent, type TohokuWorkerPort } from '../src/speech/tohoku-voice-lab.ts';

class FakeWorker implements TohokuWorkerPort {
  onmessage: ((event: MessageEvent<TohokuLabEvent>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  messages: unknown[] = [];
  terminated = false;
  postMessage(message: unknown): void { this.messages.push(message); }
  terminate(): void { this.terminated = true; }
  emit(data: TohokuLabEvent): void { this.onmessage?.({ data } as MessageEvent<TohokuLabEvent>); }
}

function createLab() {
  const workers: FakeWorker[] = [];
  const lab = new TohokuVoiceLab(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  return { lab, workers };
}

async function startReadyLab(lab: TohokuVoiceLab, workers: FakeWorker[]): Promise<void> {
  const initialized = lab.initialize();
  workers[0]?.emit({ type: 'ready', initializationMs: 1234 });
  await initialized;
}

test('initializes the optional worker only on explicit action and reports measurements', async () => {
  const { lab, workers } = createLab();
  assert.equal(workers.length, 0);
  const initialized = lab.initialize();
  assert.equal(workers.length, 1);
  assert.deepEqual(workers[0]?.messages, [{ type: 'init' }]);
  workers[0]!.emit({ type: 'ready', initializationMs: 246 });
  await initialized;
  assert.equal(lab.state, 'ready');
  assert.equal(lab.initializationMs, 246);
});

test('passes a dynamic Japanese text to the worker and retains only in-memory WAV results', async () => {
  const { lab, workers } = createLab();
  await startReadyLab(lab, workers);
  const generated = lab.generate('こんにちは！', 'conversation');
  const worker = workers[0]!;
  const request = worker.messages.at(-1) as { type: string; text: string; requestId: number };
  assert.equal(request.type, 'synthesize');
  assert.equal(request.text, 'こんにちは！');
  assert.equal(request.purpose, 'conversation');
  const wav = new ArrayBuffer(4);
  worker.emit({ type: 'generated', requestId: request.requestId, generationMs: 42, byteLength: 4, wav });
  assert.equal((await generated).wav, wav);
  assert.equal(lab.state, 'generated');
  assert.equal(lab.lastGenerationMs, 42);
});

test('surfaces dictionary download, model download, and WASM initialization failures', async (t) => {
  for (const message of ['辞書の取得に失敗しました。', '音声モデルの取得に失敗しました。', 'WASMを初期化できません。']) {
    await t.test(message, async () => {
      const { lab, workers } = createLab();
      const initialized = lab.initialize();
      workers[0]!.emit({ type: 'error', stage: 'initialize', message });
      await assert.rejects(initialized, new RegExp(message));
      assert.equal(lab.state, 'error');
      assert.equal(workers[0]!.terminated, true);
    });
  }
});

test('reports generation failure without starting or replacing the normal conversation TTS', async () => {
  const { lab, workers } = createLab();
  await startReadyLab(lab, workers);
  const generated = lab.generate('試す文');
  workers[0]!.emit({ type: 'error', stage: 'synthesize', message: 'generation failed' });
  await assert.rejects(generated, /generation failed/);
  assert.equal(lab.state, 'ready');
  assert.equal(workers[0]!.messages.filter((item) => (item as { type?: string }).type === 'synthesize').length, 1);
});

test('allows repeated generation requests after completion', async () => {
  const { lab, workers } = createLab();
  await startReadyLab(lab, workers);
  for (const text of ['こんにちは', 'もういちど']) {
    const generated = lab.generate(text);
    const worker = workers[0]!;
    const request = worker.messages.at(-1) as { requestId: number };
    worker.emit({ type: 'generated', requestId: request.requestId, generationMs: 10, byteLength: 8, wav: new ArrayBuffer(8) });
    await generated;
  }
  assert.equal(workers[0]!.messages.filter((item) => (item as { type?: string }).type === 'synthesize').length, 2);
});

test('rejects overlapping audio generation', async () => {
  const { lab, workers } = createLab();
  await startReadyLab(lab, workers);
  const first = lab.generate('最初');
  await assert.rejects(lab.generate('二つ目'), /生成中/);
  const request = workers[0]!.messages.at(-1) as { requestId: number };
  workers[0]!.emit({ type: 'generated', requestId: request.requestId, generationMs: 1, byteLength: 8, wav: new ArrayBuffer(8) });
  await first;
});

test('cancels an audition, stops the worker, and recovers through a fresh initialization', async () => {
  const { lab, workers } = createLab();
  await startReadyLab(lab, workers);
  const generated = lab.generate('キャンセルする');
  lab.stop();
  await assert.rejects(generated, /停止しました/);
  assert.equal(workers[0]!.terminated, true);
  assert.equal(lab.state, 'stopped');
  const nextInit = lab.initialize();
  assert.equal(workers.length, 2);
  workers[1]!.emit({ type: 'ready', initializationMs: 300 });
  await nextInit;
  assert.equal(lab.state, 'ready');
});

test('worker boot failure leaves the existing TTS route independent and retryable', async () => {
  const { lab, workers } = createLab();
  const initialized = lab.initialize();
  workers[0]!.onerror?.({ message: 'module load failed' } as ErrorEvent);
  await assert.rejects(initialized, /module load failed/);
  assert.equal(lab.state, 'error');
  const retry = lab.initialize();
  assert.equal(workers.length, 2);
  workers[1]!.emit({ type: 'ready', initializationMs: 99 });
  await retry;
  assert.equal(lab.state, 'ready');
});
