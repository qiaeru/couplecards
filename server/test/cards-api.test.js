// SPDX-License-Identifier: MIT
// The /api/cards ETag contract, which is where this project's cache bugs live:
// the version string mixes a timestamp, two row counts and a persistent
// deck_revision counter, and the requested locale is appended so a language
// switch cannot match its own cached entry. Two edits inside the same second
// used to produce an identical ETag and leave every client on stale text.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { withServer, signIn, session, cookieOf } from './helpers.js';

const ADMIN_PASSWORD = 'Trombone7-Quiver!Latch';

let context;
let app;
let player;
let admin;

before(async () => {
  context = await withServer({ demo: true });
  app = context.app;
  player = await signIn(app, 'demo', 'demo');

  // The seeded admin lands with must_change_password = 1, so every admin route
  // answers 409 until the password is changed. Do it once, up front.
  const fresh = await signIn(app, 'couplecards', 'changeme');
  const changed = await app.inject({
    method: 'POST',
    url: '/api/auth/change-password',
    headers: fresh.headers(),
    payload: { currentPassword: 'changeme', newPassword: ADMIN_PASSWORD },
  });
  assert.equal(changed.statusCode, 200, changed.body);
  admin = await session(app, cookieOf(changed) || fresh.cookie);
});

after(() => context.cleanup());

async function getCards(query = '', headers = {}) {
  return app.inject({
    method: 'GET',
    url: `/api/cards${query}`,
    headers: { cookie: player.cookie, ...headers },
  });
}

test('the deck requires a session', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/cards' });
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error, 'UNAUTHENTICATED');
});

test('a signed-in player gets the deck with an ETag', async () => {
  const response = await getCards();
  assert.equal(response.statusCode, 200);
  assert.ok(response.headers.etag, 'no ETag header');
  assert.equal(response.headers['cache-control'], 'private, must-revalidate');
  const body = response.json();
  assert.ok(body.cards.length > 0);
  assert.equal(`"${body.version}"`, response.headers.etag);
});

test('replaying the ETag gets a 304 that carries no deck', async () => {
  const first = await getCards();
  const second = await getCards('', { 'if-none-match': first.headers.etag });
  assert.equal(second.statusCode, 304);
  // The handler returns null, which inject() surfaces as the string "null".
  // Node never writes a body for a 304 on a real socket, so what matters here
  // is only that no deck was serialized.
  assert.ok(!second.body.includes('cards'), `304 carried a payload: ${second.body}`);
});

test('a stale ETag gets a fresh 200', async () => {
  const response = await getCards('', { 'if-none-match': '"0-0-0-0"' });
  assert.equal(response.statusCode, 200);
});

test('a locale narrows each card to one translation', async () => {
  const response = await getCards('?locale=fr');
  assert.equal(response.statusCode, 200);
  for (const card of response.json().cards) {
    assert.equal(
      Object.keys(card.translations).length,
      1,
      `card ${card.id} carries more than one translation`,
    );
  }
});

test('an admin call without a locale keeps every translation', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/api/cards',
    headers: { cookie: admin.cookie },
  });
  assert.equal(response.statusCode, 200);
  const card = response.json().cards[0];
  assert.ok(Object.keys(card.translations).length > 1, 'the admin payload was narrowed');
});

test('a language switch cannot match the ETag of the previous language', async () => {
  const fr = await getCards('?locale=fr');
  const en = await getCards('?locale=en');
  assert.notEqual(fr.headers.etag, en.headers.etag);
  // The French client replaying its ETag against the English deck must be
  // served the English payload, not a 304 on text it can no longer read.
  const crossed = await getCards('?locale=en', { 'if-none-match': fr.headers.etag });
  assert.equal(crossed.statusCode, 200);
});

test('an unsupported locale is rejected by the schema', async () => {
  const response = await getCards('?locale=zz');
  assert.equal(response.statusCode, 400);
});

test('two edits in the same second still produce different ETags', async () => {
  const before = (await getCards()).headers.etag;
  const target = (await getCards()).json().cards[0].id;

  const edit = async (title) =>
    app.inject({
      method: 'PATCH',
      url: `/api/cards/${target}`,
      headers: admin.headers(),
      payload: { translations: { en: { title, description: 'Edited description' } } },
    });

  const first = await edit('First edit');
  assert.equal(first.statusCode, 200, first.body);
  const afterFirst = (await getCards()).headers.etag;

  const second = await edit('Second edit');
  assert.equal(second.statusCode, 200, second.body);
  const afterSecond = (await getCards()).headers.etag;

  assert.notEqual(afterFirst, before, 'the first edit did not change the ETag');
  assert.notEqual(afterSecond, afterFirst, 'the second same-second edit reused the ETag');

  const reread = await getCards();
  const edited = reread.json().cards.find((c) => c.id === target);
  assert.equal(edited.translations.en.title, 'Second edit');
});

test('creating and deleting a card moves the ETag both ways', async () => {
  const before = (await getCards()).headers.etag;
  const created = await app.inject({
    method: 'POST',
    url: '/api/cards',
    headers: admin.headers(),
    payload: {
      id: 'test-etag-001',
      pile: 'home',
      translations: { en: { title: 'Created', description: 'Created description' } },
    },
  });
  assert.equal(created.statusCode, 200, created.body);
  const afterCreate = (await getCards()).headers.etag;
  assert.notEqual(afterCreate, before);

  const duplicate = await app.inject({
    method: 'POST',
    url: '/api/cards',
    headers: admin.headers(),
    payload: {
      id: 'test-etag-001',
      pile: 'home',
      translations: { en: { title: 'Created', description: 'Created description' } },
    },
  });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.json().error, 'CARD_ID_EXISTS');

  const removed = await app.inject({
    method: 'DELETE',
    url: '/api/cards/test-etag-001',
    headers: admin.headers(),
  });
  assert.equal(removed.statusCode, 200);
  assert.notEqual((await getCards()).headers.etag, afterCreate);
});

test('a player cannot mutate the deck', async () => {
  const response = await app.inject({
    method: 'DELETE',
    url: '/api/cards/whatever',
    headers: player.headers(),
  });
  assert.equal(response.statusCode, 403);
});

test('a mutation without the CSRF header is refused', async () => {
  const response = await app.inject({
    method: 'DELETE',
    url: '/api/cards/whatever',
    headers: { cookie: admin.cookie },
  });
  assert.equal(response.statusCode, 403);
});
