// SPDX-License-Identifier: MIT
// Shared field-error rendering for the standalone auth pages (login, register).
// Marks the named inputs aria-invalid and writes a localized message (or a
// generic fallback) into the error element. `code` may be a full i18n key
// (it contains a dot) or a bare error code resolved under `errors.`. Pass a
// falsy `code` to clear the error and the aria-invalid flags.

import { t } from '../core/i18n.js';

export function applyFieldError(errorElId, fieldIds, code, extra = {}) {
  const el = document.getElementById(errorElId);
  if (!el) return;
  const invalid = !!code;
  for (const id of fieldIds) {
    const input = document.getElementById(id);
    if (!input) continue;
    if (invalid) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  if (!code) { el.textContent = ''; return; }
  const key = code.includes('.') ? code : `errors.${code}`;
  const fallback = t('errors.generic');
  el.textContent = t(key, extra) === key ? fallback : t(key, extra);
}
