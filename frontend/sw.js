/* NYSC Companion service worker.
   It lets the site be installed and keeps a saved copy of pages the person has opened,
   so they still open without data.

   Served from the site root (/sw.js) so it can cover every page.

   What it does:
     pages (/home, /checklist ...)   network first (saved copy after 6 s or when offline), /offline as the last resort
     /frontend files (css, js, icons)  network first too, so an update never mixes new pages with old code
     /uploads pictures                 saved copy first
     /api GET answers                  network first, saved copy if there is no network
     anything that saves (POST, PUT, DELETE)  never touched: it simply fails offline, and the page says so

   Bump VERSION when you change this file. The saved API answers are wiped on log out (see api.js). */
const VERSION = 'v1';
const SHELL = 'nysc-shell-' + VERSION;
const PAGES = 'nysc-pages-' + VERSION;
const API = 'nysc-api-v1';                 // the name api.js deletes on log out: keep them equal
const IMAGES = 'nysc-img-' + VERSION;
const KEEP = [SHELL, PAGES, API, IMAGES];

const PRECACHE = [
  '/offline',
  '/frontend/css/base.css', '/frontend/css/app.css', '/frontend/css/extra.css',
  '/frontend/js/api.js', '/frontend/js/nav.js', '/frontend/js/ui.js', '/frontend/js/pwa.js',
  '/frontend/nysc-logo.png', '/frontend/icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.filter((n) => n.startsWith('nysc-') && !KEEP.includes(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()));
});

// Ask the network first. If it fails (or, when timeoutMs is given, is too slow) use the saved copy.
async function networkFirst(request, cacheName, fallback, timeoutMs) {
  const cache = await caches.open(cacheName);
  const saved = await cache.match(request);
  const net = fetch(request).then((res) => { if (res.ok) cache.put(request, res.clone()); return res; });
  net.catch(() => {});                                         // a late failure after we answered is fine
  try {
    if (timeoutMs && saved) {
      return await Promise.race([net, new Promise((resolve) => setTimeout(() => resolve(saved), timeoutMs))]);
    }
    return await net;
  } catch (err) {
    if (saved) return saved;
    if (fallback) return fallback();
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const saved = await cache.match(request);
  if (saved) return saved;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;                       // saves are never intercepted
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;                 // maps, fonts and other sites go straight out

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, PAGES, async () => (await caches.match('/offline')) || Response.error(), 6000));
  } else if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API));
  } else if (url.pathname.startsWith('/frontend/')) {
    event.respondWith(networkFirst(request, SHELL, null, 6000));
  } else if (url.pathname.startsWith('/uploads/')) {
    event.respondWith(cacheFirst(request, IMAGES));
  }
});
