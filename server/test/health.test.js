// SPDX-License-Identifier: MIT
// The Dockerfile HEALTHCHECK only looks for a 200, so the probe must stop
// answering 200 once the database is gone, or a broken container stays
// "healthy".

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { withServer } from './helpers.js';

let context;

before(async () => {
  context = await withServer();
});

after(() => context.cleanup());

test('health answers 200 while the database is reachable', async () => {
  const response = await context.app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: 'ok', dbOk: true });
});

test('health answers 503 once the database is unreachable', async () => {
  // getDb() reopens a closed connection, so close it and put a plain file
  // where the data directory was: the reopen then fails like a lost volume.
  context.db.closeDb();
  rmSync(context.dir, { recursive: true, force: true });
  writeFileSync(context.dir, '');

  const response = await context.app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { status: 'error', dbOk: false });
});
