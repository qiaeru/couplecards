// SPDX-License-Identifier: MIT
// Cards: read by any authenticated user, CRUD reserved to admin. The deck is
// multilingual: each card carries a `translations` map keyed by locale.

import { getDb } from '../db/index.js';
import { requireSession, requireAdmin, enforcePasswordChange } from '../lib/auth.js';
import { SUPPORTED_LOCALES } from '../lib/locales.js';

const CARD_ID_PATTERN = '^[a-z0-9-]{1,64}$';
const EMOJI_SLUG_PATTERN = '^[a-z0-9-]{1,64}$';
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 1000;

function selectCards() {
  const db = getDb();
  const cards = db.prepare(`
    SELECT id, pile, foil, emoji, sort_order, updated_at
    FROM cards ORDER BY sort_order ASC, id ASC
  `).all();
  const translations = db.prepare(`
    SELECT card_id, locale, title, description FROM card_translations
  `).all();
  const byId = new Map(cards.map((c) => [c.id, {
    id: c.id,
    pile: c.pile,
    foil: c.foil === 1,
    emoji: c.emoji ?? null,
    sortOrder: c.sort_order,
    updatedAt: c.updated_at,
    translations: Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l, null])),
  }]));
  for (const row of translations) {
    const card = byId.get(row.card_id);
    if (card) card.translations[row.locale] = { title: row.title, description: row.description };
  }
  return [...byId.values()];
}

function deckVersion() {
  const row = getDb().prepare(`
    SELECT
      COALESCE(MAX(strftime('%s', updated_at)), '0') AS v,
      COUNT(*) AS n
    FROM cards
  `).get();
  const trCount = getDb().prepare('SELECT COUNT(*) AS n FROM card_translations').get().n;
  return `${row.v}-${row.n}-${trCount}`;
}

const translationSchema = {
  type: 'object',
  required: ['title', 'description'],
  properties: {
    title: { type: 'string', minLength: 1, maxLength: TITLE_MAX },
    description: { type: 'string', minLength: 1, maxLength: DESCRIPTION_MAX },
  },
  additionalProperties: false,
};

const translationsShape = {
  type: 'object',
  properties: Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l, translationSchema])),
  additionalProperties: false,
};

export default async function cardRoutes(app) {
  app.get('/cards', {
    preHandler: async (request, reply) => {
      await requireSession(request, reply);
      if (reply.sent) return;
      await enforcePasswordChange(request, reply);
    },
  }, async (request, reply) => {
    const version = deckVersion();
    if (request.headers['if-none-match'] === `"${version}"`) {
      reply.code(304);
      return null;
    }
    reply.header('ETag', `"${version}"`);
    reply.header('Cache-Control', 'private, must-revalidate');
    return { version, cards: selectCards() };
  });

  app.post('/cards', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        required: ['id', 'pile', 'translations'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', pattern: CARD_ID_PATTERN },
          pile: { type: 'string', enum: ['home', 'outdoor'] },
          foil: { type: 'boolean' },
          emoji: { type: ['string', 'null'], pattern: EMOJI_SLUG_PATTERN },
          sortOrder: { type: 'integer' },
          translations: translationsShape,
        },
      },
    },
  }, async (request, reply) => {
    const { id, pile, foil = false, emoji = null, sortOrder, translations } = request.body;
    if (!hasAnyTranslation(translations)) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR' });
    }
    const db = getDb();
    try {
      db.exec('BEGIN');
      db.prepare(`
        INSERT INTO cards (id, pile, foil, emoji, sort_order)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, pile, foil ? 1 : 0, emoji ?? null, sortOrder ?? Date.now());
      writeTranslations(db, id, translations);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
        return reply.code(409).send({ error: 'CARD_ID_EXISTS' });
      }
      throw err;
    }
    return selectCard(id);
  });

  app.patch('/cards/:id', {
    preHandler: requireAdmin,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: { id: { type: 'string', pattern: CARD_ID_PATTERN } },
      },
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          pile: { type: 'string', enum: ['home', 'outdoor'] },
          foil: { type: 'boolean' },
          emoji: { type: ['string', 'null'], pattern: EMOJI_SLUG_PATTERN },
          sortOrder: { type: 'integer' },
          translations: translationsShape,
        },
      },
    },
  }, async (request, reply) => {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM cards WHERE id = ?').get(request.params.id);
    if (!existing) return reply.code(404).send({ error: 'CARD_NOT_FOUND' });

    const updates = [];
    const args = [];
    if (request.body.pile !== undefined) { updates.push('pile = ?'); args.push(request.body.pile); }
    if (request.body.foil !== undefined) { updates.push('foil = ?'); args.push(request.body.foil ? 1 : 0); }
    if (request.body.emoji !== undefined) { updates.push('emoji = ?'); args.push(request.body.emoji ?? null); }
    if (request.body.sortOrder !== undefined) { updates.push('sort_order = ?'); args.push(request.body.sortOrder); }

    try {
      db.exec('BEGIN');
      // Always bump updated_at when anything changes, including a translation-
      // only edit. card_translations has no updated_at column and an UPSERT
      // doesn't change the row count, so without this the deck ETag would not
      // invalidate and clients (SW + IDB) would stay on the stale text.
      if (updates.length > 0 || request.body.translations) {
        updates.push("updated_at = datetime('now')");
        args.push(request.params.id);
        db.prepare(`UPDATE cards SET ${updates.join(', ')} WHERE id = ?`).run(...args);
      }
      if (request.body.translations) {
        writeTranslations(db, request.params.id, request.body.translations);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return selectCard(request.params.id);
  });

  app.delete('/cards/:id', {
    preHandler: requireAdmin,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: { id: { type: 'string', pattern: CARD_ID_PATTERN } },
      },
    },
  }, async (request, reply) => {
    const info = getDb().prepare('DELETE FROM cards WHERE id = ?').run(request.params.id);
    if (info.changes === 0) return reply.code(404).send({ error: 'CARD_NOT_FOUND' });
    return { ok: true };
  });
}

function hasAnyTranslation(translations) {
  if (!translations) return false;
  return SUPPORTED_LOCALES.some((l) => translations[l]?.title && translations[l]?.description);
}

function writeTranslations(db, cardId, translations) {
  const upsert = db.prepare(`
    INSERT INTO card_translations (card_id, locale, title, description)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(card_id, locale) DO UPDATE SET
      title = excluded.title,
      description = excluded.description
  `);
  for (const locale of SUPPORTED_LOCALES) {
    const t = translations[locale];
    if (!t) continue;
    upsert.run(cardId, locale, t.title.trim(), t.description.trim());
  }
}

function selectCard(id) {
  const db = getDb();
  const c = db.prepare(`
    SELECT id, pile, foil, emoji, sort_order, updated_at
    FROM cards WHERE id = ?
  `).get(id);
  if (!c) return null;
  const translations = Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l, null]));
  const rows = db.prepare(`
    SELECT locale, title, description FROM card_translations WHERE card_id = ?
  `).all(id);
  for (const row of rows) translations[row.locale] = { title: row.title, description: row.description };
  return {
    id: c.id,
    pile: c.pile,
    foil: c.foil === 1,
    emoji: c.emoji ?? null,
    sortOrder: c.sort_order,
    updatedAt: c.updated_at,
    translations,
  };
}
