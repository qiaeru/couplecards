// SPDX-License-Identifier: MIT
// Collection screen: full-deck grid with discovered, banned and locked states.
// Drawn cards open the existing preview screen; banned-card management lives
// in that preview, so this module is read-only.

import { getCards, getCardText, getHistory, isBanned } from '../../core/sync.js';
import { navigate } from '../../core/router.js';
import { t } from '../../core/i18n.js';
import { on } from '../../core/events.js';
import { createEmojiImg } from '../../ui/emoji.js';
import { escapeHtml } from '../../core/dom.js';

let unsubscribe = [];
let currentFilter = 'all';
let lastSeenCount = null;
let freshIds = new Set();

// A card is "discovered" once it has appeared at least once in the user's
// history, regardless of whether that draw ended in a return or a ban.
function discoveredIds() {
  const ids = new Set();
  for (const entry of getHistory()) ids.add(entry.cardId);
  return ids;
}

function buildCardFront(card, title, description, locale) {
  const front = document.createElement('div');
  front.className = 'card-face card-front';
  front.classList.add(card.pile === 'home' ? 'for-home' : 'for-outdoor');
  if (card.foil) front.classList.add('is-foil');

  const frame = document.createElement('div');
  frame.className = 'card-frame';

  const pileLabel = document.createElement('div');
  pileLabel.className = 'card-pile-label';
  pileLabel.textContent = t(`piles.${card.pile}.label`);

  const art = document.createElement('div');
  art.className = 'card-art';
  const emojiSpan = document.createElement('span');
  emojiSpan.className = 'card-art-emoji';
  emojiSpan.appendChild(createEmojiImg(card.emoji || (card.pile === 'home' ? 'house' : 'city')));
  art.appendChild(emojiSpan);

  const titleEl = document.createElement('h3');
  titleEl.className = 'card-title';
  titleEl.textContent = title;
  titleEl.setAttribute('lang', locale);

  const divider = document.createElement('div');
  divider.className = 'card-divider';
  divider.setAttribute('aria-hidden', 'true');
  const ornament = document.createElement('span');
  ornament.className = 'card-divider-ornament';
  const heart = document.createElement('img');
  heart.className = 'heart-icon';
  heart.src = '/icons/heart-gold.svg';
  heart.alt = '';
  heart.draggable = false;
  ornament.appendChild(heart);
  divider.appendChild(ornament);

  const desc = document.createElement('p');
  desc.className = 'card-description';
  desc.textContent = description;
  desc.setAttribute('lang', locale);

  const footer = document.createElement('div');
  footer.className = 'card-footer-mark';
  footer.setAttribute('aria-hidden', 'true');
  footer.textContent = '·  ·  ·';

  frame.append(pileLabel, art, titleEl, divider, desc, footer);
  front.appendChild(frame);
  return front;
}

function buildTile(card, discovered) {
  const banned = isBanned(card.id);
  const tile = document.createElement('div');
  tile.className = 'coll-tile';
  tile.classList.add(card.pile === 'home' ? 'for-home' : 'for-outdoor');
  if (card.foil) tile.classList.add('is-foil');
  if (!discovered) tile.classList.add('is-locked');
  if (banned) tile.classList.add('is-banned');

  if (discovered) {
    if (freshIds.has(card.id)) tile.classList.add('is-fresh');
    const { title, description, locale } = getCardText(card);
    tile.setAttribute('role', 'button');
    tile.setAttribute('tabindex', '0');
    tile.setAttribute('aria-label', t(banned ? 'collection.tile.banned.label' : 'collection.tile.drawn.label', { title }));
    const open = () => navigate('draw', { preview: card.id });
    tile.addEventListener('click', open);
    tile.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
    tile.appendChild(buildCardFront(card, title, description, locale));
    if (banned) {
      const cross = document.createElement('div');
      cross.className = 'coll-tile-cross';
      cross.setAttribute('aria-hidden', 'true');
      cross.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>';
      tile.appendChild(cross);
    }
  } else {
    tile.setAttribute('aria-label', t('collection.tile.locked.label'));
    const placeholder = document.createElement('div');
    placeholder.className = 'coll-tile-placeholder';
    placeholder.textContent = t('collection.tile.locked.placeholder');
    placeholder.setAttribute('aria-hidden', 'true');
    tile.appendChild(placeholder);
  }
  return tile;
}

