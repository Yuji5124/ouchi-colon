import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const origin = 'https://ouchicolon.example';

test('firmware manifest and binaries bypass offline caches for verified online writing', async () => {
  const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  const listeners = new Map<string, (event: any) => void>();
  runInNewContext(source, {
    self: { location: { origin }, addEventListener(name: string, handler: (event: any) => void) { listeners.set(name, handler); } },
    URL,
    caches: { match() { throw new Error('firmware must not read stale cache'); } },
  });
  for (const path of ['manifest.json', 'colon-motor-1.1.0/firmware.bin']) {
    let intercepted = false;
    listeners.get('fetch')!({ request: { method: 'GET', url: `${origin}/ouchi-colon/firmware/${path}` }, respondWith() { intercepted = true; } });
    assert.equal(intercepted, false, 'browser handles the writer no-store request directly');
  }
});

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
  assert.ok(await caches.match(`${origin}/ouchi-colon/icons/ouchicolon-192.png`), 'PWA icon is included in the app shell');

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

  offline = false;
  const tohokuDictionaryRequest = {
    method: 'GET',
    mode: 'cors',
    url: `${origin}/ouchi-colon/openjtalk/open_jtalk_dic_utf_8-1.11.bin`,
  };
  let tohokuDictionaryResponse!: Promise<Response>;
  listeners.get('fetch')!({ request: tohokuDictionaryRequest, respondWith(promise: Promise<Response>) { tohokuDictionaryResponse = promise; } });
  assert.match(await tohokuDictionaryResponse.then((response) => response.text()), /^network:/);
  assert.ok(await caches.match(tohokuDictionaryRequest), 'the large Open JTalk dictionary is cached only after its first lazy fetch');
  offline = true;
  let offlineTohokuDictionary!: Promise<Response>;
  listeners.get('fetch')!({ request: tohokuDictionaryRequest, respondWith(promise: Promise<Response>) { offlineTohokuDictionary = promise; } });
  assert.match(await offlineTohokuDictionary.then((response) => response.text()), /^network:/);
  assert.equal(networkRequests, 5, 'the fetched Open JTalk dictionary is served offline');

  offline = false;
  const tohokuWasmRequest = {
    method: 'GET',
    mode: 'cors',
    url: `${origin}/ouchi-colon/openjtalk/open_jtalk.wasm`,
  };
  let tohokuWasmResponse!: Promise<Response>;
  listeners.get('fetch')!({ request: tohokuWasmRequest, respondWith(promise: Promise<Response>) { tohokuWasmResponse = promise; } });
  await tohokuWasmResponse;
  assert.ok(await caches.match(tohokuWasmRequest), 'the lazily loaded Open JTalk WASM is cached');
  offline = true;
  let offlineTohokuWasm!: Promise<Response>;
  listeners.get('fetch')!({ request: tohokuWasmRequest, respondWith(promise: Promise<Response>) { offlineTohokuWasm = promise; } });
  assert.match(await offlineTohokuWasm.then((response) => response.text()), /^network:/);
  assert.equal(networkRequests, 6, 'cached Open JTalk WASM is served offline');

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

test('service worker upgrades the shell while preserving cached face and model resources', async () => {
  const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  const cachesByName = new Map<string, Map<string, Response>>();
  const keyOf = (request: string | { url: string }) => new URL(typeof request === 'string' ? request : request.url, origin).href;
  const open = async (name: string) => {
    let entries = cachesByName.get(name);
    if (!entries) { entries = new Map(); cachesByName.set(name, entries); }
    return {
      async keys() { return [...entries!.keys()].map((url) => new Request(url)); },
      async match(request: string | { url: string }) { return entries!.get(keyOf(request))?.clone(); },
      async put(request: string | { url: string }, response: Response) { entries!.set(keyOf(request), response.clone()); },
      async addAll(paths: string[]) { for (const path of paths) entries!.set(keyOf(path), new Response(`new:${path}`)); },
    };
  };
  const old = await open('ouchicolon-shell-v10');
  await old.put(`${origin}/ouchi-colon/`, new Response('old shell'));
  await old.put(`${origin}/ouchi-colon/assets/index-old123.js`, new Response('old app js'));
  await old.put(`${origin}/ouchi-colon/assets/face/eyes/open.png`, new Response('preserved face'));
  await old.put('https://storage.googleapis.com/mediapipe-models/face_detector/model.tflite', new Response('preserved model'));
  await open('unrelated-cache');

  const listeners = new Map<string, (event: any) => void>();
  const caches = {
    async open(name: string) { return open(name); },
    async keys() { return [...cachesByName.keys()]; },
    async delete(name: string) { return cachesByName.delete(name); },
    async match(request: string | { url: string }) {
      for (const entries of cachesByName.values()) {
        const response = entries.get(keyOf(request));
        if (response) return response.clone();
      }
      return undefined;
    },
  };
  const self = {
    location: { origin },
    addEventListener(name: string, listener: (event: any) => void) { listeners.set(name, listener); },
    skipWaiting() {},
    clients: { claim() {} },
  };
  runInNewContext(source, { self, caches, URL, Request, Response });

  const current = await open('ouchicolon-shell-v33');
  await current.addAll(['/ouchi-colon/', '/ouchi-colon/manifest.webmanifest', '/ouchi-colon/icons/ouchicolon-192.png', '/ouchi-colon/icons/ouchicolon-512.png']);
  let activation!: Promise<void>;
  listeners.get('activate')!({ waitUntil(promise: Promise<void>) { activation = promise; } });
  await activation;

  const shell = await caches.match(`${origin}/ouchi-colon/`);
  assert.equal(await shell?.text(), 'new:/ouchi-colon/');
  assert.equal(await caches.match(`${origin}/ouchi-colon/assets/index-old123.js`), undefined, 'old entry bundle is removed');
  assert.equal(await (await caches.match(`${origin}/ouchi-colon/assets/face/eyes/open.png`))?.text(), 'preserved face');
  assert.equal(await (await caches.match('https://storage.googleapis.com/mediapipe-models/face_detector/model.tflite'))?.text(), 'preserved model');
  assert.ok(cachesByName.has('unrelated-cache'), 'unrelated origin cache is untouched');
  assert.ok(!cachesByName.has('ouchicolon-shell-v10'), 'only this app old cache is migrated and removed');
  let workerVersion: unknown;
  listeners.get('message')!({
    data: { type: 'GET_CACHE_VERSION' },
    ports: [{ postMessage(value: unknown) { workerVersion = value; } }],
  });
  assert.equal((workerVersion as { cache?: string } | undefined)?.cache, 'ouchicolon-shell-v33');
});

