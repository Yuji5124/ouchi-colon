const CACHE = 'ouchicolon-shell-v3';
const ROOT = '/ouchi-colon/';
const SHELL = [ROOT, `${ROOT}manifest.webmanifest`];
const MODEL_ORIGINS = new Set(['https://cdn.jsdelivr.net', 'https://storage.googleapis.com']);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
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
