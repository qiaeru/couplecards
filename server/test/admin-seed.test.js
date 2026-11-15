// SPDX-License-Identifier: MIT
// A fixed first admin password let anyone who reached a
// fresh instance first claim it through the forced password change. The seed
// now generates one and prints it once; older instances still on the fixed
// password get rotated at boot.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { withDatabase, seededAdminPassword, seedLogger, passwordFrom } from './helpers.js';

let context;
let getDb;
let runSeed;
let maybeResetAdmin;
let hashPassword;
let verifyPassword;

before(async () => {
  context = await withDatabase();
  ({ getDb } = context.db);
  ({ runSeed, maybeResetAdmin } = await import('../src/db/seed.js'));
  ({ hashPassword, verifyPassword } = await import('../src/lib/password.js'));
});

after(() => context.cleanup());

function admin() {
  return getDb()
    .prepare(
      `SELECT password_hash AS hash, must_change_password AS mustChange, session_epoch AS epoch
       FROM users WHERE username = 'couplecards'`,
    )
    .get();
}

test('the first admin gets a random password that must be changed', async () => {
  const password = seededAdminPassword();
  assert.ok(password, 'the seed logs the generated password');
  assert.notEqual(password, 'changeme');
  const row = admin();
  assert.equal(row.mustChange, 1);
  assert.ok(await verifyPassword(row.hash, password));
  assert.equal(await verifyPassword(row.hash, 'changeme'), false);
});

test('a boot rotates an unclaimed admin still on the old default password', async () => {
  getDb()
    .prepare(`UPDATE users SET password_hash = ? WHERE username = 'couplecards'`)
    .run(await hashPassword('changeme'));
  const before = admin();
  const messages = [];
  await runSeed(seedLogger(messages));
  const password = passwordFrom(messages);
  const row = admin();
  assert.ok(password);
  assert.equal(await verifyPassword(row.hash, 'changeme'), false);
  assert.ok(await verifyPassword(row.hash, password));
  assert.equal(row.mustChange, 1);
  assert.equal(row.epoch, before.epoch + 1, 'sessions opened with the old password die');
});

test('a boot leaves alone an admin that chose its own password', async () => {
  getDb()
    .prepare(
      `UPDATE users SET password_hash = ?, must_change_password = 0 WHERE username = 'couplecards'`,
    )
    .run(await hashPassword('changeme'));
  const before = admin();
  const messages = [];
  await runSeed(seedLogger(messages));
  assert.equal(passwordFrom(messages), null);
  assert.equal(admin().hash, before.hash);
});

test('ADMIN_RESET sets a random password, not a fixed one', async () => {
  const { config } = await import('../src/config.js');
  config.adminReset = true;
  try {
    const messages = [];
    await maybeResetAdmin(seedLogger(messages));
    const password = passwordFrom(messages);
    const row = admin();
    assert.ok(password);
    assert.notEqual(password, 'changeme');
    assert.ok(await verifyPassword(row.hash, password));
    assert.equal(row.mustChange, 1);
  } finally {
    config.adminReset = false;
  }
});
