// SPDX-License-Identifier: MIT
// Public registration page entry point. Standalone like login.js: no router,
// no partials. Creates an account (username + password), opens the session and
// redirects, or shows the closed state when registration is disabled.

import { register, registrationEnabled, me } from './core/auth.js';
import { initI18n, applyI18n, t } from './core/i18n.js';
import { bindPasswordStrength } from './ui/password-strength.js';
import { mountFloatingBackground } from './ui/floating-bg.js';

const $ = (id) => document.getElementById(id);

const ERROR_FIELDS = ['register-username', 'register-password', 'register-confirm'];

function showError(code, extra = {}) {
  const el = $('register-error');
  if (!el) return;
  const invalid = !!code;
  for (const id of ERROR_FIELDS) {
    const input = $(id);
    if (!input) continue;
    if (invalid) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  if (!code) { el.textContent = ''; return; }
  const key = code.includes('.') ? code : `errors.${code}`;
  const fallback = t('errors.generic');
  el.textContent = t(key, extra) === key ? fallback : t(key, extra);
}

function redirectAfterAuth(user) {
  const params = new URLSearchParams(location.search);
  const next = params.get('next');
  if (next && /^\/[^/\\]/.test(next)) {
    location.replace(next);
    return;
  }
  location.replace(user?.role === 'admin' ? '/admin.html' : '/');
}

function showStep(name) {
  for (const step of ['register', 'register-disabled']) {
    const el = $(`step-${step}`);
    if (el) el.hidden = step !== name;
  }
}

async function init() {
  mountFloatingBackground();
  const existing = await me();
  await initI18n(existing?.locale);
  applyI18n(document);

  // A logged-in visitor has no reason to register; send them where they belong.
  if (existing) {
    redirectAfterAuth(existing);
    return;
  }

  if (!(await registrationEnabled())) {
    showStep('register-disabled');
    return;
  }

  showStep('register');

  // Feed the typed username into the strength checker so the "must not contain
  // the username" rule and zxcvbn scoring stay live as either field changes.
  const userInputs = [];
  bindPasswordStrength({
    input: $('register-password'),
    host: $('register-strength'),
    userInputs,
    minScore: 3,
  });
  $('register-username').addEventListener('input', () => {
    userInputs[0] = $('register-username').value.trim().toLowerCase();
    $('register-password').dispatchEvent(new Event('input'));
  });

  $('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showError(null);
    const username = $('register-username').value.trim().toLowerCase();
    const password = $('register-password').value;
    const confirm = $('register-confirm').value;
    if (password !== confirm) { showError('registration.mismatch'); return; }
    const submit = e.target.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = t('registration.submitting');
    try {
      const user = await register(username, password);
      redirectAfterAuth(user);
    } catch (err) {
      if (err?.code === 'RATE_LIMITED') {
        showError('login.errors.rateLimited');
      } else if (err?.code === 'REGISTRATION_DISABLED') {
        showStep('register-disabled');
      } else {
        showError(err?.code || 'generic');
      }
    } finally {
      submit.disabled = false;
      submit.textContent = t('registration.submit');
    }
  });
}

init().catch((err) => console.error(err));
