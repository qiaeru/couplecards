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
});
