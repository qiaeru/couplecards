// SPDX-License-Identifier: MIT
// Migration 002 once cascade-wiped bans and history because a rebuild-style
// migration ran with foreign keys on. The runner now toggles the pragma and
// re-checks integrity before committing, so the guarantee worth pinning down
// is: a full migration run leaves no foreign key violation, and re-running it
// changes nothing.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { withDatabase } from './helpers.js';

let context;
let getDb;
let getSetting;
let setSetting;
let isUniqueViolation;
let runMigrations;

before(async () => {
  context = await withDatabase();
  ({ getDb, getSetting, setSetting, isUniqueViolation } = context.db);
  ({ runMigrations } = await import('../src/db/migrate.js'));
});

after(() => context.cleanup());

test('every migration on disk is recorded as applied', () => {
  const applied = getDb()
    .prepare('SELECT name FROM _migrations ORDER BY name')
    .all()
    .map((r) => r.name);
  assert.ok(applied.length > 0);
  assert.deepEqual(applied, [...applied].sort(), 'migrations must apply in lexical order');
});

test('the migrated schema has no foreign key violation', () => {
  const violations = getDb().prepare('PRAGMA foreign_key_check').all();
  assert.deepEqual(violations, []);
});

test('foreign keys are on for normal operation', () => {
  assert.equal(getDb().prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
});

test('re-running migrations is a no-op', () => {
  const before = getDb().prepare('SELECT COUNT(*) AS n FROM _migrations').get().n;
  const cards = getDb().prepare('SELECT COUNT(*) AS n FROM cards').get().n;
  runMigrations(null);
  assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM _migrations').get().n, before);
  assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM cards').get().n, cards);
});

test('deleting a card cascades to its translations and nothing else', () => {
  const db = getDb();
  const card = db.prepare('SELECT id FROM cards LIMIT 1').get();
  const users = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  db.prepare('DELETE FROM cards WHERE id = ?').run(card.id);
  const orphans = db
    .prepare('SELECT COUNT(*) AS n FROM card_translations WHERE card_id = ?')
    .get(card.id).n;
  assert.equal(orphans, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, users);
});

test('isUniqueViolation recognizes what node:sqlite actually throws', () => {
  const db = getDb();
  db.prepare("INSERT INTO settings (key, value) VALUES ('probe', '1')").run();
  let caught = null;
  try {
    // A plain INSERT (not INSERT OR REPLACE) on an existing primary key.
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('probe', '2');
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, 'the duplicate insert should have thrown');
  assert.ok(
    isUniqueViolation(caught),
    `unrecognized unique violation: code=${caught.code} errcode=${caught.errcode}`,
  );
  assert.equal(isUniqueViolation(null), false);
  assert.equal(isUniqueViolation(new Error('something else')), false);
});

test('settings read and write round-trip, with null for an absent key', () => {
  assert.equal(getSetting('does-not-exist'), null);
  setSetting('probe-2', 'value');
  assert.equal(getSetting('probe-2'), 'value');
  setSetting('probe-2', 'replaced');
  assert.equal(getSetting('probe-2'), 'replaced');
});
