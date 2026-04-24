// SPDX-License-Identifier: MIT
// History list grouped by relative date. Entries are clickable to replay a
// card in preview mode. Restoring banned cards lives in the Bans view.

import { getHistory, getCardById, getCardText } from '../../core/sync.js';
import { navigate } from '../../core/router.js';
import { t, fmtDateLong } from '../../core/i18n.js';
import { on } from '../../core/events.js';

let unsubscribe = null;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function groupByDate(history) {
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = today - 86400000;
  const weekAgo = today - 7 * 86400000;
  const monthAgo = today - 30 * 86400000;
  const buckets = {
    today:     { label: t('history.groups.today'),     items: [] },
    yesterday: { label: t('history.groups.yesterday'), items: [] },
    week:      { label: t('history.groups.week'),      items: [] },
    month:     { label: t('history.groups.month'),     items: [] },
    older:     { label: t('history.groups.older'),     items: [] },
  };
  history.forEach((entry, index) => {
    const tm = startOfDay(new Date(entry.drawnAt));
    let bucket;
    if (tm >= today) bucket = buckets.today;
    else if (tm >= yesterday) bucket = buckets.yesterday;
    else if (tm >= weekAgo) bucket = buckets.week;
    else if (tm >= monthAgo) bucket = buckets.month;
    else bucket = buckets.older;
    bucket.items.push({ entry, index });
  });
  return Object.values(buckets).filter((b) => b.items.length > 0);
}

function render() {
  const host = document.getElementById('history-list');
  if (!host) return;
  const history = getHistory();
  host.innerHTML = '';
  if (history.length === 0) {
    host.innerHTML = `<div class="empty">
      <div class="empty-icon">💝</div>
      <div class="empty-title">${escapeHtml(t('history.empty.title'))}</div>
      <div class="empty-hint">${escapeHtml(t('history.empty.hint'))}</div>
    </div>`;
    return;
  }

  for (const group of groupByDate(history)) {
    const header = document.createElement('div');
    header.className = 'history-group-header';
    header.textContent = group.label;
    host.appendChild(header);

    for (const { entry } of group.items) {
      const card = getCardById(entry.cardId);
      const title = card ? getCardText(card).title : t('history.card.deleted');
      const pile = card ? card.pile : null;
      const foil = !!card?.foil;

      const div = document.createElement('div');
      div.className = 'list-item';
      if (card) {
        div.classList.add('clickable');
        div.setAttribute('role', 'button');
        div.setAttribute('tabindex', '0');
        const replay = () => navigate('draw', { preview: entry.cardId });
        div.addEventListener('click', replay);
        div.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); replay(); }
        });
      }

      const row = document.createElement('div');
      row.className = 'list-item-row';
      const left = document.createElement('div');
      left.className = 'list-item-main';
      const pileBadge = pile
        ? `<span class="pile-badge ${pile}">${escapeHtml(t(`piles.${pile}.label`))}</span>`
        : '';
      left.innerHTML = `
        <div class="list-item-header">
          ${pileBadge}
          <span class="list-item-title">${escapeHtml(title)}${foil ? ' ✦' : ''}</span>
        </div>
        <div class="list-item-meta">${escapeHtml(t('history.entry.drawnAt', { when: fmtDateLong(entry.drawnAt) }))}</div>
      `;

      const right = document.createElement('div');
      right.className = 'list-item-right';
      const tag = document.createElement('span');
      tag.className = `stamp ${entry.action === 'returned' ? 'stamp-returned' : 'stamp-banned'}`;
      tag.textContent = t(entry.action === 'returned' ? 'history.action.returned' : 'history.action.banned');
      right.appendChild(tag);

      row.appendChild(left);
      row.appendChild(right);
      div.appendChild(row);
      host.appendChild(div);
    }
  }
}

export function mount() {
  render();
  unsubscribe = on('state:history-changed', render);
  document.getElementById('btn-back-home')?.addEventListener('click', () => navigate('home'));
  on('i18n:change', render);
}

export function unmount() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
}
