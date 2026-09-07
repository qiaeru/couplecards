// SPDX-License-Identifier: MIT
// Server entry point: runs migrations + seed, then starts the HTTP listener.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from './config.js';
import { runMigrations } from './db/migrate.js';
import { runSeed, maybeResetAdmin } from './db/seed.js';
import { closeDb } from './db/index.js';
import buildApp from './app.js';

async function start() {
  runMigrations(console);
  await runSeed(console);
  await maybeResetAdmin(console);

  const vendorBundle = resolve(config.publicDir, 'vendor/zxcvbn.js');
  if (!existsSync(vendorBundle)) {
    console.warn(
      '[warn] public/vendor/zxcvbn.js is missing: password strength meter will be inactive.',
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
    // Safety net: if close() hangs (stuck connection), still exit before the
    // orchestrator escalates to SIGKILL. unref() keeps the timer from holding
    // the process open on the normal path.
    setTimeout(() => process.exit(1), 5000).unref();
    try {
      await app.close();
      closeDb();
      process.exit(0);
    } catch (err) {
      app.log.error(err, 'shutdown failed');
      process.exit(1);
    }
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

start();
