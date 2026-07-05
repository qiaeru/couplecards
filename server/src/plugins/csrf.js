// SPDX-License-Identifier: MIT
// CSRF double-submit tokens for /api/* mutations. Token is issued by
// GET /api/auth/csrf and checked via the `x-csrf-token` header. /api/auth/login
// and /api/auth/register are exempt (no session cookie yet; protected by
// SameSite=strict + rate limit).
// The library decorates `fastify.csrfProtection` but leaves the wiring to us.

import fp from 'fastify-plugin';
import csrf from '@fastify/csrf-protection';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const EXEMPT_PATHS = new Set(['/api/auth/login', '/api/auth/register', '/api/auth/csrf']);

export default fp(async function csrfPlugin(app) {
  await app.register(csrf, {
    sessionPlugin: '@fastify/secure-session',
    getToken: (req) => req.headers['x-csrf-token'],
  });

  app.addHook('preHandler', (request, reply, done) => {
    if (!MUTATING_METHODS.has(request.method)) return done();
    if (!request.url.startsWith('/api/')) return done();
    // Exact path match (query string stripped): a prefix test would silently
    // exempt any future route that merely starts with an exempt path.
    const path = request.url.split('?')[0];
    if (EXEMPT_PATHS.has(path)) return done();
    app.csrfProtection(request, reply, done);
  });
});
