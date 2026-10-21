import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const origin = 'https://ouchicolon.example';

test('service worker caches app assets and approved face detector resources offline', async () => {
  const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  const entries = new Map<string, Response>();
  const keyOf = (request: string | { url: string }) => new URL(typeof request === 'string' ? request : request.url, origin).href;
  const cache = {
    async addAll(paths: string[]) {
      for (const path of paths) entries.set(keyOf(path), new Response(`shell:${path}`));
    },
    async put(request: string | { url: string }, response: Response) {
      entries.set(keyOf(request), response.clone());
    },
  };
  const caches = {
    async open() { return cache; },
    async keys() { return ['ouchicolon-shell-v2']; },
    async delete() { return true; },
    async match(request: string | { url: string }) { return entries.get(keyOf(request))?.clone(); },
  };
  let offline = false;
  let networkRequests = 0;
  const listeners = new Map<string, (event: any) => void>();
  const self = {
    location: { origin },
    addEventListener(name: string, listener: (event: any) => void) { listeners.set(name, listener); },
    skipWaiting() {},
    clients: { claim() {} },
  };
  runInNewContext(source, {
    self,
    caches,
    URL,
    Response,
    async fetch(request: { url: string }) {
      networkRequests += 1;
      if (offline) throw new TypeError('offline');
      return new Response(`network:${request.url}`);
    },
  });

  let installWork!: Promise<void>;
  listeners.get('install')!({ waitUntil(promise: Promise<void>) { installWork = promise; } });
  await installWork;
  assert.ok(await caches.match(`${origin}/ouchi-colon/`), 'app shell is cached during install');
  assert.ok(await caches.match(`${origin}/ouchi-colon/manifest.webmanifest`), 'manifest is cached during install');

  const pngRequest = { method: 'GET', mode: 'cors', url: `${origin}/ouchi-colon/assets/face/eyes/open.png` };
  let networkResponse!: Promise<Response>;
  listeners.get('fetch')!({ request: pngRequest, respondWith(promise: Promise<Response>) { networkResponse = promise; } });
  assert.match(await networkResponse.then((response) => response.text()), /^network:/);
  assert.ok(await caches.match(pngRequest), 'PNG response is stored after an online fetch');

  offline = true;
  let offlineResponse!: Promise<Response>;
  listeners.get('fetch')!({ request: pngRequest, respondWith(promise: Promise<Response>) { offlineResponse = promise; } });
  assert.match(await offlineResponse.then((response) => response.text()), /^network:/);
  assert.equal(networkRequests, 1, 'cached face assets are served without an offline network request');

  const modelRequest = {
    method: 'GET',
    mode: 'cors',
    url: 'https://storage.googleapis.com/mediapipe-models/face_detector/model.tflite',
  };
  offline = false;
  let modelResponse!: Promise<Response>;
  listeners.get('fetch')!({ request: modelRequest, respondWith(promise: Promise<Response>) { modelResponse = promise; } });
  assert.match(await modelResponse.then((response) => response.text()), /^network:/);
  assert.ok(await caches.match(modelRequest), 'the face detector model is cached after its first online load');

  offline = true;
  let offlineModel!: Promise<Response>;
  listeners.get('fetch')!({ request: modelRequest, respondWith(promise: Promise<Response>) { offlineModel = promise; } });
  assert.match(await offlineModel.then((response) => response.text()), /^network:/);
  assert.equal(networkRequests, 2, 'the cached face model is served while offline');

  const wasmRequest = {
    method: 'GET',
    mode: 'cors',
    url: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm/vision_wasm_internal.js',
  };
  offline = false;
  let wasmResponse!: Promise<Response>;
  listeners.get('fetch')!({ request: wasmRequest, respondWith(promise: Promise<Response>) { wasmResponse = promise; } });
  await wasmResponse;
  assert.ok(await caches.match(wasmRequest), 'the approved vision runtime is cached after its first online load');
  offline = true;
  let offlineWasm!: Promise<Response>;
  listeners.get('fetch')!({ request: wasmRequest, respondWith(promise: Promise<Response>) { offlineWasm = promise; } });
  assert.match(await offlineWasm.then((response) => response.text()), /^network:/);
  assert.equal(networkRequests, 3, 'the cached WASM loader is served while offline');

  const wasmBinaryRequest = {
    method: 'GET',
    mode: 'cors',
    url: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm/vision_wasm_internal.wasm',
  };
  offline = false;
  let wasmBinaryResponse!: Promise<Response>;
  listeners.get('fetch')!({ request: wasmBinaryRequest, respondWith(promise: Promise<Response>) { wasmBinaryResponse = promise; } });
  await wasmBinaryResponse;
  assert.ok(await caches.match(wasmBinaryRequest), 'WASM binary is cached after an online fetch');
  offline = true;
  let offlineWasmBinary!: Promise<Response>;
  listeners.get('fetch')!({ request: wasmBinaryRequest, respondWith(promise: Promise<Response>) { offlineWasmBinary = promise; } });
  assert.match(await offlineWasmBinary.then((response) => response.text()), /^network:/);
  assert.equal(networkRequests, 4, 'the cached WASM binary is served while offline');

  let unrelatedExternalIntercepted = false;
  listeners.get('fetch')!({
    request: { method: 'GET', mode: 'cors', url: 'https://example.com/unrelated.js' },
    respondWith() { unrelatedExternalIntercepted = true; },
  });
  assert.equal(unrelatedExternalIntercepted, false, 'other external requests are ignored');

  const navigation = { method: 'GET', mode: 'navigate', url: `${origin}/ouchi-colon/` };
  let offlinePage!: Promise<Response>;
  listeners.get('fetch')!({ request: navigation, respondWith(promise: Promise<Response>) { offlinePage = promise; } });
  assert.match(await offlinePage.then((response) => response.text()), /^shell:/);
});
