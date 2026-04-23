// SPDX-License-Identifier: MIT
// Session lookup + route guards (requireSession, requireAdmin).

import { getDb } from '../db/index.js';

export function readSessionUser(request) {
  const session = request.session;
  if (!session) return null;
  const payload = session.get('user');
  if (!payload || typeof payload !== 'object') return null;

  const db = getDb();
  const row = db.prepare(`
    SELECT id, username, role, must_change_password AS mustChangePassword,
           is_demo AS isDemo, session_epoch AS sessionEpoch, locale
    FROM users WHERE id = ?
  `).get(payload.id);
  if (!row) return null;
  if (row.sessionEpoch !== payload.epoch) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    mustChangePassword: row.mustChangePassword === 1,
    isDemo: row.isDemo === 1,
    locale: row.locale,
  };
}

export function writeSessionUser(request, user) {
  request.session.set('user', { id: user.id, epoch: user.sessionEpoch });
}

export function clearSession(request) {
  request.session.delete();
}

export async function requireSession(request, reply) {
  const user = readSessionUser(request);
  if (!user) {
    return reply.code(401).send({ error: 'UNAUTHENTICATED' });
  }
  request.currentUser = user;
}

export async function requireAdmin(request, reply) {
  await requireSession(request, reply);
  if (reply.sent) return;
  if (request.currentUser.role !== 'admin') {
    return reply.code(403).send({ error: 'FORBIDDEN' });
  }
  await enforcePasswordChange(request, reply);
}

// Must stay async: Fastify 5 silently stalls routes that mix sync and async
// preHandlers in the same chain. /api/auth/change-password calls requireSession
// directly so it can run even with must_change_password = 1.
export async function enforcePasswordChange(request, reply) {
  const user = request.currentUser;
  if (user && user.mustChangePassword) {
    return reply.code(409).send({ error: 'PASSWORD_CHANGE_REQUIRED' });
  }
}
