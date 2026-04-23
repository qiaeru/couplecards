// SPDX-License-Identifier: MIT
// Rules screen is purely static markup; the module only wires the back button.

import { navigate } from '../../core/router.js';

export function mount() {
  document.getElementById('btn-back-home')?.addEventListener('click', () => navigate('home'));
}

export function unmount() {}
