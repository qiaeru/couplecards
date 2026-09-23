// SPDX-License-Identifier: MIT
// Admin routes that can lose data or lock people out: registration, account
// creation, password reset, deletion, the inactive-account sweep and the deck
// import. Most assertions are the guards around the admin and demo rows.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { withServer, signIn, signInAdmin } from './helpers.js';

const PASSWORD = 'Marmalade9-Orbit!Tulip';

let context;
let app;
let admin;
let db;

before(async () => {
  context = await withServer({ demo: true });
  app = context.app;
  db = context.db.getDb();
  admin = await signInAdmin(app);
});

after(() => context.cleanup());

function call(method, url, payload) {
  return app.inject({ method, url, headers: admin.headers(), payload });
}

function register(username) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username, password: PASSWORD },
  });
}

function idOf(username) {
  return db.prepare('SELECT id FROM users WHERE username = ?').get(username)?.id;
}

test('registration follows the admin switch and refuses taken or reserved names', async () => {
  const closed = await register('alice');
  assert.equal(closed.statusCode, 403);
  assert.equal(closed.json().error, 'REGISTRATION_DISABLED');

  assert.equal((await call('PUT', '/api/admin/registration', { enabled: true })).statusCode, 200);
  const opened = await register('alice');
  assert.equal(opened.statusCode, 200, opened.body);
  assert.equal(opened.json().mustChangePassword, false);

  assert.equal((await register('alice')).json().error, 'USERNAME_TAKEN');
  assert.equal((await register('admin')).json().error, 'USERNAME_RESERVED');
});

test('an admin-created account shows its password once and must change it', async () => {
  const created = await call('POST', '/api/admin/users', { username: 'bob' });
  assert.equal(created.statusCode, 200, created.body);
  const { initialPassword } = created.json();
  assert.ok(initialPassword);

  const bob = await signIn(app, 'bob', initialPassword);
  const state = await app.inject({ method: 'GET', url: '/api/state', headers: bob.headers() });
  assert.equal(state.statusCode, 409);
  assert.equal(state.json().error, 'PASSWORD_CHANGE_REQUIRED');

  const list = (await call('GET', '/api/admin/users')).json();
  assert.ok(!JSON.stringify(list).includes(initialPassword), 'the list leaks the password');
});

test('the admin and demo rows are protected from reset and deletion', async () => {
  const adminId = idOf('couplecards');
  const demoId = idOf('demo');
  const errorOf = async (method, url) => (await call(method, url)).json().error;

  assert.equal(
    await errorOf('POST', `/api/admin/users/${adminId}/reset-password`),
    'USE_ADMIN_RESET_ENV',
  );
  assert.equal(
    await errorOf('POST', `/api/admin/users/${demoId}/reset-password`),
    'CANNOT_RESET_DEMO',
  );
  assert.equal(await errorOf('DELETE', `/api/admin/users/${adminId}`), 'CANNOT_DELETE_SELF');
  assert.equal(await errorOf('DELETE', `/api/admin/users/${demoId}`), 'CANNOT_DELETE_DEMO');
});

test('deleting a player removes it once', async () => {
  await call('POST', '/api/admin/users', { username: 'carol' });
  const id = idOf('carol');
  assert.equal((await call('DELETE', `/api/admin/users/${id}`)).statusCode, 200);
  assert.equal((await call('DELETE', `/api/admin/users/${id}`)).statusCode, 404);
});

test('the inactive sweep spares the admin, the demo and recent players', async () => {
  await call('POST', '/api/admin/users', { username: 'dormant' });
  await call('POST', '/api/admin/users', { username: 'recent' });
  // Everyone looks two years idle except `recent`.
  db.prepare(
    `UPDATE users SET created_at = datetime('now', '-2 years'), last_login_at = NULL
     WHERE username != 'recent'`,
  ).run();

  const swept = await call('POST', '/api/admin/users/prune-inactive', { period: '1y' });
  assert.equal(swept.statusCode, 200, swept.body);
  assert.equal(idOf('dormant'), undefined);
  for (const kept of ['couplecards', 'demo', 'recent']) {
    assert.ok(idOf(kept), `${kept} was swept`);
  }
});

test('importing one language in upsert mode keeps the others', async () => {
  const [card] = db.prepare('SELECT id, pile FROM cards ORDER BY sort_order LIMIT 1').all();
  const locales = () =>
    db
      .prepare('SELECT locale FROM card_translations WHERE card_id = ? ORDER BY locale')
      .all(card.id)
      .map((r) => r.locale);
  const before = locales();
  const deck = {
    cardsByLocale: {
      fr: [{ id: card.id, pile: card.pile, title: 'Titre importé', description: 'Texte importé' }],
    },
  };

  const preview = await call('POST', '/api/admin/cards/import', {
    deck,
    mode: 'upsert',
    dryRun: true,
  });
  assert.equal(preview.statusCode, 200, preview.body);
  assert.equal(preview.json().updated, 1);

  const applied = await call('POST', '/api/admin/cards/import', { deck, mode: 'upsert' });
  assert.equal(applied.statusCode, 200, applied.body);
  assert.deepEqual(locales(), before);
  const fr = db
    .prepare(`SELECT title FROM card_translations WHERE card_id = ? AND locale = 'fr'`)
    .get(card.id);
  assert.equal(fr.title, 'Titre importé');
});
