// SPDX-License-Identifier: MIT
// The password policy is the app's only real gate. Each rule gets a case, so a
// reordering or a dropped check in validatePassword surfaces immediately.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  POLICY,
  hashPassword,
  verifyPassword,
  validatePassword,
  generateInitialPassword,
} from '../src/lib/password.js';

// Long, mixed and not in any dictionary: passes every hard rule and scores 4.
const STRONG = 'Trombone7-Quiver!Latch';

test('a strong password is accepted', () => {
  const result = validatePassword(STRONG);
  assert.equal(result.ok, true);
  assert.ok(result.score >= POLICY.zxcvbnMinScoreUser);
});

test('each hard rule reports its own code', () => {
  const cases = [
    ['Ab1!short', 'PASSWORD_TOO_SHORT'],
    ['Trombone7- Quiver!', 'PASSWORD_CONTAINS_WHITESPACE'],
    ['trombone7-quiver!latch', 'PASSWORD_MISSING_UPPER'],
    ['TROMBONE7-QUIVER!LATCH', 'PASSWORD_MISSING_LOWER'],
    ['Trombone-Quiver!Latch', 'PASSWORD_MISSING_DIGIT'],
    ['Trombone7QuiverLatch', 'PASSWORD_MISSING_SPECIAL'],
  ];
  for (const [password, code] of cases) {
    const result = validatePassword(password);
    assert.equal(result.ok, false, `${password} should be rejected`);
    assert.equal(result.code, code, `wrong code for ${password}`);
  }
});

test('a non-string password is rejected rather than thrown on', () => {
  for (const value of [undefined, null, 42, {}]) {
    assert.deepEqual(validatePassword(value), {
      ok: false,
      code: 'PASSWORD_INVALID',
      score: 0,
    });
  }
});

test('a password containing the username is rejected, whatever the case', () => {
  const result = validatePassword('Trombone7-Quiver!Latch', { userInputs: ['quiver'] });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'PASSWORD_CONTAINS_USERNAME');
});

test('admins face a stricter zxcvbn threshold than users', () => {
  assert.ok(POLICY.zxcvbnMinScoreAdmin > POLICY.zxcvbnMinScoreUser);
  // Structured enough to clear the hard rules, predictable enough to score
  // below the admin threshold.
  const middling = 'Password2024!x';
  const asUser = validatePassword(middling, { role: 'user' });
  const asAdmin = validatePassword(middling, { role: 'admin' });
  assert.ok(asAdmin.score < POLICY.zxcvbnMinScoreAdmin);
  assert.equal(asAdmin.ok, false);
  assert.equal(asAdmin.code, 'PASSWORD_TOO_WEAK');
  assert.equal(asUser.ok, asUser.score >= POLICY.zxcvbnMinScoreUser);
});

test('a hash verifies against its own password and nothing else', async () => {
  const hash = await hashPassword(STRONG);
  assert.match(hash, /^\$argon2id\$/);
  assert.equal(await verifyPassword(hash, STRONG), true);
  assert.equal(await verifyPassword(hash, `${STRONG}x`), false);
});

test('hashing the same password twice gives different hashes (random salt)', async () => {
  const [a, b] = await Promise.all([hashPassword(STRONG), hashPassword(STRONG)]);
  assert.notEqual(a, b);
  assert.equal(await verifyPassword(a, STRONG), true);
  assert.equal(await verifyPassword(b, STRONG), true);
});

test('a malformed hash returns false instead of throwing', async () => {
  assert.equal(await verifyPassword('not-a-phc-string', STRONG), false);
});

test('the generated initial password satisfies the policy it is handed to', () => {
  // Five draws: enough to catch a generator that only sometimes satisfies the
  // hard rules, cheap enough that zxcvbn scoring stays off the critical path.
  for (let i = 0; i < 5; i += 1) {
    const generated = generateInitialPassword();
    const result = validatePassword(generated, { role: 'admin' });
    assert.equal(result.ok, true, `generated password rejected: ${generated}`);
  }
});
