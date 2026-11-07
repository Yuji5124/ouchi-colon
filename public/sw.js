const CACHE = 'ouchicolon-shell-v33';
const ROOT = '/ouchi-colon/';
const SHELL = [ROOT, `${ROOT}manifest.webmanifest`, `${ROOT}icons/ouchicolon-192.png`, `${ROOT}icons/ouchicolon-512.png`];
const MODEL_ORIGINS = new Set(['https://cdn.jsdelivr.net', 'https://storage.googleapis.com']);
const CACHE_PREFIX = 'ouchicolon-shell-';
const VOICE_CACHE = 'ouchicolon-haruka-voice-v1';
const MAX_CACHED_VOICE_CLIPS = 50;

function isReplaceableShellEntry(request) {
  const url = new URL(request.url);
  return url.pathname === ROOT
    || url.pathname === `${ROOT}manifest.webmanifest`
    || new RegExp(`^${ROOT}assets/index-[^/]+\\.(js|css)$`).test(url.pathname);
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const destination = await caches.open(CACHE);
      for (const key of keys.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE)) {
        const oldCache = await caches.open(key);
        for (const request of await oldCache.keys()) {
          if (isReplaceableShellEntry(request)) continue;
          if (await destination.match(request)) continue;
          const response = await oldCache.match(request);
          if (response) await destination.put(request, response);
        }
        await caches.delete(key);
      }
    })(),
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_CACHE_VERSION') {
    event.ports?.[0]?.postMessage({ cache: CACHE });
  }
});

async function cachedVoiceRange(response, range) {
  if (!range || response.status !== 200) return response;
  const body = await response.arrayBuffer();
  const size = body.byteLength;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  const invalid = () => new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
  if (!match || (!match[1] && !match[2]) || size === 0) return invalid();
  let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  let end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if ((!match[1] && Number(match[2]) <= 0) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) return invalid();
  const headers = new Headers(response.headers);
  headers.set('Content-Range', 'bytes ' + start + '-' + end + '/' + size);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  headers.delete('Content-Encoding');
  return new Response(body.slice(start, end + 1), { status: 206, headers });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);
  const sameOrigin = requestUrl.origin === self.location.origin;
  if (request.method !== 'GET' || (!sameOrigin && !MODEL_ORIGINS.has(requestUrl.origin))) return;
  // Firmware is fetched and hash-verified online by the writer, never cache-first.
  if (sameOrigin && requestUrl.pathname.startsWith(`${ROOT}firmware/`)) return;
  if (sameOrigin && requestUrl.pathname.startsWith(`${ROOT}voice/haruka-nana/wav/`)) {
    event.respondWith((async () => {
      const cache = await caches.open(VOICE_CACHE);
      const cached = await cache.match(request);
      if (cached) return cachedVoiceRange(cached, request.headers?.get('range'));
      const response = await fetch(request);
      // A partial native media response must never replace the full cached clip.
      if (!response.ok || response.status !== 200) return response;
      await cache.put(request, response.clone()).catch(() => undefined);
      const keys = await cache.keys();
      for (const oldRequest of keys.slice(0, Math.max(0, keys.length - MAX_CACHED_VOICE_CLIPS))) {
        await cache.delete(oldRequest);
      }
      return response;
    })());
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (!response.ok) return response;
      const copy = response.clone();
      return caches.open(CACHE).then((cache) => cache.put(request, copy).then(() => response).catch(() => response));
    }).catch(() => request.mode === 'navigate' ? caches.match(ROOT) : Response.error())),
  );
});

