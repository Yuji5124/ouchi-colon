import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const origin = 'https://ouchicolon.example';

test('service worker precaches its shell, caches PNGs, and serves them offline', async () => {
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
    async keys() { return ['ouchicolon-shell-v1']; },
    async delete() { return true; },
    async match(request: string | { url: string }) { return entries.get(keyOf(request))?.clone(); },
  };
  let offline = false;
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

  const navigation = { method: 'GET', mode: 'navigate', url: `${origin}/ouchi-colon/` };
  let offlinePage!: Promise<Response>;
  listeners.get('fetch')!({ request: navigation, respondWith(promise: Promise<Response>) { offlinePage = promise; } });
  assert.match(await offlinePage.then((response) => response.text()), /^shell:/);
});
