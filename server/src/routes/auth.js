// SPDX-License-Identifier: MIT
// Auth routes: login, logout, me, change-password, preferences, csrf, policy.

import { getDb, getSetting, isUniqueViolation } from '../db/index.js';
import { hashPassword, verifyPassword, validatePassword, POLICY } from '../lib/password.js';
import { readSessionUser, writeSessionUser, clearSession, requireSession } from '../lib/auth.js';
import { RESERVED_USERNAMES, usernameSchema, normalizeUsername } from '../lib/usernames.js';
import { SUPPORTED_LOCALES } from '../lib/locales.js';

const LOCKOUT_THRESHOLD = 10;
const LOCKOUT_MINUTES = 15;

// Matches POLICY.minLength: both registration and change-password enforce the
// full policy on the new password anyway, the schema just fails cheap and early.
const newPasswordSchema = { type: 'string', minLength: 12, maxLength: 200 };
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
      // Generic message, do not leak which side failed.
      return reply.code(401).send({ error: 'INVALID_CREDENTIALS' });
    }

    if (row.locked_until) {
      const unlockAt = new Date(row.locked_until + 'Z');
      if (unlockAt > new Date()) {
        return reply.code(423).send({ error: 'ACCOUNT_LOCKED', details: { unlockAt: unlockAt.toISOString() } });
      }
      // Lock expired: restore a full window of attempts. Without this reset
      // the counter stays at the threshold and a single wrong password
      // re-locks the account for another full period, indefinitely.
      db.prepare(`
        UPDATE users SET failed_attempts = 0, locked_until = NULL, updated_at = datetime('now')
        WHERE id = ?
      `).run(row.id);
    }

    const ok = await verifyPassword(row.password_hash, password);
    if (!ok) {
      // Increment in SQL, not from the row read before the (slow) password
      // verification: concurrent failures would otherwise overwrite each
      // other's count and delay the lockout.
      const until = new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
        .toISOString().replace('T', ' ').slice(0, 19);
      db.prepare(`
        UPDATE users SET failed_attempts = failed_attempts + 1,
          locked_until = CASE WHEN failed_attempts + 1 >= ? THEN ? ELSE locked_until END,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(LOCKOUT_THRESHOLD, until, row.id);
      return reply.code(401).send({ error: 'INVALID_CREDENTIALS' });
    }

    db.prepare(`
      UPDATE users SET failed_attempts = 0, locked_until = NULL,
        last_login_at = datetime('now'), updated_at = datetime('now')
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

  // Public flag so the login and forgot-password pages can show or hide the
  // registration link before any session exists.
  app.get('/auth/registration', async () => ({ enabled: getSetting('registration_enabled') === '1' }));

  // Public self-registration. CSRF-exempt like login (no session cookie yet,
  // protected by SameSite=strict + the rate limit). The user picks their own
  // password, so must_change_password stays 0 and the session is opened right
  // away, mirroring a successful login.
  app.post('/auth/register', {
    config: {
      rateLimit: { max: 5, timeWindow: '1 hour' },
    },
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        additionalProperties: false,
        properties: {
          username: usernameSchema,
          password: newPasswordSchema,
        },
      },
    },
  }, async (request, reply) => {
    if (getSetting('registration_enabled') !== '1') {
      return reply.code(403).send({ error: 'REGISTRATION_DISABLED' });
    }
    const db = getDb();
    const username = normalizeUsername(request.body.username);
    if (RESERVED_USERNAMES.has(username)) {
      return reply.code(409).send({ error: 'USERNAME_RESERVED' });
    }

    const check = validatePassword(request.body.password, {
      role: 'user',
      userInputs: [username, 'couplecards'],
    });
    if (!check.ok) {
      return reply.code(400).send({ error: check.code, details: { score: check.score, feedback: check.feedback } });
    }

    const hash = await hashPassword(request.body.password);
    let created;
    try {
      const info = db.prepare(`
        INSERT INTO users (username, password_hash, role, must_change_password, locale, last_login_at)
        VALUES (?, ?, 'user', 0, (SELECT value FROM settings WHERE key = 'seed_locale'), datetime('now'))
      `).run(username, hash);
      created = db.prepare(`
        SELECT id, username, role, must_change_password, is_demo, session_epoch, locale
        FROM users WHERE id = ?
      `).get(info.lastInsertRowid);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return reply.code(409).send({ error: 'USERNAME_TAKEN' });
      }
      throw err;
    }

    writeSessionUser(request, { id: created.id, sessionEpoch: created.session_epoch });
    return {
      id: created.id,
      username: created.username,
      role: created.role,
      mustChangePassword: created.must_change_password === 1,
      isDemo: created.is_demo === 1,
      locale: created.locale,
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
          newPassword: newPasswordSchema,
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
    // Shared demo account: acknowledge without persisting, one visitor's
    // locale choice must not leak to the next (login only wipes bans/history).
    if (request.currentUser.isDemo) return { ok: true };
    getDb().prepare(`
      UPDATE users SET locale = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(locale, request.currentUser.id);
    return { ok: true };
  });
}
