// SPDX-License-Identifier: MIT
// Banned cards view: one-tap restoration for accidental bans.

import { getBanned, getCardById, getCardText, unbanCard } from '../../core/sync.js';
import { navigate } from '../../core/router.js';
import { t, fmtDateLong } from '../../core/i18n.js';
import { toast } from '../../ui/shell.js';
import { on } from '../../core/events.js';

let unsubscribe = null;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function render() {
  const host = document.getElementById('bans-list');
  if (!host) return;
  const banned = getBanned();
  host.innerHTML = '';
  if (banned.length === 0) {
    host.innerHTML = `<div class="empty">
      <div class="empty-icon" aria-hidden="true">🌿</div>
      <div class="empty-title">${escapeHtml(t('bans.empty.title'))}</div>
      <div class="empty-hint">${escapeHtml(t('bans.empty.hint'))}</div>
    </div>`;
    return;
  }
  for (const entry of banned) {
    const { cardId, bannedAt } = entry;
    const card = getCardById(cardId);
    const title = card ? getCardText(card).title : t('history.card.deleted');
    const pile = card?.pile ?? null;
    const foil = !!card?.foil;

    const div = document.createElement('div');
    div.className = 'list-item';
    if (card) {
      div.classList.add('clickable');
      div.setAttribute('role', 'button');
      div.setAttribute('tabindex', '0');
      const preview = () => navigate('draw', { preview: cardId });
      div.addEventListener('click', preview);
      div.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); preview(); }
      });
    }
    const main = document.createElement('div');
    main.className = 'list-item-main';
    const pileBadge = pile
      ? `<span class="pile-badge ${pile}">${escapeHtml(t(`piles.${pile}.label`))}</span>`
      : '';
    const whenLine = bannedAt
      ? `<div class="list-item-meta">${escapeHtml(t('bans.entry.bannedAt', { when: fmtDateLong(bannedAt) }))}</div>`
      : '';
    main.innerHTML = `
      <div class="list-item-header">
        ${pileBadge}
        <span class="list-item-title">${escapeHtml(title)}${foil ? ' ✦' : ''}</span>
      </div>
      ${whenLine}
    `;
    const actions = document.createElement('div');
    actions.className = 'list-item-actions';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-sm btn-success';
    btn.textContent = t('bans.restore');
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await unbanCard(cardId);
      toast(t('bans.toast.restored'));
      render();
    });
    actions.appendChild(btn);
    div.appendChild(main);
    div.appendChild(actions);
    host.appendChild(div);
  }
}

export function mount() {
  document.getElementById('btn-back-home')?.addEventListener('click', () => navigate('home'));
  render();
  unsubscribe = on('state:banned-changed', render);
  on('i18n:change', render);
}

export function unmount() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
}
