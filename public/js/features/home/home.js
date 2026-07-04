// SPDX-License-Identifier: MIT
// Home screen: pile selectors, remaining-card counts, nav to secondary views.

import { countsByPile, totalByPile } from '../../core/sync.js';
import { navigate } from '../../core/router.js';
import { vibrate } from '../../ui/shell.js';
import { CONFIG } from '../../config.js';
import { on } from '../../core/events.js';

let unsubscribe = null;
let pileLaunching = false;
let pileLaunchTimer = 0;

export function refreshHomeCounts() {
  const remaining = countsByPile();
  const totals = totalByPile();
  for (const pile of ['home', 'outdoor']) {
    const countEl = document.getElementById(`count-${pile}`);
    const btn = document.querySelector(`.pile-${pile}`);
    if (countEl) {
      const next = `${remaining[pile]} / ${totals[pile]}`;
      const prev = countEl.textContent;
      if (prev !== next) {
        countEl.textContent = next;
        // Skip the pop animation on the first paint, when prev is the
        // dash placeholder. Otherwise every cold load flashes pink.
        if (prev !== '—') {
          countEl.classList.remove('count-changed');
          void countEl.offsetWidth;
          countEl.classList.add('count-changed');
        }
      }
    }
    if (btn) {
      const empty = remaining[pile] === 0;
      const low = !empty && remaining[pile] <= 2;
      btn.classList.toggle('empty', empty);
      btn.classList.toggle('low', low);
      btn.disabled = empty;
      // The pile button uses aria-label, which replaces its inner text for
      // screen readers, so the visible "Almost empty" hint would otherwise
      // be invisible to assistive tech. Link it via aria-describedby only
      // when it is actually shown.
      if (low) btn.setAttribute('aria-describedby', `low-${pile}`);
      else btn.removeAttribute('aria-describedby');
    }
    const hint = document.getElementById(`low-${pile}`);
    if (hint) hint.hidden = !(remaining[pile] > 0 && remaining[pile] <= 2);
  }
}

export async function mount() {
  document.querySelectorAll('.pile').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (pileLaunching) return;
      if (btn.disabled || btn.classList.contains('empty')) return;
      pileLaunching = true;
      vibrate(CONFIG.vibrations.pileTap);
      const { requestOrientationIfNeeded } = await import('../deck/draw.js');
      await requestOrientationIfNeeded();
      btn.classList.add('launching');
      const pile = btn.dataset.pile;
      pileLaunchTimer = setTimeout(() => {
        btn.classList.remove('launching');
        pileLaunching = false;
        navigate('draw', { pile });
      }, CONFIG.pileLaunchDuration);
    });
  });

  refreshHomeCounts();

  unsubscribe = on('state:banned-changed', refreshHomeCounts);
}

export function unmount() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  // Kill a pending pile launch: navigating away inside the 380 ms launch
  // window must not yank the user back to the draw screen.
  clearTimeout(pileLaunchTimer);
  pileLaunching = false;
}
