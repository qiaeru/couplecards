// SPDX-License-Identifier: MIT
// User settings: language, vibrations, change password, logout, install PWA.

import { areVibrationsEnabled, setVibrationsEnabled, areSoundsEnabled, setSoundsEnabled, canInstall, triggerInstall, toast, showConfirm } from '../../ui/shell.js';
import { logout, setPreferences, getCachedUser, me, changePassword, getPasswordPolicy } from '../../core/auth.js';
import { resetUserData } from '../../core/sync.js';
import { setLocale, getLocale, supportedLocales, t } from '../../core/i18n.js';
import { navigate } from '../../core/router.js';
import { bindPasswordStrength } from '../../ui/password-strength.js';

export async function mount() {
  document.getElementById('btn-back-home')?.addEventListener('click', () => navigate('home'));

  // Language selector.
  const langSelect = document.getElementById('setting-language');
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

  // Sound-effects toggle. Listed before vibrations on purpose: audio carries
  // the most obvious feedback of the draw flow.
  const snd = document.getElementById('setting-sounds');
  if (snd) {
    snd.checked = areSoundsEnabled();
    snd.addEventListener('change', () => setSoundsEnabled(snd.checked));
  }

  // Vibrations toggle.
  const vib = document.getElementById('setting-vibrations');
  if (vib) {
    vib.checked = areVibrationsEnabled();
    vib.addEventListener('change', () => setVibrationsEnabled(vib.checked));
  }

  // Install row — visibility driven by the PWA install prompt.
  const installRow = document.getElementById('install-row');
  const installBtn = document.getElementById('install-btn');
  const refreshInstall = () => { if (installRow) installRow.hidden = !canInstall(); };
  refreshInstall();
  document.addEventListener('pwa-install-available', refreshInstall);
  document.addEventListener('pwa-installed', refreshInstall);
  installBtn?.addEventListener('click', async () => { await triggerInstall(); refreshInstall(); });

  // Reset data (history + bans). Hidden for the shared demo account: its
  // state is already wiped server-side at each sign-in.
  const resetRow = document.getElementById('reset-data-row');
  const resetBtn = document.getElementById('btn-reset-data');
  const cachedUser = getCachedUser();
  if (cachedUser?.isDemo) {
    resetRow?.setAttribute('hidden', '');
  } else {
    resetBtn?.addEventListener('click', async () => {
      const ok = await showConfirm({
        title: t('settings.resetData'),
        body: t('settings.resetData.confirm'),
        confirmLabel: t('settings.resetData.action'),
        cancelLabel: t('common.cancel'),
        danger: true,
      });
      if (!ok) return;
      try {
        await resetUserData();
        toast(t('settings.resetData.toast'));
      } catch {
        toast(t('errors.generic'));
      }
    });
  }

  // Logout.
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    const ok = await showConfirm({
      title: t('nav.logout'),
      confirmLabel: t('nav.logout'),
      cancelLabel: t('common.cancel'),
      danger: false,
    });
    if (!ok) return;
    await logout();
    location.replace('/login.html');
  });

  // Change password modal (hidden for the shared demo account, which must
  // keep the well-known `demo` password for the next visitor).
  const user = getCachedUser();
  const changeBtn = document.getElementById('btn-change-password');
  if (user?.isDemo) {
    changeBtn?.closest('.setting-row')?.setAttribute('hidden', '');
  } else {
    changeBtn?.addEventListener('click', () => openChangePasswordDialog());
  }
}

export function unmount() {}

async function openChangePasswordDialog() {
  const user = getCachedUser() || await me();
  if (!user) { navigate('home'); return; }
  const policy = await getPasswordPolicy().catch(() => null);
  const host = document.getElementById('modal');
  const titleEl = document.getElementById('modal-title');
  const bodyEl = document.getElementById('modal-body');
  const confirmBtn = document.getElementById('modal-confirm');
  const cancelBtn = document.getElementById('modal-cancel');
  if (!host || !titleEl || !bodyEl || !confirmBtn || !cancelBtn) return;

  titleEl.textContent = t('changePassword.title');
  bodyEl.innerHTML = `
    <form id="cp-form" class="change-password-form" novalidate>
      <label class="field">
        <span>${t('changePassword.current')}</span>
        <input type="password" id="cp-current" autocomplete="current-password" required>
      </label>
      <label class="field">
        <span>${t('changePassword.new')}</span>
        <input type="password" id="cp-new" autocomplete="new-password" required minlength="12">
      </label>
      <div id="cp-strength"></div>
      <label class="field">
        <span>${t('changePassword.confirm')}</span>
        <input type="password" id="cp-confirm" autocomplete="new-password" required minlength="12">
      </label>
      <div class="cp-error" id="cp-error" role="alert" aria-live="polite"></div>
    </form>
  `;
  confirmBtn.textContent = t('changePassword.submit');
  cancelBtn.textContent = t('common.cancel');
  confirmBtn.classList.add('btn-primary');
  confirmBtn.classList.remove('btn-danger');
  cancelBtn.hidden = false;
  host.hidden = false;

  const minScore = user.role === 'admin' ? (policy?.zxcvbnMinScoreAdmin ?? 4) : (policy?.zxcvbnMinScoreUser ?? 3);
  const input = document.getElementById('cp-new');
  const strengthHost = document.getElementById('cp-strength');
  const unbind = bindPasswordStrength({ input, host: strengthHost, userInputs: [user.username], minScore });

  const close = () => {
    host.hidden = true;
    unbind();
    confirmBtn.removeEventListener('click', onConfirm);
    cancelBtn.removeEventListener('click', onCancel);
  };
  const onCancel = () => close();
  const onConfirm = async () => {
    const current = document.getElementById('cp-current').value;
    const next = input.value;
    const confirm = document.getElementById('cp-confirm').value;
    const err = document.getElementById('cp-error');
    err.textContent = '';
    if (next !== confirm) { err.textContent = t('changePassword.mismatch'); return; }
    confirmBtn.disabled = true;
    try {
      await changePassword(current, next);
      close();
      toast(t('changePassword.success'));
    } catch (e) {
      err.textContent = t(`errors.${e.code}`) || t('errors.generic');
    } finally {
      confirmBtn.disabled = false;
    }
  };
  confirmBtn.addEventListener('click', onConfirm);
  cancelBtn.addEventListener('click', onCancel);
  setTimeout(() => document.getElementById('cp-current')?.focus(), 50);
}