// Slot-machine reveal for the discovered count: cycle through random digits
// for ~600ms before settling, with the same digit count as the target so the
// width stays stable. Skipped under prefers-reduced-motion.
function cipherIn(el, target, durationMs = 600) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) { el.textContent = String(target); return; }
  const len = String(Math.max(target, 1)).length;
  const start = performance.now();
  const tick = () => {
    if (!el.isConnected) return;
    const elapsed = performance.now() - start;
    if (elapsed >= durationMs) { el.textContent = String(target); return; }
    let s = '';
    for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 10);
    el.textContent = s;
    setTimeout(tick, 45);
  };
  tick();
}

function buildCounter(host, seen, total, animate) {
  host.replaceChildren();
  const numEl = document.createElement('span');
  numEl.className = 'counter-num';
  numEl.textContent = String(seen);
  const sepEl = document.createElement('span');
  sepEl.className = 'counter-sep';
  sepEl.textContent = '/';
  const totalEl = document.createElement('span');
  totalEl.className = 'counter-total';
  totalEl.textContent = String(total);
  const labelEl = document.createElement('span');
  labelEl.className = 'counter-label';
  labelEl.textContent = t('collection.counter.label');
  host.append(numEl, sepEl, totalEl, labelEl);
  if (animate) cipherIn(numEl, seen);
}

function render() {
  const grid = document.getElementById('collection-grid');
  const counter = document.getElementById('collection-counter');
  if (!grid || !counter) return;

  const cards = getCards();
  const discovered = discoveredIds();
  let filtered;
  if (currentFilter === 'all') filtered = cards;
  else if (currentFilter === 'rare') filtered = cards.filter((c) => c.foil);
  else filtered = cards.filter((c) => c.pile === currentFilter);

  const total = filtered.length;
  const seen = filtered.filter((c) => discovered.has(c.id)).length;
  const animate = lastSeenCount !== seen;
  lastSeenCount = seen;
  buildCounter(counter, seen, total, animate);

  grid.innerHTML = '';
  if (cards.length === 0) {
    grid.innerHTML = `<div class="empty">
      <div class="empty-icon" aria-hidden="true">🎴</div>
      <div class="empty-title">${escapeHtml(t('collection.empty.title'))}</div>
      <div class="empty-hint">${escapeHtml(t('collection.empty.hint'))}</div>
    </div>`;
    return;
  }
  const frag = document.createDocumentFragment();
  for (const card of filtered) {
    frag.appendChild(buildTile(card, discovered.has(card.id)));
  }
  grid.appendChild(frag);
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
  document.getElementById('btn-back-home')?.addEventListener('click', () => navigate('home'));
  document.querySelector('.collection-filters')?.addEventListener('click', onFilterClick);
  document.querySelectorAll('[data-filter]').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.filter === currentFilter ? 'true' : 'false');
  });

  // The most recently drawn card pulses so the user can spot it immediately
  // after a draw. Cleared on unmount so it does not stick across visits when
  // no fresh draw happened in between.
  const recentDraw = getHistory()[0]?.cardId;
  freshIds = recentDraw ? new Set([recentDraw]) : new Set();

  // Force the counter to run its cipher reveal on entry.
  lastSeenCount = null;
  render();
  unsubscribe.push(on('state:banned-changed', render));
  unsubscribe.push(on('state:history-changed', render));
  unsubscribe.push(on('i18n:change', render));
}

export function unmount() {
  unsubscribe.forEach((u) => u && u());
  unsubscribe = [];
  freshIds = new Set();
}
