// SPDX-License-Identifier: MIT
// Session lookup + route guards (requireSession, requireAdmin).

import { getDb } from '../db/index.js';

// A session lasts 30 days from the last visit: readSessionUser renews it at
// most once a day, so an active user is never signed out.
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const SESSION_RENEW_SECONDS = 60 * 60 * 24;

export function readSessionUser(request) {
  const session = request.session;
  if (!session) return null;
  const payload = session.get('user');
  if (!payload || typeof payload !== 'object') return null;

  const db = getDb();
  const row = db
    .prepare(
      `
    SELECT id, username, role, must_change_password AS mustChangePassword,
           is_demo AS isDemo, session_epoch AS sessionEpoch, locale
    FROM users WHERE id = ?
  `,
    )
    .get(payload.id);
  if (!row) return null;
  if (row.sessionEpoch !== payload.epoch) return null;
  // secure-session stamps `__ts` only when the session is written and expires
  // it from there; touching it re-issues the cookie with a fresh stamp.
  if (Date.now() / 1000 - session.get('__ts') > SESSION_RENEW_SECONDS) session.touch();
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

// Player-only routes: an authenticated session is required and the admin role
// is rejected. The admin UI lands on /admin.html and never plays cards, so the
// /api/state, /api/bans, /api/history and /api/state/reset endpoints have no
// reason to be reachable with an admin cookie.
export async function requireUser(request, reply) {
  await requireSession(request, reply);
  if (reply.sent) return;
  if (request.currentUser.role === 'admin') {
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
