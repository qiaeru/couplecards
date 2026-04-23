// SPDX-License-Identifier: MIT
// Minimal migration runner: reads server/migrations/*.sql in lexical order
// and applies the ones not yet recorded in the _migrations table.

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, transaction } from './index.js';

const MIGRATIONS_DIR = resolve(fileURLToPath(import.meta.url), '../../../migrations');

export function runMigrations(logger) {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    db.prepare('SELECT name FROM _migrations').all().map((r) => r.name),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const record = db.prepare('INSERT INTO _migrations (name) VALUES (?)');

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
    transaction(() => {
      db.exec(sql);
      record.run(file);
    })();
    logger?.info({ migration: file }, 'applied migration');
  }
}
