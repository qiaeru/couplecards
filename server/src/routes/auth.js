// SPDX-License-Identifier: MIT
// Auth routes: login, logout, me, change-password, preferences, csrf, policy.

import { getDb } from '../db/index.js';
import { hashPassword, verifyPassword, validatePassword, POLICY } from '../lib/password.js';
import { readSessionUser, writeSessionUser, clearSession, requireSession } from '../lib/auth.js';
import { SUPPORTED_LOCALES } from '../lib/locales.js';

const LOCKOUT_THRESHOLD = 10;
const LOCKOUT_MINUTES = 15;

const usernameSchema = {
  type: 'string',
  minLength: 3,
  maxLength: 32,
  pattern: '^[a-z0-9._-]+$',
};

const passwordSchema = { type: 'string', minLength: 8, maxLength: 200 };
// Login and the `currentPassword` field of change-password accept any
// non-empty value: the strength policy is enforced on the new password, and
// short legacy/demo passwords must still be able to authenticate (and to
// reach the demo readonly check, which would otherwise be shadowed by a
// schema validation error).
const currentPasswordSchema = { type: 'string', minLength: 1, maxLength: 200 };

export default async function authRoutes(app) {
  // Token used by the frontend for the x-csrf-token header on mutating requests.
  app.get('/auth/csrf', async (request, reply) => {
    const token = await reply.generateCsrf();
    return { token };
  });

  app.get('/auth/password-policy', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            minLength: { type: 'integer' },
            requireUpper: { type: 'boolean' },
            requireLower: { type: 'boolean' },
            requireDigit: { type: 'boolean' },
            requireSpecial: { type: 'boolean' },
            zxcvbnMinScoreAdmin: { type: 'integer' },
            zxcvbnMinScoreUser: { type: 'integer' },
          },
        },
      },
    },
  }, async () => POLICY);

  app.post('/auth/login', {
    config: {
      rateLimit: { max: 5, timeWindow: '1 minute' },
    },
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        additionalProperties: false,
        properties: {
          username: usernameSchema,
          password: currentPasswordSchema,
        },
      },
    },
  }, async (request, reply) => {
    const db = getDb();
    const username = String(request.body.username).trim().toLowerCase();
    const password = request.body.password;

    const row = db.prepare(`
      SELECT id, username, password_hash, role, must_change_password, is_demo,
             session_epoch, failed_attempts, locked_until, locale
      FROM users WHERE username = ?
    `).get(username);

    if (!row) {
      // Generic message — do not leak which side failed.
      return reply.code(401).send({ error: 'INVALID_CREDENTIALS' });
    }

    if (row.locked_until) {
      const unlockAt = new Date(row.locked_until + 'Z');
      if (unlockAt > new Date()) {
        return reply.code(423).send({ error: 'ACCOUNT_LOCKED', details: { unlockAt: unlockAt.toISOString() } });
      }
    }

    const ok = await verifyPassword(row.password_hash, password);
    if (!ok) {
      const attempts = row.failed_attempts + 1;
      if (attempts >= LOCKOUT_THRESHOLD) {
        const until = new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
          .toISOString().replace('T', ' ').slice(0, 19);
        db.prepare(`
          UPDATE users SET failed_attempts = ?, locked_until = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(attempts, until, row.id);
      } else {
        db.prepare(`
          UPDATE users SET failed_attempts = ?, updated_at = datetime('now') WHERE id = ?
        `).run(attempts, row.id);
      }
      return reply.code(401).send({ error: 'INVALID_CREDENTIALS' });
    }

    db.prepare(`
      UPDATE users SET failed_attempts = 0, locked_until = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(row.id);

    // Shared demo account: wipe bans and history at each sign-in so visitors
    // always start from a clean slate and nothing leaks between sessions.
    if (row.is_demo === 1) {
      db.prepare('DELETE FROM bans WHERE user_id = ?').run(row.id);
      db.prepare('DELETE FROM history WHERE user_id = ?').run(row.id);
    }

    writeSessionUser(request, { id: row.id, sessionEpoch: row.session_epoch });
    return {
      id: row.id,
      username: row.username,
      role: row.role,
      mustChangePassword: row.must_change_password === 1,
      isDemo: row.is_demo === 1,
      locale: row.locale,
    };
  });

  app.post('/auth/logout', async (request) => {
    clearSession(request);
    return { ok: true };
  });

  app.get('/auth/me', async (request, reply) => {
    const user = readSessionUser(request);
    if (!user) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    return user;
  });

  app.post('/auth/change-password', {
    config: {
      rateLimit: { max: 10, timeWindow: '1 hour' },
    },
    preHandler: requireSession,
    schema: {
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        additionalProperties: false,
        properties: {
          currentPassword: currentPasswordSchema,
          newPassword: passwordSchema,
        },
      },
    },
  }, async (request, reply) => {
    const db = getDb();
    const { currentPassword, newPassword } = request.body;
    const userId = request.currentUser.id;

    const row = db.prepare('SELECT username, password_hash, role, is_demo FROM users WHERE id = ?').get(userId);
    if (!row) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    if (row.is_demo === 1) return reply.code(403).send({ error: 'DEMO_READONLY' });

    const ok = await verifyPassword(row.password_hash, currentPassword);
    if (!ok) return reply.code(401).send({ error: 'INVALID_CREDENTIALS' });

    const check = validatePassword(newPassword, {
      role: row.role,
      userInputs: [row.username, 'couplecards'],
    });
    if (!check.ok) {
      return reply.code(400).send({ error: check.code, details: { score: check.score, feedback: check.feedback } });
    }

    const hash = await hashPassword(newPassword);
    db.prepare(`
      UPDATE users SET password_hash = ?, must_change_password = 0,
        session_epoch = session_epoch + 1,
        failed_attempts = 0, locked_until = NULL,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(hash, userId);

    const updated = db.prepare('SELECT session_epoch FROM users WHERE id = ?').get(userId);
    writeSessionUser(request, { id: userId, sessionEpoch: updated.session_epoch });
    return { ok: true };
  });

  app.post('/auth/preferences', {
    preHandler: requireSession,
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          locale: { type: 'string', enum: [...SUPPORTED_LOCALES] },
        },
      },
    },
  }, async (request) => {
    const { locale } = request.body;
    if (!locale) return { ok: true };
    getDb().prepare(`
      UPDATE users SET locale = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(locale, request.currentUser.id);
    return { ok: true };
  });
}
