// SPDX-License-Identifier: MIT
// Login, admin creation and public registration all normalize through the same
// helper. If they ever drift, one path accepts a username the other rejects.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RESERVED_USERNAMES, usernameSchema, normalizeUsername } from '../src/lib/usernames.js';

test('normalizeUsername trims and lowercases', () => {
  assert.equal(normalizeUsername('  Alice  '), 'alice');
  assert.equal(normalizeUsername('BOB'), 'bob');
  assert.equal(normalizeUsername('already.fine'), 'already.fine');
});

test('normalizeUsername turns absent input into an empty string', () => {
  assert.equal(normalizeUsername(undefined), '');
  assert.equal(normalizeUsername(null), '');
  assert.equal(normalizeUsername(''), '');
});

test('the reserved list is stored lowercase, which is what normalize produces', () => {
  for (const name of RESERVED_USERNAMES) {
    assert.equal(normalizeUsername(name), name, `${name} is not in normalized form`);
  }
});

test('the schema pattern accepts normalized usernames and rejects the rest', () => {
  const pattern = new RegExp(usernameSchema.pattern);
  for (const good of ['alice', 'a.b', 'a_b', 'a-b', 'user42']) {
    assert.ok(pattern.test(good), `${good} should be accepted`);
  }
  for (const bad of ['Alice', 'a b', 'a@b', 'héloïse', 'a/b']) {
    assert.ok(!pattern.test(bad), `${bad} should be rejected`);
  }
});

test('the schema length bounds leave room for the reserved names', () => {
  assert.ok(usernameSchema.minLength >= 3);
  assert.ok(usernameSchema.maxLength >= 32);
  for (const name of RESERVED_USERNAMES) {
    assert.ok(name.length <= usernameSchema.maxLength);
  }
});
