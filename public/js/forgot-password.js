// SPDX-License-Identifier: MIT
// Forgot-password page entry point. Purely informational: with no personal data
// collected, a lost password cannot be reset. Explains the situation and points
// to creating a new account when registration is open, or states that the
// administrator has not opened public registration otherwise.

import { registrationEnabled } from './core/auth.js';
import { initI18n, applyI18n } from './core/i18n.js';
import { mountFloatingBackground } from './ui/floating-bg.js';

async function init() {
  mountFloatingBackground();
  await initI18n();
  applyI18n(document);

  const open = await registrationEnabled();
  const openEl = document.getElementById('forgot-open');
  const closedEl = document.getElementById('forgot-closed');
  if (openEl) openEl.hidden = !open;
  if (closedEl) closedEl.hidden = open;
}

init().catch((err) => console.error(err));
