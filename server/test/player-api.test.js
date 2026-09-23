// SPDX-License-Identifier: MIT
// The per-player state routes the offline outbox replays: bans, history and
// reset. The history cap and the idempotent delete are what keep a replayed
// outbox from growing the table or failing forever.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withServer, signIn, signInAdmin, cookieOf, session } from './helpers.js';

let context;
let app;
let admin;
let demo;
let player;
let cardIds;

before(async () => {
  context = await withServer({ demo: true });
  app = context.app;
  admin = await signInAdmin(app);
  demo = await signIn(app, 'demo', 'demo');

  // A regular player, through public registration: admin-created accounts
  // must change their password before any player route answers.
  const opened = await app.inject({
    method: 'PUT',
    url: '/api/admin/registration',
    headers: admin.headers(),
    payload: { enabled: true },
  });
  assert.equal(opened.statusCode, 200, opened.body);
  const registered = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username: 'player.one', password: 'Marmalade9-Orbit!Tulip' },
  });
  assert.equal(registered.statusCode, 200, registered.body);
  player = await session(app, cookieOf(registered));

  cardIds = context.db
    .getDb()
    .prepare('SELECT id FROM cards ORDER BY sort_order LIMIT 3')
    .all()
    .map((r) => r.id);
});

after(() => context.cleanup());

function call(s, method, url, payload) {
  return app.inject({ method, url, headers: s.headers(), payload });
}

async function state(s) {
  return (await app.inject({ method: 'GET', url: '/api/state', headers: s.headers() })).json();
}

function entry(cardId, drawnAt = new Date().toISOString()) {
  return { clientUuid: randomUUID(), cardId, action: 'returned', drawnAt };
}

test('the admin account cannot reach the player routes', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/state', headers: admin.headers() });
  assert.equal(response.statusCode, 403);
});

test('a ban round-trips, and an unknown card is refused', async () => {
  const banned = await call(player, 'POST', '/api/bans', { cardId: cardIds[0] });
  assert.equal(banned.statusCode, 200, banned.body);
  assert.ok(banned.json().bannedAt);
  assert.deepEqual(
    (await state(player)).banned.map((b) => b.cardId),
    [cardIds[0]],
  );

  assert.equal((await call(player, 'DELETE', `/api/bans/${cardIds[0]}`)).statusCode, 200);
  assert.deepEqual((await state(player)).banned, []);

  const unknown = await call(player, 'POST', '/api/bans', { cardId: 'no-such-card' });
  assert.equal(unknown.statusCode, 404);
});

test('history keeps the newest 500 entries', async () => {
  const start = Date.parse('2026-01-01T00:00:00Z');
  const all = Array.from({ length: 505 }, (_, i) =>
    entry(cardIds[i % cardIds.length], new Date(start + i * 60_000).toISOString()),
  );
  for (let i = 0; i < all.length; i += 100) {
    const response = await call(player, 'POST', '/api/history', { entries: all.slice(i, i + 100) });
    assert.equal(response.statusCode, 200, response.body);
  }
  const history = (await state(player)).history;
  assert.equal(history.length, 500);
  assert.equal(history[0].clientUuid, all.at(-1).clientUuid, 'the newest entry is kept');
  assert.ok(!history.some((e) => e.clientUuid === all[0].clientUuid), 'the oldest is dropped');
});

test('deleting a history entry is idempotent', async () => {
  const one = entry(cardIds[1]);
  await call(player, 'POST', '/api/history', { entries: [one] });
  const path = `/api/history/${one.clientUuid}`;
  assert.equal((await call(player, 'DELETE', path)).statusCode, 200);
  // The outbox replays a delete after a lost response: it must not fail.
  assert.equal((await call(player, 'DELETE', path)).statusCode, 200);
  assert.ok(!(await state(player)).history.some((e) => e.clientUuid === one.clientUuid));
});

test('a reset clears the player state, but the demo account cannot reset', async () => {
  await call(player, 'POST', '/api/bans', { cardId: cardIds[2] });
  assert.equal((await call(player, 'POST', '/api/state/reset')).statusCode, 200);
  assert.deepEqual(await state(player), { banned: [], history: [] });

  const denied = await call(demo, 'POST', '/api/state/reset');
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.json().error, 'DEMO_READONLY');
});
