const CACHE = 'ouchicolon-shell-v17';
const ROOT = '/ouchi-colon/';
const SHELL = [ROOT, `${ROOT}manifest.webmanifest`, `${ROOT}icons/ouchicolon-192.png`, `${ROOT}icons/ouchicolon-512.png`];
const MODEL_ORIGINS = new Set(['https://cdn.jsdelivr.net', 'https://storage.googleapis.com']);
const CACHE_PREFIX = 'ouchicolon-shell-';

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

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);
  const sameOrigin = requestUrl.origin === self.location.origin;
  if (request.method !== 'GET' || (!sameOrigin && !MODEL_ORIGINS.has(requestUrl.origin))) return;
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (!response.ok) return response;
      const copy = response.clone();
      return caches.open(CACHE).then((cache) => cache.put(request, copy).then(() => response).catch(() => response));
    }).catch(() => request.mode === 'navigate' ? caches.match(ROOT) : Response.error())),
  );
});
