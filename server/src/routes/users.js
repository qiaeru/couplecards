// SPDX-License-Identifier: MIT
// Admin-only user management. The admin never sees or retrieves user passwords:
// creation and reset produce a one-time initial password that is shown once
// in the response and stored only as an Argon2id hash.

import { getDb, getSetting, setSetting, isUniqueViolation } from '../db/index.js';
import { requireAdmin } from '../lib/auth.js';
import { hashPassword, generateInitialPassword } from '../lib/password.js';
import { RESERVED_USERNAMES, usernameSchema, normalizeUsername } from '../lib/usernames.js';

const INACTIVE_PERIODS = {
  '3m': '-3 months',
  '6m': '-6 months',
  '1y': '-1 year',
};

function selectUser(id) {
  const row = getDb().prepare(`
    SELECT id, username, role, must_change_password, is_demo, locked_until, failed_attempts,
           locale, created_at, updated_at, last_login_at
    FROM users WHERE id = ?
  `).get(id);
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    mustChangePassword: row.must_change_password === 1,
    isDemo: row.is_demo === 1,
    lockedUntil: row.locked_until,
    failedAttempts: row.failed_attempts,
    locale: row.locale,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  };
}

export default async function userRoutes(app) {
  app.addHook('preHandler', requireAdmin);

  app.get('/users', async () => {
    const rows = getDb().prepare(`
      SELECT id, username, role, must_change_password, is_demo, locked_until, failed_attempts,
             locale, created_at, updated_at, last_login_at
      FROM users ORDER BY created_at ASC
    `).all();
    return rows.map((r) => ({
      id: r.id,
      username: r.username,
      role: r.role,
      mustChangePassword: r.must_change_password === 1,
      isDemo: r.is_demo === 1,
      lockedUntil: r.locked_until,
      failedAttempts: r.failed_attempts,
      locale: r.locale,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      lastLoginAt: r.last_login_at,
    }));
  });

  // Public registration toggle, stored in settings. The admin panel switch is
  // the source of truth; ENABLE_REGISTRATION only seeds the initial value.
  app.get('/registration', async () => ({ enabled: getSetting('registration_enabled') === '1' }));

  app.put('/registration', {
    schema: {
      body: {
        type: 'object',
        required: ['enabled'],
        additionalProperties: false,
        properties: { enabled: { type: 'boolean' } },
      },
    },
  }, async (request) => {
    setSetting('registration_enabled', request.body.enabled ? '1' : '0');
    return { enabled: request.body.enabled };
  });

  // Bulk removal of accounts that have not signed in for a while. Inactivity is
  // measured from the last login, falling back to creation for accounts that
  // never logged in, so a freshly created account is never swept. Admin and demo
  // rows are excluded, mirroring the single-delete guards. CASCADE clears the
  // deleted users' bans and history automatically.
  app.post('/users/prune-inactive', {
    schema: {
      body: {
        type: 'object',
        required: ['period'],
        additionalProperties: false,
        properties: { period: { type: 'string', enum: Object.keys(INACTIVE_PERIODS) } },
      },
    },
  }, async (request) => {
    const modifier = INACTIVE_PERIODS[request.body.period];
    const info = getDb().prepare(`
      DELETE FROM users
      WHERE role = 'user' AND is_demo = 0
        AND COALESCE(last_login_at, created_at) < datetime('now', ?)
    `).run(modifier);
    return { deleted: info.changes };
  });

  app.post('/users', {
    schema: {
      body: {
        type: 'object',
        required: ['username'],
        additionalProperties: false,
        properties: { username: usernameSchema },
      },
    },
  }, async (request, reply) => {
    const db = getDb();
    const username = normalizeUsername(request.body.username);
    if (RESERVED_USERNAMES.has(username)) {
      return reply.code(409).send({ error: 'USERNAME_RESERVED' });
    }
    const initialPassword = generateInitialPassword();
    const hash = await hashPassword(initialPassword);
    try {
      const info = db.prepare(`
        INSERT INTO users (username, password_hash, role, must_change_password, locale)
        VALUES (?, ?, 'user', 1, (SELECT value FROM settings WHERE key = 'seed_locale'))
      `).run(username, hash);
      return { ...selectUser(info.lastInsertRowid), initialPassword };
    } catch (err) {
      if (isUniqueViolation(err)) {
        return reply.code(409).send({ error: 'USERNAME_TAKEN' });
      }
      throw err;
    }
  });

  app.patch('/users/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: { id: { type: 'integer' } },
      },
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          username: usernameSchema,
        },
      },
    },
  }, async (request, reply) => {
    const db = getDb();
    const id = request.params.id;
    const existing = db.prepare('SELECT role, is_demo FROM users WHERE id = ?').get(id);
    if (!existing) return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    if (existing.role === 'admin') {
      return reply.code(400).send({ error: 'CANNOT_EDIT_ADMIN' });
    }
    if (existing.is_demo === 1) {
      return reply.code(400).send({ error: 'CANNOT_EDIT_DEMO' });
    }
    if (request.body.username !== undefined) {
      const username = normalizeUsername(request.body.username);
      if (RESERVED_USERNAMES.has(username)) {
        return reply.code(409).send({ error: 'USERNAME_RESERVED' });
      }
      try {
        db.prepare(`
          UPDATE users SET username = ?, updated_at = datetime('now') WHERE id = ?
        `).run(username, id);
      } catch (err) {
        if (isUniqueViolation(err)) {
          return reply.code(409).send({ error: 'USERNAME_TAKEN' });
        }
        throw err;
      }
    }
    return selectUser(id);
  });

  app.delete('/users/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: { id: { type: 'integer' } },
      },
    },
  }, async (request, reply) => {
    const db = getDb();
    const id = request.params.id;
    if (id === request.currentUser.id) {
      return reply.code(400).send({ error: 'CANNOT_DELETE_SELF' });
    }
    const target = db.prepare('SELECT role, is_demo FROM users WHERE id = ?').get(id);
    if (!target) return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    if (target.role === 'admin') {
      return reply.code(400).send({ error: 'CANNOT_DELETE_ADMIN' });
    }
    // The demo account is controlled by ENABLE_DEMO_ACCOUNT. Deleting the row
    // would only last until the next restart, since the seed step recreates it
    // whenever the flag is set. Refuse the delete so the admin points at the
    // right lever (unset the env var and restart).
    if (target.is_demo === 1) {
      return reply.code(400).send({ error: 'CANNOT_DELETE_DEMO' });
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return { ok: true };
  });

  app.post('/users/:id/reset-password', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: { id: { type: 'integer' } },
      },
    },
  }, async (request, reply) => {
    const db = getDb();
    const id = request.params.id;
    const target = db.prepare('SELECT role, is_demo FROM users WHERE id = ?').get(id);
    if (!target) return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    if (target.role === 'admin') {
      return reply.code(400).send({ error: 'USE_ADMIN_RESET_ENV' });
    }
    if (target.is_demo === 1) {
      return reply.code(400).send({ error: 'CANNOT_RESET_DEMO' });
    }
    const initialPassword = generateInitialPassword();
    const hash = await hashPassword(initialPassword);
    db.prepare(`
      UPDATE users SET password_hash = ?, must_change_password = 1,
        failed_attempts = 0, locked_until = NULL,
        session_epoch = session_epoch + 1,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(hash, id);
    return { ...selectUser(id), initialPassword };
  });

  app.post('/users/:id/unlock', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: { id: { type: 'integer' } },
      },
    },
  }, async (request, reply) => {
    const db = getDb();
    const info = db.prepare(`
      UPDATE users SET locked_until = NULL, failed_attempts = 0,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(request.params.id);
    if (info.changes === 0) return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    return selectUser(request.params.id);
  });
}
