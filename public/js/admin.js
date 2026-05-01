// SPDX-License-Identifier: MIT
// Admin page entry point. No SPA router — uses simple tab switching.

import { me, logout, setPreferences } from './core/auth.js';
import { initI18n, applyI18n, setLocale, getLocale, supportedLocales, t } from './core/i18n.js';
import { initScrollToTop } from './ui/scroll-to-top.js';

const TABS = ['users', 'cards', 'settings'];

// Tabs follow the WAI-ARIA APG pattern: the active tab carries tabindex="0",
// every other tab carries tabindex="-1" so Tab moves from the tablist straight
// into the visible panel rather than cycling across the three buttons.
function activateTab(name, { focus = false } = {}) {
  for (const tab of TABS) {
    const panel = document.getElementById(`admin-panel-${tab}`);
    const btn = document.getElementById(`admin-tab-${tab}`);
    const isActive = tab === name;
    if (panel) panel.hidden = !isActive;
    if (btn) {
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.setAttribute('tabindex', isActive ? '0' : '-1');
      if (isActive && focus) btn.focus();
    }
  }
  sessionStorage.setItem('couplecards:admin-tab', name);
}

function onTabKey(event) {
  const currentName = event.currentTarget.id.replace(/^admin-tab-/, '');
  const currentIndex = TABS.indexOf(currentName);
  if (currentIndex < 0) return;
  let nextIndex = null;
  switch (event.key) {
    case 'ArrowLeft':  nextIndex = (currentIndex - 1 + TABS.length) % TABS.length; break;
    case 'ArrowRight': nextIndex = (currentIndex + 1) % TABS.length; break;
    case 'Home':       nextIndex = 0; break;
    case 'End':        nextIndex = TABS.length - 1; break;
    default: return;
  }
  event.preventDefault();
  activateTab(TABS[nextIndex], { focus: true });
}

async function init() {
  const user = await me();
  if (!user) { location.replace('/login.html?next=/admin.html'); return; }
  if (user.role !== 'admin') { location.replace('/'); return; }
  if (user.mustChangePassword) { location.replace('/login.html?forceChange=1'); return; }

  await initI18n(user.locale);
  applyI18n(document);

  for (const tab of TABS) {
    const btn = document.getElementById(`admin-tab-${tab}`);
    if (!btn) continue;
    btn.addEventListener('click', () => activateTab(tab));
    btn.addEventListener('keydown', onTabKey);
  }

  const initialTab = sessionStorage.getItem('couplecards:admin-tab') || 'users';
  activateTab(TABS.includes(initialTab) ? initialTab : 'users');

  document.getElementById('admin-title').textContent = t('admin.title');

  const langSelect = document.getElementById('admin-language');
  if (langSelect) {
    const options = supportedLocales()
      .map((l) => ({ code: l, label: t(`settings.language.${l}`) }))
      .sort((a, b) => a.label.localeCompare(b.label));
    langSelect.replaceChildren(...options.map(({ code, label }) => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = label;
      return opt;
    }));
    langSelect.value = getLocale();
    langSelect.addEventListener('change', async () => {
      await setLocale(langSelect.value);
      try { await setPreferences({ locale: langSelect.value }); } catch {}
    });
  }

  document.getElementById('admin-logout')?.addEventListener('click', async () => {
    await logout();
    location.replace('/login.html');
  });

  const [usersMod, cardsMod] = await Promise.all([
    import('./features/admin/users.js'),
    import('./features/admin/cards.js'),
  ]);
  await Promise.all([usersMod.mount(), cardsMod.mount()]);

  document.getElementById('admin-boot')?.remove();
  document.getElementById('admin-app')?.removeAttribute('hidden');
  initScrollToTop();
}

// Fall back to English if the catalogue never loaded (init crashed before
// `initI18n` resolved). `t()` returns the key itself in that case.
const tOr = (key, fallback) => {
  const value = t(key);
  return value === key ? fallback : value;
};

init().catch((err) => {
  console.error(err);
  document.body.replaceChildren();
  const main = document.createElement('main');
  main.className = 'error-page';
  const h = document.createElement('h1');
  h.className = 'title';
  h.textContent = tOr('errors.page.bootFailed.adminTitle', 'Administration failed to load');
  const p = document.createElement('p');
  p.textContent = String(err?.message || err);
  const link = document.createElement('a');
  link.className = 'btn btn-primary';
  link.href = '/';
  link.textContent = tOr('common.back', 'Back');
  main.append(h, p, link);
  document.body.append(main);
});
