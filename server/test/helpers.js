// SPDX-License-Identifier: MIT
// Boots a throwaway server against a temporary SQLite file.
//
// config.js reads the environment once, at import time, and db/index.js caches
// the connection in module scope. Both are per-process state, so every helper
// here sets the environment *before* pulling the server modules in with a
// dynamic import. `node --test` runs one process per file, which keeps those
// singletons from leaking between test files.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = resolve(fileURLToPath(import.meta.url), '../..');
const REPO_ROOT = resolve(SERVER_DIR, '..');

// 48 chars: config.js requires at least 32 and slices the first 32 bytes.
const TEST_SECRET = 'test-secret-0123456789abcdef0123456789abcdef0123';

function prepareEnv({ demo = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'couplecards-test-'));
  process.env.NODE_ENV = 'test';
  process.env.DATA_DIR = dir;
  process.env.DB_PATH = join(dir, 'test.db');
  process.env.SESSION_SECRET = TEST_SECRET;
  process.env.COOKIE_SECURE = '0';
  process.env.ENABLE_DEMO_ACCOUNT = demo ? '1' : '0';
  process.env.ENABLE_REGISTRATION = '0';
  process.env.ADMIN_RESET = '0';
  process.env.PUBLIC_DIR = join(REPO_ROOT, 'public');
  process.env.DATA_SEED_DIR = join(REPO_ROOT, 'data');
  return dir;
}

// Migrated, seeded database with no HTTP layer. For the tests that only need
// tables and rows.
export async function withDatabase(options = {}) {
  const dir = prepareEnv(options);
  const { runMigrations } = await import('../src/db/migrate.js');
  const { runSeed } = await import('../src/db/seed.js');
  const db = await import('../src/db/index.js');
  runMigrations(null);
  await runSeed(null);
  return {
    db,
    dir,
    cleanup() {
      db.closeDb();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

// Full application, driven through app.inject(): no port, no signal handlers.
export async function withServer(options = {}) {
  const base = await withDatabase(options);
  const { default: buildApp } = await import('../src/app.js');
  const app = await buildApp({ logger: false });
  await app.ready();
  return {
    ...base,
    app,
    async cleanup() {
      await app.close();
      base.cleanup();
    },
  };
}

// Signs in and returns the session cookie plus a matching CSRF token, ready to
// be spread into an inject() call's headers.
export async function signIn(app, username, password) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password },
  });
  if (response.statusCode !== 200) {
    throw new Error(`login failed for ${username}: ${response.statusCode} ${response.body}`);
  }
  return session(app, cookieOf(response));
}

// The login reply and the change-password reply both re-issue the cookie, so
// the token has to be minted against whichever one is current.
export async function session(app, cookie) {
  const csrf = await app.inject({
    method: 'GET',
    url: '/api/auth/csrf',
    headers: { cookie },
  });
  return {
    cookie: cookieOf(csrf) || cookie,
    token: JSON.parse(csrf.body).token,
    headers() {
      return { cookie: this.cookie, 'x-csrf-token': this.token };
    },
  };
}

export function cookieOf(response) {
  const raw = response.headers['set-cookie'];
  if (!raw) return '';
  const list = Array.isArray(raw) ? raw : [raw];
  const match = list.find((c) => c.startsWith('couplecards.sid='));
  return match ? match.split(';')[0] : '';
}
