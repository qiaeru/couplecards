// SPDX-License-Identifier: MIT
// Reads seed / uploaded decks, diffs them against the live DB, and applies
// mirror or upsert merges in a single transaction. Structural fields (id,
// pile, foil, sort_order) live in `cards`; titles and descriptions live in
// `card_translations` keyed by locale.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { config } from '../config.js';
import { getDb, transaction } from '../db/index.js';
import { SUPPORTED_LOCALES } from './locales.js';

const PILES = new Set(['home', 'outdoor']);
const ID_RE = /^[a-z0-9-]{1,64}$/;
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 1000;
const SEED_FILE_PATTERN = /^cards\.([a-z]{2})\.json$/i;

// Reads and merges every supported cards.<locale>.json under DATA_SEED_DIR.
// The `relative()` check is defense in depth on top of SEED_FILE_PATTERN, in
// case DATA_SEED_DIR ever points at a tree with symlinks escaping the dir.
export function readSeedDecks() {
  const dir = resolve(config.dataSeedDir);
  if (!existsSync(dir)) throw deckError('SEED_FILE_NOT_FOUND');
  const byId = new Map();
  let firstLocale = null;
  let filesRead = 0;
  for (const file of readdirSync(dir)) {
    const match = SEED_FILE_PATTERN.exec(file);
    if (!match) continue;
    const locale = match[1].toLowerCase();
    if (!SUPPORTED_LOCALES.includes(locale)) continue;
    const absolute = resolve(dir, file);
    const rel = relative(dir, absolute);
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
      throw deckError('INVALID_DECK');
    }
    let payload;
    try {
      payload = JSON.parse(readFileSync(absolute, 'utf8'));
    } catch {
      throw deckError('INVALID_DECK');
    }
    if (!Array.isArray(payload?.cards)) throw deckError('INVALID_DECK');
    if (firstLocale === null) firstLocale = locale;
    mergeLocaleIntoMap(byId, locale, payload.cards, locale === firstLocale);
    filesRead += 1;
  }
  if (filesRead === 0) throw deckError('SEED_FILE_NOT_FOUND');
  return finaliseDeck(byId);
}

// Accepts { version, cardsByLocale: { <locale>: [...] } } (seed shape) or
// { version, cards: [{ ..., translations }] } (internal shape).
export function validateDeckPayload(payload) {
  if (!payload || typeof payload !== 'object') throw deckError('INVALID_DECK');
  if (payload.cardsByLocale && typeof payload.cardsByLocale === 'object') {
    const byId = new Map();
    let firstLocale = null;
    for (const [locale, list] of Object.entries(payload.cardsByLocale)) {
      if (!SUPPORTED_LOCALES.includes(locale)) continue;
      if (!Array.isArray(list)) throw deckError('INVALID_DECK');
      if (firstLocale === null) firstLocale = locale;
      mergeLocaleIntoMap(byId, locale, list, locale === firstLocale);
    }
    if (byId.size === 0) throw deckError('INVALID_DECK');
    return finaliseDeck(byId);
  }
  if (Array.isArray(payload.cards)) {
    const deck = payload.cards.map((raw, index) => {
      if (!raw || typeof raw !== 'object') throw deckError('INVALID_DECK');
      ensureStructural(raw);
      const translations = raw.translations && typeof raw.translations === 'object' ? raw.translations : {};
      const out = {};
      for (const locale of SUPPORTED_LOCALES) {
        const t = translations[locale];
        if (!t) continue;
        out[locale] = readTranslation(t);
      }
      if (Object.keys(out).length === 0) throw deckError('INVALID_DECK');
      return {
        id: raw.id,
        pile: raw.pile,
        foil: !!raw.foil,
        sortOrder: Number.isInteger(raw.sortOrder) ? raw.sortOrder : index,
        translations: out,
      };
    });
    const seen = new Set();
    for (const card of deck) {
      if (seen.has(card.id)) throw deckError('INVALID_DECK');
      seen.add(card.id);
    }
    return deck;
  }
  throw deckError('INVALID_DECK');
}

export function readDbDeck() {
  const cards = getDb().prepare(`
    SELECT id, pile, foil, sort_order
    FROM cards ORDER BY sort_order ASC, id ASC
  `).all();
  const tr = getDb().prepare(`
    SELECT card_id, locale, title, description FROM card_translations
  `).all();
  const byId = new Map(cards.map((c) => [c.id, {
    id: c.id,
    pile: c.pile,
    foil: c.foil === 1,
    sortOrder: c.sort_order,
    translations: {},
  }]));
  for (const row of tr) {
    const card = byId.get(row.card_id);
    if (card) card.translations[row.locale] = { title: row.title, description: row.description };
  }
  return [...byId.values()];
}

export function diffDecks(current, next) {
  const currentMap = new Map(current.map((c) => [c.id, c]));
  const nextMap = new Map(next.map((c) => [c.id, c]));
  const added = [];
  const updated = [];
  const removed = [];
  const unchanged = [];
  for (const n of next) {
    const c = currentMap.get(n.id);
    if (!c) {
      added.push(n.id);
      continue;
    }
    if (
      c.pile !== n.pile
      || c.foil !== n.foil
      || c.sortOrder !== n.sortOrder
      || !sameTranslations(c.translations, n.translations)
    ) {
      updated.push(n.id);
    } else {
      unchanged.push(n.id);
    }
  }
  for (const c of current) {
    if (!nextMap.has(c.id)) removed.push(c.id);
  }
  return { added, updated, removed, unchanged };
}

