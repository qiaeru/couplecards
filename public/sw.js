// SPDX-License-Identifier: MIT
// Auth-aware service worker:
//   * shell (HTML, CSS, JS, fonts, partials, locales): cache-first
//   * every /api/* route: passed through, never cached
//
// The deck is deliberately not cached here: core/sync.js already mirrors it in
// IndexedDB. Caching it a second time served every client one deck version
// behind, since the page got the stale copy while the revalidation stored the
// fresh one, and left the admin card list one edit behind for good.

const VERSION = 'couplecards-v55';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/login.html',
  '/register.html',
  '/forgot-password.html',
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
  '/js/register.js',
  '/js/forgot-password.js',
  '/js/admin.js',
  '/js/error-page.js',
  '/js/config.js',
  '/js/core/api.js',
  '/js/core/dom.js',
  '/js/core/auth.js',
  '/js/core/events.js',
  '/js/core/i18n.js',
  '/js/core/idb.js',
  '/js/core/router.js',
  '/js/core/sync.js',
  '/js/features/home/home.js',
  '/js/features/history/history.js',
  '/js/features/collection/collection.js',
  '/js/features/settings/settings.js',
  '/js/features/rules/rules.js',
  '/js/features/deck/draw.js',
  '/js/features/admin/users.js',
  '/js/features/admin/cards.js',
  '/js/features/admin/deck-sync.js',
  '/js/features/admin/emoji-slugs.js',
  '/js/ui/emoji.js',
  '/js/ui/floating-bg.js',
  '/js/ui/form-error.js',
  '/js/ui/shell.js',
  '/js/ui/password-strength.js',
  '/js/ui/scroll-to-top.js',
  '/js/ui/sound.js',
  '/views/home.html',
  '/views/draw.html',
  '/views/history.html',
  '/views/collection.html',
  '/views/settings.html',
  '/views/rules.html',
  '/locales/en.json',
  '/locales/fr.json',
  '/locales/de.json',
  '/locales/it.json',
  '/locales/es.json',
  '/fonts/InterVariable.woff2',
  '/fonts/fraunces/variable-latin.woff2',
  '/fonts/fraunces/variable-latin-ext.woff2',
  '/fonts/fraunces/variable-vietnamese.woff2',
  '/fonts/fraunces/italic-latin.woff2',
  '/fonts/fraunces/italic-latin-ext.woff2',
  '/fonts/fraunces/italic-vietnamese.woff2',
  '/icons/icon.svg',
  '/icons/icon-maskable.svg',
  '/icons/favicon.ico',
  '/icons/apple-touch-icon.png',
  '/icons/qiaeru.svg',
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
    // Cache each asset individually: with addAll a single failing asset
    // would silently abandon the whole shell and break offline support.
    const results = await Promise.allSettled(SHELL.map((url) => cache.add(url)));
    const failed = SHELL.filter((_, i) => results[i].status === 'rejected');
    if (failed.length > 0) {
      console.warn(`[sw] shell precache: ${failed.length}/${SHELL.length} assets failed:`, failed.join(', '));
    }
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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache the API: auth, sync, state, and user endpoints are
  // auth-sensitive, and the deck has its own IndexedDB cache in core/sync.js.
  if (url.pathname.startsWith('/api/')) return;

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
    // Offline and not in the cache: the early return above already handled
    // every hit, so there is nothing left to fall back to.
    return Response.error();
  }
}
