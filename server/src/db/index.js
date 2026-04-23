// SPDX-License-Identifier: MIT
// SQLite connection built on Node's built-in `node:sqlite` module (stable
// since Node 24). Zero native compilation.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config.js';

let instance = null;

export function getDb() {
  if (instance) return instance;
  mkdirSync(dirname(config.dbPath), { recursive: true });
  const db = new DatabaseSync(config.dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA synchronous = NORMAL');
  instance = db;
  return db;
}

export function closeDb() {
  if (instance) {
    instance.close();
    instance = null;
  }
}

// Wraps `fn` inside an explicit BEGIN/COMMIT transaction. Mirrors the
// ergonomics of better-sqlite3's `db.transaction(fn)` helper.
export function transaction(fn) {
  return (...args) => {
    const db = getDb();
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
}
