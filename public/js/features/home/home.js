// SPDX-License-Identifier: MIT
// Home screen: pile selectors, remaining-card counts, nav to secondary views.

import { countsByPile, totalByPile } from '../../core/sync.js';
import { navigate } from '../../core/router.js';
import { vibrate } from '../../ui/shell.js';
import { CONFIG } from '../../config.js';
import { on } from '../../core/events.js';
import { t } from '../../core/i18n.js';

const PILES = ['home', 'outdoor'];

let unsubscribers = [];
let pileLaunching = false;
let pileLaunchTimer = 0;

export function refreshHomeCounts() {
  const remaining = countsByPile();
  const totals = totalByPile();
  for (const pile of PILES) {
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
  renderEmptyNotice(remaining, totals);
}

// A pile at zero only greys its button out, which tells the player nothing and
// leaves no way forward. Spell out both dead ends instead, because they have
// different exits: every card banned is undone from the Collection, while a
// pile the deck never filled is the administrator's problem.
function renderEmptyNotice(remaining, totals) {
  const host = document.getElementById('pile-notice');
  if (!host) return;
  const empty = PILES.filter((pile) => remaining[pile] === 0);
  host.replaceChildren();
  host.hidden = empty.length === 0;
  if (host.hidden) return;

  let restorable = false;
  for (const pile of empty) {
    const line = document.createElement('p');
    line.className = 'pile-notice-line';
    const allBanned = totals[pile] > 0;
    if (allBanned) restorable = true;
    line.textContent = t(allBanned ? 'home.pile.empty.allBanned' : 'home.pile.empty.noCards', {
      pile: t(`piles.${pile}.label`),
    });
    host.appendChild(line);
  }
  if (!restorable) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-sm btn-primary';
  btn.textContent = t('home.pile.empty.restore');
  // Pre-filtered on banned cards, so Restore is one tap away.
  btn.addEventListener('click', () => navigate('collection', { filter: 'banned' }));
  host.appendChild(btn);
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

  // The notice is built in JS, so applyI18n() does not reach it on a language
  // change the way it reaches the rest of the view.
  unsubscribers = [
    on('state:banned-changed', refreshHomeCounts),
    on('i18n:change', refreshHomeCounts),
  ];
}

export function unmount() {
  for (const fn of unsubscribers) fn();
  unsubscribers = [];
  // Kill a pending pile launch: navigating away inside the 380 ms launch
  // window must not yank the user back to the draw screen.
  clearTimeout(pileLaunchTimer);
  pileLaunching = false;
}
