// SPDX-License-Identifier: MIT
// Admin page entry point. No SPA router — uses simple tab switching.

import { me, logout, setPreferences } from './core/auth.js';
import { initI18n, applyI18n, setLocale, getLocale, supportedLocales, t } from './core/i18n.js';
import { initScrollToTop } from './ui/scroll-to-top.js';

const TABS = ['users', 'cards', 'settings'];

function activateTab(name) {
  for (const tab of TABS) {
    const panel = document.getElementById(`admin-panel-${tab}`);
    const btn = document.getElementById(`admin-tab-${tab}`);
    if (panel) panel.hidden = tab !== name;
    if (btn) {
      btn.classList.toggle('active', tab === name);
      btn.setAttribute('aria-selected', tab === name ? 'true' : 'false');
    }
  }
  sessionStorage.setItem('couplecards:admin-tab', name);
}

async function init() {
  const user = await me();
  if (!user) { location.replace('/login.html?next=/admin.html'); return; }
  if (user.role !== 'admin') { location.replace('/'); return; }
  if (user.mustChangePassword) { location.replace('/login.html?forceChange=1'); return; }

  await initI18n(user.locale);
  applyI18n(document);

  for (const tab of TABS) {
    document.getElementById(`admin-tab-${tab}`)?.addEventListener('click', () => activateTab(tab));
  }

  const initialTab = sessionStorage.getItem('couplecards:admin-tab') || 'users';
  activateTab(TABS.includes(initialTab) ? initialTab : 'users');

  document.getElementById('admin-title').textContent = t('admin.title');

  const langSelect = document.getElementById('admin-language');
  if (langSelect) {
    langSelect.innerHTML = supportedLocales()
      .map((l) => `<option value="${l}">${t(`settings.language.${l}`)}</option>`)
      .join('');
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

init().catch((err) => {
  console.error(err);
  document.body.replaceChildren();
  const main = document.createElement('main');
  main.className = 'error-page';
  const h = document.createElement('h1');
  h.className = 'title';
  h.textContent = 'Administration failed to load';
  const p = document.createElement('p');
  p.textContent = String(err?.message || err);
  const link = document.createElement('a');
  link.className = 'btn btn-primary';
  link.href = '/';
  link.textContent = 'Back';
  main.append(h, p, link);
  document.body.append(main);
});