// `mirror` deletes DB-only rows; `upsert` keeps them.
export function applyDeckSync(nextCards, mode) {
  if (mode !== 'mirror' && mode !== 'upsert') throw deckError('INVALID_MODE');
  const current = readDbDeck();
  const diff = diffDecks(current, nextCards);
  const db = getDb();
  const insertCard = db.prepare(`
    INSERT INTO cards (id, pile, foil, sort_order)
    VALUES (?, ?, ?, ?)
  `);
  const updateCard = db.prepare(`
    UPDATE cards SET pile = ?, foil = ?, sort_order = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  const deleteCard = db.prepare('DELETE FROM cards WHERE id = ?');
  const replaceTr = db.prepare(`
    INSERT OR REPLACE INTO card_translations (card_id, locale, title, description)
    VALUES (?, ?, ?, ?)
  `);
  const deleteTr = db.prepare('DELETE FROM card_translations WHERE card_id = ? AND locale = ?');

  const run = transaction(() => {
    const map = new Map(nextCards.map((c) => [c.id, c]));
    for (const id of diff.added) {
      const c = map.get(id);
      insertCard.run(c.id, c.pile, c.foil ? 1 : 0, c.sortOrder);
      for (const locale of SUPPORTED_LOCALES) {
        const t = c.translations[locale];
        if (t) replaceTr.run(c.id, locale, t.title, t.description);
      }
    }
    for (const id of diff.updated) {
      const c = map.get(id);
      updateCard.run(c.pile, c.foil ? 1 : 0, c.sortOrder, c.id);
      for (const locale of SUPPORTED_LOCALES) {
        const t = c.translations[locale];
        if (t) {
          replaceTr.run(c.id, locale, t.title, t.description);
        } else {
          deleteTr.run(c.id, locale);
        }
      }
    }
    if (mode === 'mirror') {
      for (const id of diff.removed) deleteCard.run(id);
    }
  });
  run();

  return {
    added: diff.added.length,
    updated: diff.updated.length,
    removed: mode === 'mirror' ? diff.removed.length : 0,
    unchanged: diff.unchanged.length,
    keptOutsideFile: mode === 'upsert' ? diff.removed.length : 0,
  };
}

export function summariseDiff(current, next, mode) {
  const diff = diffDecks(current, next);
  return {
    added: diff.added.length,
    updated: diff.updated.length,
    removed: mode === 'mirror' ? diff.removed.length : 0,
    unchanged: diff.unchanged.length,
    keptOutsideFile: mode === 'upsert' ? diff.removed.length : 0,
  };
}

// Returns { <locale>: [cards...] } in the flat seed-file shape. A card is
// skipped for locales that have no translation.
export function serialiseForExport() {
  const deck = readDbDeck();
  const byLocale = Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l, []]));
  for (const card of deck) {
    for (const locale of SUPPORTED_LOCALES) {
      const t = card.translations[locale];
      if (!t) continue;
      const row = {
        id: card.id,
        pile: card.pile,
        title: t.title,
        description: t.description,
      };
      if (card.foil) row.foil = true;
      byLocale[locale].push(row);
    }
  }
  return byLocale;
}

function mergeLocaleIntoMap(byId, locale, rawCards, anchor) {
  rawCards.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') throw deckError('INVALID_DECK');
    ensureStructural(raw);
    const text = readTranslation(raw);
    const existing = byId.get(raw.id);
    if (existing) {
      if (existing.pile !== raw.pile || existing.foil !== !!raw.foil) {
        throw deckError('INVALID_DECK');
      }
      existing.translations[locale] = text;
      if (anchor) existing.sortOrder = index;
    } else {
      byId.set(raw.id, {
        id: raw.id,
        pile: raw.pile,
        foil: !!raw.foil,
        sortOrder: anchor ? index : Number.MAX_SAFE_INTEGER,
        translations: { [locale]: text },
      });
    }
  });
}

function finaliseDeck(byId) {
  const deck = [...byId.values()];
  deck.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  deck.forEach((card, index) => { card.sortOrder = index; });
  return deck;
}

function ensureStructural(raw) {
  if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) throw deckError('INVALID_DECK');
  if (!PILES.has(raw.pile)) throw deckError('INVALID_DECK');
  if (raw.foil !== undefined && typeof raw.foil !== 'boolean') throw deckError('INVALID_DECK');
}

function readTranslation(raw) {
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  if (!title || title.length > TITLE_MAX) throw deckError('INVALID_DECK');
  if (!description || description.length > DESCRIPTION_MAX) throw deckError('INVALID_DECK');
  return { title, description };
}

function sameTranslations(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (!a[k] || !b[k]) return false;
    if (a[k].title !== b[k].title || a[k].description !== b[k].description) return false;
  }
  return true;
}

function deckError(code) {
  const err = new Error(code);
  err.deckCode = code;
  return err;
}
