// SPDX-License-Identifier: MIT
// Per-user state synchronization: banned cards + play history.
// Mutations are idempotent so the frontend outbox can safely replay them.

import { getDb, transaction } from '../db/index.js';
import { requireSession, enforcePasswordChange } from '../lib/auth.js';

const HISTORY_CAP = 500;

const cardIdSchema = { type: 'string', pattern: '^[a-z0-9-]{1,64}$' };

export default async function syncRoutes(app) {
  // Single consolidated preHandler. See server/src/lib/auth.js for the
  // Fastify 5 pitfall (mixed sync/async preHandlers stall silently).
  app.addHook('preHandler', async (request, reply) => {
    await requireSession(request, reply);
    if (reply.sent) return;
    await enforcePasswordChange(request, reply);
  });

  app.get('/state', async (request) => {
    const db = getDb();
    const userId = request.currentUser.id;
    const banned = db.prepare(`
      SELECT card_id, banned_at FROM bans
      WHERE user_id = ? ORDER BY banned_at DESC, card_id ASC
    `).all(userId).map((r) => ({ cardId: r.card_id, bannedAt: r.banned_at }));
    const history = db.prepare(`
      SELECT id, card_id, action, drawn_at, client_uuid
      FROM history WHERE user_id = ? ORDER BY drawn_at DESC, id DESC LIMIT ?
    `).all(userId, HISTORY_CAP).map((r) => ({
      id: r.id,
      cardId: r.card_id,
      action: r.action,
      drawnAt: r.drawn_at,
      clientUuid: r.client_uuid,
    }));
    return { banned, history };
  });

  app.post('/bans', {
    schema: {
      body: {
        type: 'object',
        required: ['cardId'],
        additionalProperties: false,
        properties: { cardId: cardIdSchema },
      },
    },
  }, async (request, reply) => {
    const db = getDb();
    const card = db.prepare('SELECT id FROM cards WHERE id = ?').get(request.body.cardId);
    if (!card) return reply.code(404).send({ error: 'CARD_NOT_FOUND' });
    db.prepare(`
      INSERT OR IGNORE INTO bans (user_id, card_id) VALUES (?, ?)
    `).run(request.currentUser.id, request.body.cardId);
    const row = db.prepare(`
      SELECT banned_at FROM bans WHERE user_id = ? AND card_id = ?
    `).get(request.currentUser.id, request.body.cardId);
    return { cardId: request.body.cardId, bannedAt: row?.banned_at ?? null };
  });

  app.delete('/bans/:cardId', {
    schema: {
      params: {
        type: 'object',
        required: ['cardId'],
        additionalProperties: false,
        properties: { cardId: cardIdSchema },
      },
    },
  }, async (request) => {
    const db = getDb();
    db.prepare('DELETE FROM bans WHERE user_id = ? AND card_id = ?')
      .run(request.currentUser.id, request.params.cardId);
    return { ok: true };
  });

  app.post('/history', {
    schema: {
      body: {
        type: 'object',
        required: ['entries'],
        additionalProperties: false,
        properties: {
          entries: {
            type: 'array',
            maxItems: 100,
            items: {
              type: 'object',
              required: ['clientUuid', 'cardId', 'action', 'drawnAt'],
              additionalProperties: false,
              properties: {
                clientUuid: { type: 'string', minLength: 8, maxLength: 64 },
                cardId: cardIdSchema,
                action: { type: 'string', enum: ['returned', 'banned'] },
                drawnAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
    },
  }, async (request) => {
    const db = getDb();
    const userId = request.currentUser.id;
    const insert = db.prepare(`
      INSERT OR IGNORE INTO history (user_id, card_id, action, drawn_at, client_uuid)
      VALUES (?, ?, ?, ?, ?)
    `);
    transaction((entries) => {
      for (const entry of entries) {
        insert.run(userId, entry.cardId, entry.action, entry.drawnAt, entry.clientUuid);
      }
      // Enforce the per-user cap: keep only the 500 most recent rows.
      db.prepare(`
        DELETE FROM history WHERE user_id = ? AND id NOT IN (
          SELECT id FROM history WHERE user_id = ?
          ORDER BY drawn_at DESC, id DESC LIMIT ?
        )
      `).run(userId, userId, HISTORY_CAP);
    })(request.body.entries);
    return { ok: true };
  });
}
