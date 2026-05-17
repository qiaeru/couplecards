// SPDX-License-Identifier: MIT
// Fastify bootstrap: wires plugins, runs migrations + seed, mounts routes.

import Fastify from 'fastify';
import compressPlugin from '@fastify/compress';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from './config.js';
import { runMigrations } from './db/migrate.js';
import { runSeed, maybeResetAdmin } from './db/seed.js';
import { closeDb } from './db/index.js';

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

async function buildApp() {
  const app = Fastify({
    trustProxy: config.trustProxy,
    logger: {
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
    disableRequestLogging: config.isProduction,
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

  // Mounted at root so <link rel="manifest"> resolves without the /api prefix.
  await app.register(manifestRoutes);

  await app.register(async (scope) => {
    await scope.register(healthRoutes);
    await scope.register(authRoutes);
    await scope.register(cardRoutes);
    await scope.register(syncRoutes);
  }, { prefix: '/api' });

  await app.register(async (scope) => {
    await scope.register(userRoutes);
    await scope.register(adminCardRoutes);
  }, { prefix: '/api/admin' });

  app.setErrorHandler((error, _request, reply) => {
    app.log.error({ err: error }, 'request failed');
    if (error.validation) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', details: error.validation });
    }
    if (error.statusCode && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: error.code || 'REQUEST_FAILED' });
    }
    return reply.code(500).send({ error: 'INTERNAL_ERROR' });
  });

  await app.register(staticPlugin);

  return app;
}

async function start() {
  runMigrations(console);
  await runSeed(console);
  await maybeResetAdmin(console);

  const vendorBundle = resolve(config.publicDir, 'vendor/zxcvbn.js');
  if (!existsSync(vendorBundle)) {
    console.warn(
      '[warn] public/vendor/zxcvbn.js is missing — password strength meter will be inactive.',
    );
    console.warn(
      '[warn] Build it once from the project root with: npm install && npm run build:vendor',
    );
  }

  const app = await buildApp();
  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info({ port: config.port, host: config.host, env: config.env }, 'server ready');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async (signal) => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      closeDb();
    } finally {
      process.exit(0);
    }
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

start();
