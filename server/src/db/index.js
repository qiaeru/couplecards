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

// Reads a value from the generic `settings` key/value table. Returns null when
// the key is absent (callers treat "no row" as the default, e.g. registration off).
export function getSetting(key) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setSetting(key, value) {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

// node:sqlite surfaces a UNIQUE violation as an Error with code
// 'ERR_SQLITE_ERROR' and the extended result code 2067 (errcode), not the
// 'SQLITE_CONSTRAINT_UNIQUE' string some drivers use. Match either, and the
// message as a last resort, so duplicate-key handling stays robust.
export function isUniqueViolation(err) {
  if (!err) return false;
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return true;
  if (err.errcode === 2067) return true;
  return /UNIQUE constraint failed/i.test(err.message || '');
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
