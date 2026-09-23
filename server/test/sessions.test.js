// SPDX-License-Identifier: MIT
// Session lifetime and logout. The cookie is stateless, so both rules live in
// code that is easy to break silently: secure-session carries its own 24 h
// expiry under the cookie's maxAge, and a logout that only clears the cookie
// leaves any copy of it valid.

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { withServer, signIn, cookieOf } from './helpers.js';

const DAY = 24 * 60 * 60 * 1000;

let context;
let app;

before(async () => {
  context = await withServer({ demo: true });
  app = context.app;
});

after(() => context.cleanup());

function me(cookie) {
  return app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
}

function logout(s) {
  return app.inject({ method: 'POST', url: '/api/auth/logout', headers: s.headers() });
}

test('a session slides for 30 days from the last visit', async (t) => {
  const start = Date.now();
  mock.timers.enable({ apis: ['Date'], now: start });
  t.after(() => mock.timers.reset());

  const { cookie } = await signIn(app, 'demo', 'demo');

  mock.timers.setTime(start + DAY + 60_000);
  const renewed = await me(cookie);
  assert.equal(renewed.statusCode, 200, 'still signed in after 24 h');
  const fresh = cookieOf(renewed);
  assert.ok(fresh, 'a visit after a day re-issues the cookie');

  mock.timers.setTime(start + 31 * DAY);
  assert.equal((await me(cookie)).statusCode, 401, 'the original cookie expires after 30 days');
  assert.equal((await me(fresh)).statusCode, 200, 'the renewed one is still valid');
});

test('logout revokes every copy of the cookie', async () => {
  const s = await signIn(app, 'couplecards', 'changeme');
  const copy = s.cookie;
  assert.equal((await logout(s)).statusCode, 200);
  assert.equal((await me(copy)).statusCode, 401);
});

test('logging out of the demo account leaves other visitors signed in', async () => {
  const first = await signIn(app, 'demo', 'demo');
  const second = await signIn(app, 'demo', 'demo');
  assert.equal((await logout(first)).statusCode, 200);
  assert.equal((await me(second.cookie)).statusCode, 200);
});
