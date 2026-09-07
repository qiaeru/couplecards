// SPDX-License-Identifier: MIT
// Fastify application factory: wires plugins, the error handler and the
// routes. Kept apart from index.js so the tests can build an app and drive it
// through app.inject() without opening a port or installing signal handlers.

import Fastify, { LogController } from 'fastify';
import compressPlugin from '@fastify/compress';
import { config } from './config.js';

import helmetPlugin from './plugins/helmet.js';
import sessionPlugin from './plugins/session.js';
import csrfPlugin from './plugins/csrf.js';
import rateLimitPlugin from './plugins/ratelimit.js';
import staticPlugin from './plugins/static.js';

import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import cardRoutes from './routes/cards.js';
import adminCardRoutes from './routes/admin-cards.js';
import userRoutes from './routes/users.js';
import syncRoutes from './routes/sync.js';
import manifestRoutes from './routes/manifest.js';

// `logger` is the one injectable knob: the tests pass `false` so a run does
// not bury its own output under a few hundred request lines.
export default async function buildApp({ logger } = {}) {
  const app = Fastify({
    trustProxy: config.trustProxy,
    logger: logger ?? {
      level: config.isProduction ? 'info' : 'debug',
      redact: [
        'req.body.password',
        'req.body.newPassword',
        'req.body.currentPassword',
        'res.body.initialPassword',
      ],
    },
    bodyLimit: 512 * 1024,
    // Skip the per-request access log line in production. A PWA cold start
    // pulls ~30 static assets and the log encoding cost dwarfs the serve
    // cost for the deployment's single-instance / low-traffic profile.
    // Per-route logs (errors, auth failures, deck sync) still surface.
    //
    // Fastify 6 drops the top-level `disableRequestLogging`, so this goes
    // through a LogController instance. The option is typed as a class but
    // the runtime checks `instanceof`, so it has to be constructed here.
    logController: new LogController({ disableRequestLogging: config.isProduction }),
  });

  // Threshold below the smallest compressible response we serve.
  await app.register(compressPlugin, {
    global: true,
    threshold: 1024,
    encodings: ['br', 'gzip'],
  });

  await app.register(helmetPlugin);
  await app.register(rateLimitPlugin);
  await app.register(sessionPlugin);
  await app.register(csrfPlugin);

  // Must be set before the route plugins are registered: encapsulated scopes
  // inherit the error handler that exists at their creation, so a handler set
  // afterwards never applies to them and Fastify's default (which leaks the
  // technical error message in the response body) takes over.
  app.setErrorHandler((error, request, reply) => {
    // Client errors (validation, CSRF, bad input) are expected traffic: log
    // them as warnings so `error` stays reserved for actual server faults.
    if (error.validation) {
      request.log.warn({ err: error }, 'request failed');
      return reply.code(400).send({ error: 'VALIDATION_ERROR', details: error.validation });
    }
    if (error.statusCode && error.statusCode < 500) {
      request.log.warn({ err: error }, 'request failed');
      return reply.code(error.statusCode).send({ error: error.code || 'REQUEST_FAILED' });
    }
    request.log.error({ err: error }, 'request failed');
    return reply.code(500).send({ error: 'INTERNAL_ERROR' });
  });

  // Mounted at root so <link rel="manifest"> resolves without the /api prefix.
  await app.register(manifestRoutes);

  await app.register(
    async (scope) => {
      await scope.register(healthRoutes);
      await scope.register(authRoutes);
      await scope.register(cardRoutes);
      await scope.register(syncRoutes);
    },
    { prefix: '/api' },
  );

  await app.register(
    async (scope) => {
      await scope.register(userRoutes);
      await scope.register(adminCardRoutes);
    },
    { prefix: '/api/admin' },
  );

  await app.register(staticPlugin);

  return app;
}
