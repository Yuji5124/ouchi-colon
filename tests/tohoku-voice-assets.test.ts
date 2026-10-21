import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const asset = (name: string) => new URL(`../public/openjtalk/${name}`, import.meta.url);

test('bundles the verified Happy model and its CC BY 4.0 attribution', async () => {
  const model = await readFile(asset('tohoku-f01-happy.htsvoice'));
  assert.equal(model.byteLength, 1_636_831);
  assert.equal(createHash('sha256').update(model).digest('hex'), '6bf9559a0757c5250165de40dda034a7e95504f3a3ce4abce58532cee1040cc0');
  const attribution = await readFile(asset('licenses/TOHOKU-VOICE-COPYRIGHT.txt'), 'utf8');
  assert.match(attribution, /Creative Commons Attribution 4\.0/i);
  assert.match(attribution, /Tohoku University/);
});

test('ships the lazy browser Worker runtime and compressed dictionary without NodeFS configuration', async () => {
  const wasmStats = await stat(asset('open_jtalk.wasm'));
  const module = await readFile(asset('open_jtalk.mjs'), 'utf8');
  const worker = await readFile(asset('worker.js'), 'utf8');
  const dictionary = await stat(asset('open_jtalk_dic_utf_8-1.11.bin'));
  assert.ok(wasmStats.size > 400_000 && wasmStats.size < 500_000);
  assert.ok(dictionary.size > 23_000_000 && dictionary.size < 24_000_000);
  assert.doesNotMatch(module, /NODERAWFS|nodefs\.js/);
  assert.match(worker, /createOpenJTalk/);
  assert.match(worker, /DecompressionStream\('gzip'\)/);
  assert.match(worker, /oj_synthesize/);
  assert.match(worker, /message\?\.type === 'init'/, 'the engine starts only after an explicit user message creates and starts the Worker');
});
