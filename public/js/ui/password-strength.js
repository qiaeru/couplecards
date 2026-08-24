// SPDX-License-Identifier: MIT
// Password strength component: a strength bar plus a live checklist of the
// hard rules, bound to a password input. zxcvbn is lazy-loaded only on pages
// that carry a password field; when the vendor bundle is missing the checklist
// keeps working and only the score stays at zero.

import { t } from '../core/i18n.js';

let zxcvbnPromise = null;

async function loadZxcvbn() {
  if (zxcvbnPromise) return zxcvbnPromise;
  zxcvbnPromise = import('/vendor/zxcvbn.js').catch((err) => {
    console.warn('zxcvbn bundle not available, scoring disabled', err);
    return null;
  });
  return zxcvbnPromise;
}

// Hard rules mirrored from the backend `lib/password.js`.
const RULES = {
  minLength: 12,
  requireUpper: true,
  requireLower: true,
  requireDigit: true,
  requireSpecial: true,
  noWhitespace: true,
};

function evaluateHardRules(password, username = '') {
  return {
    minLength: password.length >= RULES.minLength,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    digit: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
    noWhitespace: !/\s/.test(password),
    noUsername: !username || !password.toLowerCase().includes(username.toLowerCase()),
  };
}

async function computeScore(password, userInputs = []) {
  const mod = await loadZxcvbn();
  if (!mod || !password) return { score: 0, feedback: { warning: '', suggestions: [] } };
  const result = mod.zxcvbn(password, userInputs.filter(Boolean));
  return { score: result.score, feedback: result.feedback };
}

// Render a progress bar + rule checklist inside a host element.
// The host must expose: <input type="password"> and a container with
// data-password-strength. This function also watches input events on the password.
export function bindPasswordStrength({ input, host, userInputs = [], minScore = 3 }) {
  if (!input || !host) return () => {};

  host.innerHTML = `
    <div class="pw-strength">
      <div class="pw-strength-bar" role="presentation">
        <div class="pw-strength-fill" data-fill></div>
      </div>
      <div class="pw-strength-label" data-label aria-live="polite" aria-atomic="true"></div>
      <ul class="pw-strength-rules" data-rules>
        <li data-rule="minLength">${t('changePassword.policy.minLength', { min: RULES.minLength })}</li>
        <li data-rule="upper">${t('changePassword.policy.upper')}</li>
        <li data-rule="lower">${t('changePassword.policy.lower')}</li>
        <li data-rule="digit">${t('changePassword.policy.digit')}</li>
        <li data-rule="special">${t('changePassword.policy.special')}</li>
        <li data-rule="noWhitespace">${t('changePassword.policy.noWhitespace')}</li>
        <li data-rule="noUsername">${t('changePassword.policy.noUsername')}</li>
      </ul>
    </div>
  `;

  const fill = host.querySelector('[data-fill]');
  const label = host.querySelector('[data-label]');
  const rules = host.querySelectorAll('[data-rule]');

  // Track the last announced label so we only mutate textContent when the
  // strength tier actually changed. Re-setting the same string would still
  // trigger the live region to re-announce on every keystroke.
  let lastLabel = '';

  const update = async () => {
    const value = input.value;
    const hard = evaluateHardRules(value, userInputs[0] || '');
    rules.forEach((li) => {
      const ok = !!hard[li.dataset.rule];
      li.classList.toggle('ok', ok);
      li.classList.toggle('nope', !ok);
    });
    const { score } = await computeScore(value, userInputs);
    const pct = (score / 4) * 100;
    fill.style.width = `${pct}%`;
    fill.dataset.score = String(score);
    const nextLabel = value ? t(`changePassword.strength.${score}`) : '';
    if (nextLabel !== lastLabel) {
      label.textContent = nextLabel;
      lastLabel = nextLabel;
    }
    const allHard = Object.values(hard).every(Boolean);
    input.setCustomValidity(allHard && score >= minScore ? '' : 'weak');
  };

  const handler = () => { update().catch(() => {}); };
  input.addEventListener('input', handler);
  update().catch(() => {});

  return () => input.removeEventListener('input', handler);
}
