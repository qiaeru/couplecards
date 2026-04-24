// SPDX-License-Identifier: MIT
// Auth-aware service worker:
//   * shell (HTML, CSS, JS, fonts, partials, locales) — cache-first
//   * /api/cards — stale-while-revalidate (allows offline viewing)
//   * all other /api/* — network only, never cached (auth-sensitive)

const VERSION = 'couplecards-v14';
const SHELL = [
  '/',
  '/index.html',
  '/login.html',
  '/admin.html',
  '/404.html',
  '/500.html',
  '/css/fonts.css',
  '/css/themes.css',
  '/css/style.css',
  '/css/cards.css',
  '/css/app.css',
  '/css/auth.css',
  '/css/admin.css',
  '/js/app.js',
  '/js/login.js',
  '/js/admin.js',
  '/js/config.js',
  '/js/core/api.js',
  '/js/core/auth.js',
  '/js/core/events.js',
  '/js/core/i18n.js',
  '/js/core/idb.js',
  '/js/core/router.js',
  '/js/core/sync.js',
  '/js/features/home/home.js',
  '/js/features/history/history.js',
  '/js/features/bans/bans.js',
  '/js/features/settings/settings.js',
  '/js/features/rules/rules.js',
  '/js/features/deck/draw.js',
  '/js/features/admin/users.js',
  '/js/features/admin/cards.js',
  '/js/features/admin/deck-sync.js',
  '/js/ui/emoji.js',
  '/js/ui/shell.js',
  '/js/ui/password-strength.js',
  '/js/ui/scroll-to-top.js',
  '/js/ui/sound.js',
  '/views/home.html',
  '/views/draw.html',
  '/views/history.html',
  '/views/bans.html',
  '/views/settings.html',
  '/views/rules.html',
  '/locales/en.json',
  '/locales/fr.json',
  '/fonts/InterVariable.woff2',
  '/fonts/literata/normal-latin.woff2',
  '/fonts/literata/normal-latin-ext.woff2',
  '/fonts/literata/italic-latin.woff2',
  '/fonts/literata/italic-latin-ext.woff2',
  '/icons/icon.svg',
  '/icons/icon-maskable.svg',
  '/icons/favicon.ico',
  '/icons/apple-touch-icon.png',
  '/icons/heart-gold.svg',
  '/icons/emoji/house.svg',
  '/icons/emoji/city.svg',
  '/icons/emoji/heart-ribbon.svg',
  '/icons/emoji/growing-heart.svg',
  '/icons/emoji/sparkling-heart.svg',
  '/icons/emoji/two-hearts.svg',
  '/icons/emoji/heart-arrow.svg',
  '/icons/emoji/red-heart.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL).catch(() => {});
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

function isAuthSensitive(pathname) {
  if (pathname === '/api/cards' || pathname.startsWith('/api/cards/')) return false;
  return pathname.startsWith('/api/');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isAuthSensitive(url.pathname)) {
    // Never cache auth, sync, state, user endpoints.
    return;
  }

  if (url.pathname === '/api/cards') {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  event.respondWith(cacheFirst(req));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const resp = await fetch(request);
    if (resp.ok) {
      const copy = resp.clone();
      caches.open(VERSION).then((c) => c.put(request, copy));
    }
    return resp;
  } catch {
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);
  const fetched = fetch(request).then((resp) => {
    if (resp && resp.ok) cache.put(request, resp.clone());
    return resp;
  }).catch(() => null);
  return cached || fetched || Response.error();
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'couplecards-outbox-flush') {
    event.waitUntil(broadcastFlush());
  }
});

async function broadcastFlush() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: 'OUTBOX_FLUSH' });
  }
}