test('service worker v33 replaces the app shell while retaining lazy TOHOKU assets', async () => {
  const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.match(source, /ouchicolon-shell-v33/);
  assert.match(source, /cache\.addAll\(SHELL\)/);
  assert.match(source, /if \(await destination\.match\(request\)\) continue/);
  assert.match(source, /cache\.put\(request, copy\)/);
});


test('cached native audio serves Safari byte ranges offline with correct headers and bytes', async () => {
  const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  const listeners = new Map<string, (event: any) => void>();
  const clip = new Uint8Array([10, 11, 12, 13, 14, 15]);
  const cache = {
    async match() { return new Response(clip, { headers: { 'Content-Type': 'audio/wav' } }); },
  };
  const self = { location: { origin }, addEventListener(name: string, listener: (event: any) => void) { listeners.set(name, listener); } };
  runInNewContext(source, { self, URL, Response, Headers, caches: { async open() { return cache; } },
    fetch() { throw new Error('cached clip must play offline'); } });
  const requestRange = async (range: string) => {
    let result!: Promise<Response>;
    listeners.get('fetch')!({ request: new Request(origin + '/ouchi-colon/voice/haruka-nana/wav/0003.wav', { headers: { Range: range } }),
      respondWith(promise: Promise<Response>) { result = promise; } });
    return result;
  };
  const first = await requestRange('bytes=0-1');
  assert.equal(first.status, 206);
  assert.equal(first.headers.get('Content-Range'), 'bytes 0-1/6');
  assert.equal(first.headers.get('Content-Length'), '2');
  assert.deepEqual([...new Uint8Array(await first.arrayBuffer())], [10, 11]);
  const tail = await requestRange('bytes=3-');
  assert.deepEqual([...new Uint8Array(await tail.arrayBuffer())], [13, 14, 15]);
  const suffix = await requestRange('bytes=-2');
  assert.deepEqual([...new Uint8Array(await suffix.arrayBuffer())], [14, 15]);
  const invalid = await requestRange('bytes=9-');
  assert.equal(invalid.status, 416);
  assert.equal(invalid.headers.get('Content-Range'), 'bytes */6');
});

test('network partial audio responses pass through without poisoning the complete clip cache', async () => {
  const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  const listeners = new Map<string, (event: any) => void>();
  let puts = 0;
  const cache = { async match() { return undefined; }, async put() { puts++; } };
  const self = { location: { origin }, addEventListener(name: string, listener: (event: any) => void) { listeners.set(name, listener); } };
  runInNewContext(source, { self, URL, Response, Headers, caches: { async open() { return cache; } },
    async fetch() { return new Response(new Uint8Array([1, 2]), { status: 206, headers: { 'Content-Range': 'bytes 0-1/6' } }); } });
  let result!: Promise<Response>;
  listeners.get('fetch')!({ request: new Request(origin + '/ouchi-colon/voice/haruka-nana/wav/0003.wav', { headers: { Range: 'bytes=0-1' } }),
    respondWith(promise: Promise<Response>) { result = promise; } });
  assert.equal((await result).status, 206);
  assert.equal(puts, 0);
});
