/* Drives Sync service worker: caches the app shell so the page opens offline and installs
   as a PWA. API calls (Google, GitHub) are never intercepted. Bump VERSION on every release. */
const VERSION = 'drives-sync-v1.0.0';
const SHELL = [
  './', './index.html', './app.js', './core.js', './drives-sync.css', './manifest.webmanifest',
  './assets/icon.svg', './assets/icon-192.png', './assets/icon-512.png', './assets/icon-maskable-512.png', './assets/apple-touch-icon.png',
  '../assets/tokens.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.all(SHELL.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone()).catch(() => null);
      return res;
    }).catch(() => null);
    if (cached) { network.catch(() => null); return cached; }
    const res = await network;
    return res || new Response('오프라인 상태이며 캐시된 사본이 없습니다.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});
