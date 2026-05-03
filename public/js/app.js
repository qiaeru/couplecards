// SPDX-License-Identifier: MIT
// Main SPA bootstrap: auth check, i18n init, router mount, service worker.

import { me } from './core/auth.js';
import { initI18n, applyI18n, t } from './core/i18n.js';
import { initSync } from './core/sync.js';
import { registerFeature, setOutlet, startRouter } from './core/router.js';
import { registerServiceWorker, initSyncBanner } from './ui/shell.js';
import { initScrollToTop } from './ui/scroll-to-top.js';

async function boot() {
  const user = await me();
  if (!user) {
    location.replace('/login.html');
    return;
  }
  if (user.mustChangePassword) {
    location.replace('/login.html?forceChange=1');
    return;
  }
  // Admin accounts don't play; they always land on the admin panel.
  if (user.role === 'admin') {
    location.replace('/admin.html');
    return;
  }

  await initI18n(user.locale);
  await initSync();
  applyI18n(document);

  registerFeature('home',       () => import('./features/home/home.js'));
  registerFeature('draw',       () => import('./features/deck/draw.js'));
  registerFeature('history',    () => import('./features/history/history.js'));
  registerFeature('collection', () => import('./features/collection/collection.js'));
  registerFeature('settings',   () => import('./features/settings/settings.js'));
  registerFeature('rules',      () => import('./features/rules/rules.js'));

  const outlet = document.getElementById('view');
  setOutlet(outlet);

  document.getElementById('boot-skeleton')?.remove();
  document.getElementById('app')?.removeAttribute('hidden');

  wireBottomNav();
  if (user.isDemo) {
    const banner = document.getElementById('demo-banner');
    if (banner) {
      banner.textContent = t('demo.banner');
      banner.hidden = false;
    }
  }

  startRouter();
  initScrollToTop();
  initSyncBanner();
  registerServiceWorker();
}

function wireBottomNav() {
  const update = (route) => {
    document.querySelectorAll('[data-nav-route]').forEach((link) => {
      if (link.dataset.navRoute === route) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  };
  document.addEventListener('route:mounted', (event) => update(event.detail.route));
}

// Fall back to English if the catalogue never loaded (boot crashed before
// `initI18n` resolved). `t()` returns the key itself in that case.
const tOr = (key, fallback) => {
  const value = t(key);
  return value === key ? fallback : value;
};

boot().catch((err) => {
  console.error(err);
  const message = String(err?.message || err || 'Unknown error');
  // Built with DOM APIs (not inline styles) to respect the strict CSP.
  document.body.replaceChildren();
  const main = document.createElement('main');
  main.className = 'error-page';
  const h = document.createElement('h1');
  h.className = 'title';
  h.textContent = tOr('errors.page.bootFailed.title', 'Couplecards failed to load');
  const p = document.createElement('p');
  p.textContent = message;
  const link = document.createElement('a');
  link.className = 'btn btn-primary';
  link.href = '/login.html';
  link.textContent = tOr('errors.page.bootFailed.signIn', 'Back to sign in');
  main.append(h, p, link);
  document.body.append(main);
});
