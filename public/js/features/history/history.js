// SPDX-License-Identifier: MIT
// History list grouped by relative date. Entries are clickable to replay a
// card in preview mode. Banned-card restoration lives in the card preview
// opened from the Collection screen.

import { getHistory, getCardById, getCardText } from '../../core/sync.js';
import { navigate } from '../../core/router.js';
import { t, tn, fmtDateLong } from '../../core/i18n.js';
import { on } from '../../core/events.js';
import { escapeHtml } from '../../core/dom.js';

let unsubscribers = [];
// Persists across visits, like the Collection filter: aria-pressed is re-synced
// from it on every mount.
let currentFilter = 'all';

// Pile filters resolve the pile through the card, so entries whose card was
// deleted since only show under "All" and the action filters.
function matchesFilter(entry) {
  if (currentFilter === 'all') return true;
  if (currentFilter === 'returned' || currentFilter === 'banned') return entry.action === currentFilter;
  return getCardById(entry.cardId)?.pile === currentFilter;
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
  history.forEach((entry) => {
    const tm = startOfDay(new Date(entry.drawnAt));
    let bucket;
    if (tm >= today) bucket = buckets.today;
    else if (tm >= yesterday) bucket = buckets.yesterday;
    else if (tm >= weekAgo) bucket = buckets.week;
    else if (tm >= monthAgo) bucket = buckets.month;
    else bucket = buckets.older;
    bucket.items.push(entry);
  });
  return Object.values(buckets).filter((b) => b.items.length > 0);
}

function renderStats(history) {
  const el = document.getElementById('history-stats');
  if (!el) return;
  const bannedCount = history.filter((e) => e.action === 'banned').length;
  el.textContent = `${tn('history.stats.draws', history.length)} · ${tn('history.stats.banned', bannedCount)}`;
}

function render() {
  const host = document.getElementById('history-list');
  if (!host) return;
  const history = getHistory();
  const toolbar = document.getElementById('history-toolbar');
  if (toolbar) toolbar.hidden = history.length === 0;
  host.innerHTML = '';
  if (history.length === 0) {
    host.innerHTML = `<div class="empty">
      <div class="empty-icon" aria-hidden="true">💝</div>
      <div class="empty-title">${escapeHtml(t('history.empty.title'))}</div>
      <div class="empty-hint">${escapeHtml(t('history.empty.hint'))}</div>
    </div>`;
    return;
  }

  // The stats always cover the full history, regardless of the active filter,
  // so they read as a stable summary rather than a moving count.
  renderStats(history);

  const visible = history.filter(matchesFilter);
  if (visible.length === 0) {
    host.innerHTML = `<div class="empty">
      <div class="empty-icon" aria-hidden="true">💝</div>
      <div class="empty-title">${escapeHtml(t('history.empty.filter.title'))}</div>
      <div class="empty-hint">${escapeHtml(t('history.empty.filter.hint'))}</div>
    </div>`;
    return;
  }

  // Staggered entrance, capped so long histories never feel slow to load.
  let stagger = 0;
  for (const group of groupByDate(visible)) {
    const header = document.createElement('div');
    header.className = 'history-group-header';
    header.textContent = group.label;
    host.appendChild(header);

    for (const entry of group.items) {
      const card = getCardById(entry.cardId);
      const title = card ? getCardText(card).title : t('history.card.deleted');
      const pile = card ? card.pile : null;
      const foil = !!card?.foil;

      const div = document.createElement('div');
      div.className = 'list-item stagger-in';
      div.style.setProperty('--i', String(Math.min(stagger++, 8)));
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

function onFilterClick(event) {
  const btn = event.target.closest('[data-filter]');
  if (!btn) return;
  currentFilter = btn.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach((b) => {
    b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
  });
  render();
}

export function mount() {
  document.querySelector('.collection-filters')?.addEventListener('click', onFilterClick);
  document.querySelectorAll('[data-filter]').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.filter === currentFilter ? 'true' : 'false');
  });
  render();
  unsubscribers = [
    on('state:history-changed', render),
    on('i18n:change', render),
  ];
  document.getElementById('btn-back-home')?.addEventListener('click', () => navigate('home'));
}

export function unmount() {
  for (const fn of unsubscribers) fn();
  unsubscribers = [];
}
