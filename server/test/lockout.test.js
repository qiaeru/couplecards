// SPDX-License-Identifier: MIT
// Failed sign-ins lock an account per (user, client IP). The admin and demo
// usernames are public, so a per-user lock let anyone keep them locked out.
// Nine failures are written straight to the table: reaching ten through the
// route would trip the 5-per-minute login rate limit first.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { withServer, signIn, session, cookieOf } from './helpers.js';

let context;
let app;
let admin;
let demoId;

before(async () => {
  context = await withServer({ demo: true });
  app = context.app;
  demoId = context.db.getDb().prepare(`SELECT id FROM users WHERE username = 'demo'`).get().id;

  // The seeded admin must change its password before any admin route answers.
  const fresh = await signIn(app, 'couplecards', 'changeme');
  const changed = await app.inject({
    method: 'POST',
    url: '/api/auth/change-password',
    headers: fresh.headers(),
    payload: { currentPassword: 'changeme', newPassword: 'Trombone7-Quiver!Latch' },
  });
  assert.equal(changed.statusCode, 200, changed.body);
  admin = await session(app, cookieOf(changed) || fresh.cookie);
});

after(() => context.cleanup());

function login(password, remoteAddress) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'demo', password },
    remoteAddress,
  });
}

async function demoRow() {
  const list = await app.inject({
    method: 'GET',
    url: '/api/admin/users',
    headers: admin.headers(),
  });
  return JSON.parse(list.body).find((u) => u.id === demoId);
}

test('a lock blocks only the address that earned it, until an admin clears it', async () => {
  context.db
    .getDb()
    .prepare(`INSERT INTO login_failures (user_id, ip, failed_attempts) VALUES (?, ?, 9)`)
    .run(demoId, '198.51.100.1');

  assert.equal((await login('wrong', '198.51.100.1')).statusCode, 401);
  assert.equal((await login('demo', '198.51.100.1')).statusCode, 423, 'the tenth failure locks');
  assert.equal((await login('demo', '198.51.100.2')).statusCode, 200, 'other addresses sign in');
  assert.ok((await demoRow()).lockedUntil, 'the admin list shows the lock');

  const unlock = await app.inject({
    method: 'POST',
    url: `/api/admin/users/${demoId}/unlock`,
    headers: admin.headers(),
  });
  assert.equal(unlock.statusCode, 200, unlock.body);
  assert.equal((await demoRow()).lockedUntil, null);
  assert.equal((await login('demo', '198.51.100.1')).statusCode, 200);
});

test('a successful sign-in clears the failures of its own address only', async () => {
  const insert = context.db
    .getDb()
    .prepare(`INSERT INTO login_failures (user_id, ip, failed_attempts) VALUES (?, ?, 3)`);
  insert.run(demoId, '203.0.113.1');
  insert.run(demoId, '203.0.113.2');

  assert.equal((await login('demo', '203.0.113.1')).statusCode, 200);
  const left = context.db
    .getDb()
    .prepare(`SELECT ip FROM login_failures WHERE user_id = ?`)
    .all(demoId)
    .map((r) => r.ip);
  assert.deepEqual(left, ['203.0.113.2']);
});
