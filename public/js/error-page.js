// SPDX-License-Identifier: MIT
// Boot script for the static error pages (404, 500). Kept as an external
// module so the documents satisfy `script-src 'self'` without `unsafe-inline`.

import { initI18n, applyI18n } from '/js/core/i18n.js';

initI18n().then(() => applyI18n(document)).catch(() => {});

const reloadBtn = document.getElementById('reload-btn');
if (reloadBtn) reloadBtn.addEventListener('click', () => location.reload());
