// SPDX-License-Identifier: MIT
// Offline-first state: optimistic IDB writes, queued server sync, multilingual
// cards with per-locale `translations`.

import { request, ApiError } from './api.js';
import { idb } from './idb.js';
import { emit } from './events.js';
import { getLocale } from './i18n.js';

const HISTORY_CAP = 500;
const FALLBACK_LOCALE = 'en';

let cards = [];
// Map<cardId, bannedAt>; Map keeps the backend's banned_at DESC order.
let banned = new Map();
let history = [];
let initialized = false;
let flushing = false;

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return [...bytes].map((b, i) => {
    const h = b.toString(16).padStart(2, '0');
    return (i === 4 || i === 6 || i === 8 || i === 10) ? `-${h}` : h;
  }).join('');
}

async function loadCardsFromApiOrCache() {
  const cachedVersion = await idb.getCardsVersion();
  try {
    const headers = cachedVersion ? { 'if-none-match': `"${cachedVersion}"` } : {};
    // 10 s timeout: a stalled server shouldn't block the boot skeleton forever.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let resp;
    try {
      resp = await fetch('/api/cards', {
        credentials: 'same-origin',
        headers,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (resp.status === 304) {
      cards = await idb.getCards();
      return cards;
    }
    if (!resp.ok) throw new ApiError('CARDS_FETCH_FAILED', resp.status);
    const data = await resp.json();
    cards = data.cards || [];
    await idb.putCards(cards, data.version);
    return cards;
  } catch (err) {
    const cached = await idb.getCards();
    if (cached.length > 0) {
      cards = cached;
      return cards;
    }
    throw err;
  }
}

// Accept both the current [{ cardId, bannedAt }] and the legacy [cardId]
// shape that may still live in IndexedDB after an upgrade.
function normaliseBanned(list) {
  const map = new Map();
  for (const entry of list || []) {
    if (typeof entry === 'string') map.set(entry, null);
    else if (entry && typeof entry === 'object') map.set(entry.cardId, entry.bannedAt ?? null);
  }
  return map;
}

function bannedToList() {
  return [...banned.entries()].map(([cardId, bannedAt]) => ({ cardId, bannedAt }));
}

async function loadStateFromApiOrCache() {
  try {
    const data = await request('/api/state');
    banned = normaliseBanned(data.banned);
    history = data.history;
    await idb.setBanned(bannedToList());
    await idb.setHistory(history);
  } catch (err) {
    const cached = await idb.getState();
    banned = normaliseBanned(cached.banned);
    history = cached.history;
    if (err?.status && err.status !== 0) throw err;
  }
}

export async function initSync() {
  if (initialized) return;
  await loadCardsFromApiOrCache();
  await loadStateFromApiOrCache();
  initialized = true;
  emit('sync:ready');
  flushOutbox().catch(() => {});
  window.addEventListener('online', () => { flushOutbox().catch(() => {}); });
}

export function getCards() { return cards; }
export function getBanned() { return bannedToList(); }
export function isBanned(cardId) { return banned.has(cardId); }
export function getHistory() { return history.slice(); }
export function bannedAtOf(cardId) { return banned.get(cardId) ?? null; }

export function getCardById(id) {
  return cards.find((c) => c.id === id) || null;
}

// Picks a translation for `locale`, falls back to English then any available.
// Also handles the legacy `{title, description}` shape so a stale /api/cards
// cache from a previous version never leaves the lists blank. The returned
// `locale` reflects what the caller actually got, which lets views tag the
// rendered text with `lang` so screen readers switch voice on fallback.
export function getCardText(card, locale = getLocale()) {
  const placeholder = { title: '', description: '', locale };
  if (!card) return placeholder;
  if (card.translations) {
    if (card.translations[locale]) {
      return { ...card.translations[locale], locale };
    }
    if (card.translations[FALLBACK_LOCALE]) {
      return { ...card.translations[FALLBACK_LOCALE], locale: FALLBACK_LOCALE };
    }
    const [effectiveLocale, t] = Object.entries(card.translations).find(([, v]) => v) || [];
    if (t) return { ...t, locale: effectiveLocale };
  }
  if (card.title || card.description) {
    return { title: card.title ?? '', description: card.description ?? '', locale };
  }
  return placeholder;
}

export function availableCards(pile) {
  return cards.filter((c) => c.pile === pile && !banned.has(c.id));
}

export function countsByPile() {
  const counts = { home: 0, outdoor: 0 };
  for (const c of cards) {
    if (!banned.has(c.id) && counts[c.pile] !== undefined) counts[c.pile]++;
  }
  return counts;
}

export function totalByPile() {
  const counts = { home: 0, outdoor: 0 };
  for (const c of cards) {
    if (counts[c.pile] !== undefined) counts[c.pile]++;
  }
  return counts;
}

// Foil cards (the "rare" variant reserved for explicitly sexual content) are
// intentionally drawn less often than standard cards so the rarity stays
// earned even when their share of the deck is large. Effective draw rate of
// foils ≈ (foilCount × FOIL_WEIGHT) / (standardCount + foilCount × FOIL_WEIGHT).
const FOIL_WEIGHT = 0.3;

export function drawRandom(pile, recentIds = []) {
  const pool = availableCards(pile);
  if (pool.length === 0) return null;
  const recent = new Set(recentIds);
  const filtered = pool.filter((c) => !recent.has(c.id));
  const finalPool = filtered.length > 0 ? filtered : pool;
  const totalWeight = finalPool.reduce((s, c) => s + (c.foil ? FOIL_WEIGHT : 1), 0);
  let r = Math.random() * totalWeight;
  for (const c of finalPool) {
    r -= c.foil ? FOIL_WEIGHT : 1;
    if (r <= 0) return c;
  }
  return finalPool[finalPool.length - 1];
}

export async function banCard(cardId) {
  // Optimistic timestamp; server truth lands on the next state load.
  banned.set(cardId, new Date().toISOString());
  await idb.setBanned(bannedToList());
  emit('state:banned-changed');
  await idb.enqueue({ kind: 'ban', cardId });
  flushOutbox().catch(() => {});
}

export async function unbanCard(cardId) {
  banned.delete(cardId);
  await idb.setBanned(bannedToList());
  emit('state:banned-changed');
  await idb.enqueue({ kind: 'unban', cardId });
  flushOutbox().catch(() => {});
}

export async function addHistory(entry) {
  const full = {
    clientUuid: uuid(),
    cardId: entry.cardId,
    action: entry.action,
    drawnAt: entry.drawnAt || new Date().toISOString(),
  };
  history = [full, ...history].slice(0, HISTORY_CAP);
  await idb.setHistory(history);
  emit('state:history-changed');
  await idb.enqueue({ kind: 'history', entry: full });
  flushOutbox().catch(() => {});
  return full;
}

// Remove a history entry locally by its clientUuid. Used by the ban-undo flow
// so reverting a ban also removes the matching history row.
export async function removeHistoryByUuid(clientUuid) {
  const before = history.length;
  history = history.filter((e) => e.clientUuid !== clientUuid);
  if (history.length === before) return;
  await idb.setHistory(history);
  emit('state:history-changed');
}

export async function resetUserData() {
  await request('/api/state/reset', { method: 'POST' });
  banned = new Map();
  history = [];
  await idb.clearState();
  emit('state:banned-changed');
  emit('state:history-changed');
}

export async function clearAllLocalState() {
  banned = new Map();
  history = [];
  await idb.clearAll();
  emit('state:cleared');
}

async function flushOutbox() {
  if (flushing) return;
  if (!navigator.onLine) return;
  flushing = true;
  try {
    const items = await idb.listOutbox();
    if (!items.length) return;
    const historyBatch = [];
    for (const item of items) {
      try {
        if (item.kind === 'ban') {
          const resp = await request('/api/bans', { method: 'POST', body: { cardId: item.cardId } });
          if (resp && resp.bannedAt && banned.has(item.cardId)) {
            banned.set(item.cardId, resp.bannedAt);
            await idb.setBanned(bannedToList());
            emit('state:banned-changed');
          }
        } else if (item.kind === 'unban') {
          await request(`/api/bans/${encodeURIComponent(item.cardId)}`, { method: 'DELETE' });
        } else if (item.kind === 'history') {
          historyBatch.push({ item, entry: item.entry });
          continue;
        }
        await idb.removeOutbox(item.id);
      } catch (err) {
        // 401 or transient failure: stop here, the next online event retries.
        if (err?.status === 401) return;
        return;
      }
    }
    if (historyBatch.length > 0) {
      try {
        await request('/api/history', {
          method: 'POST',
          body: { entries: historyBatch.map((b) => b.entry) },
        });
        for (const { item } of historyBatch) {
          await idb.removeOutbox(item.id);
        }
      } catch (err) {
        if (err?.status === 401) return;
      }
    }
    emit('sync:flushed');
  } finally {
    flushing = false;
  }
}

export { flushOutbox };
