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
      <div class="empty-icon">🌿</div>
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
    const row = document.createElement('div');
    row.className = 'list-item-row';
    const left = document.createElement('div');
    left.className = 'list-item-main';
    const pileBadge = pile
      ? `<span class="pile-badge ${pile}">${escapeHtml(t(`piles.${pile}.label`))}</span>`
      : '';
    const whenLine = bannedAt
      ? `<div class="list-item-meta">${escapeHtml(t('bans.entry.bannedAt', { when: fmtDateLong(bannedAt) }))}</div>`
      : '';
    left.innerHTML = `
      <div class="list-item-header">
        ${pileBadge}
        <span class="list-item-title">${escapeHtml(title)}${foil ? ' ✦' : ''}</span>
      </div>
      ${whenLine}
    `;
    const right = document.createElement('div');
    right.className = 'list-item-right';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-success';
    btn.textContent = t('bans.restore');
    btn.addEventListener('click', async () => {
      await unbanCard(cardId);
      toast(t('bans.toast.restored'));
      render();
    });
    right.appendChild(btn);
    row.appendChild(left);
    row.appendChild(right);
    div.appendChild(row);
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
