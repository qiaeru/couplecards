// SPDX-License-Identifier: MIT
// Encrypted, signed cookie session via @fastify/secure-session.

import fp from 'fastify-plugin';
import secureSession from '@fastify/secure-session';
import { config } from '../config.js';

export default fp(async function sessionPlugin(app) {
  await app.register(secureSession, {
    key: config.sessionKey,
    cookieName: 'couplecards.sid',
    cookie: {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: config.cookieSecure,
      maxAge: 60 * 60 * 24 * 30, // 30 days
    },
  });

  // Browsers drop Secure cookies on plain HTTP, surfacing as an unexplained login loop. One-shot warn.
  let warned = false;
  app.addHook('onRequest', async (request) => {
    if (warned || !config.cookieSecure) return;
    if (request.protocol === 'http') {
      warned = true;
      request.log.warn(
        'COOKIE_SECURE=true but a request was received over plain HTTP. '
        + 'Browsers will drop the session cookie and login will silently fail. '
        + 'Set COOKIE_SECURE=false for LAN/HTTP deploys, or front the app with an HTTPS reverse proxy '
        + '(and TRUST_PROXY=1 so X-Forwarded-Proto is honored).',
      );
    }
  });
});
