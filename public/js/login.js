// SPDX-License-Identifier: MIT
// Login page entry point: handles sign-in and the forced password change
// on first login. Kept deliberately small — no router, no partials.

import { login, me, changePassword, getPasswordPolicy } from './core/auth.js';
import { initI18n, applyI18n, t, fmtDate } from './core/i18n.js';
import { bindPasswordStrength } from './ui/password-strength.js';

const $ = (id) => document.getElementById(id);

function showStep(name) {
  for (const step of ['login', 'change']) {
    const el = document.getElementById(`step-${step}`);
    if (el) el.hidden = step !== name;
  }
}

const ERROR_FIELDS = {
  login:  ['login-username', 'login-password'],
  change: ['change-current', 'change-new', 'change-confirm'],
};

function showError(scope, code, extra = {}) {
  const el = document.getElementById(`${scope}-error`);
  if (!el) return;
  const invalid = !!code;
  for (const id of ERROR_FIELDS[scope] || []) {
    const input = document.getElementById(id);
    if (!input) continue;
    if (invalid) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  if (!code) { el.textContent = ''; return; }
  const key = code.startsWith('login.errors.') ? code : `errors.${code}`;
  const fallback = t('errors.generic');
  el.textContent = t(key, extra) === key ? fallback : t(key, extra);
}

function redirectAfterAuth(user) {
  const params = new URLSearchParams(location.search);
  const next = params.get('next');
  if (next && next.startsWith('/')) {
    location.replace(next);
    return;
  }
  // Admins go straight to /admin.html; everyone else gets the home SPA.
  location.replace(user?.role === 'admin' ? '/admin.html' : '/');
}

function showChangeStep(user) {
  showStep('change');
  $('change-title').textContent = t('changePassword.title');
  $('change-subtitle').textContent = user.mustChangePassword
    ? t('changePassword.subtitle.firstLogin')
    : t('changePassword.subtitle.regular');

  const unbind = bindPasswordStrength({
    input: $('change-new'),
    host: $('change-strength'),
    userInputs: [user.username],
    minScore: user.role === 'admin' ? 4 : 3,
  });

  $('change-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('change', null);
    const next = $('change-new').value;
    const confirm = $('change-confirm').value;
    if (next !== confirm) { showError('change', 'changePassword.mismatch'); return; }
    try {
      await changePassword($('change-current').value, next);
      unbind();
      const refreshed = await me();
      redirectAfterAuth(refreshed || user);
    } catch (err) {
      showError('change', err.code || 'generic');
    }
  });
}

async function init() {
  const existing = await me();
  await initI18n(existing?.locale);
  applyI18n(document);

  await getPasswordPolicy().catch(() => null);

  const params = new URLSearchParams(location.search);
  if (existing) {
    if (existing.mustChangePassword || params.get('forceChange')) {
      showChangeStep(existing);
      return;
    }
    redirectAfterAuth(existing);
    return;
  }

  showStep('login');
  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('login', null);
    const username = $('login-username').value.trim().toLowerCase();
    const password = $('login-password').value;
    const submit = e.target.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = t('login.submitting');
    try {
      const user = await login(username, password);
      if (user.mustChangePassword) {
        showChangeStep(user);
      } else {
        redirectAfterAuth(user);
      }
    } catch (err) {
      if (err?.code === 'ACCOUNT_LOCKED') {
        const when = err.details?.unlockAt ? fmtDate(err.details.unlockAt) : '';
        showError('login', 'login.errors.locked', { when });
      } else if (err?.code === 'RATE_LIMITED') {
        showError('login', 'login.errors.rateLimited');
      } else if (err?.code === 'INVALID_CREDENTIALS') {
        showError('login', 'login.errors.invalid');
      } else {
        showError('login', 'login.errors.generic');
      }
    } finally {
      submit.disabled = false;
      submit.textContent = t('login.submit');
    }
  });
}

init().catch((err) => console.error(err));
