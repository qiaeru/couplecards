// SPDX-License-Identifier: MIT
// Shared helpers for the repo checks. Deliberately dependency-free: they run
// on a bare `node scripts/check.mjs` with nothing installed.

import { readdirSync, statSync, readFileSync } from 'node:fs';
import { resolve, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(import.meta.url), '../../..');

export function repoPath(...parts) {
  return join(ROOT, ...parts);
}

export function rel(absolute) {
  return relative(ROOT, absolute).split(sep).join('/');
}

// Recursively lists files under `dir`, returning absolute paths. A missing
// directory yields an empty list so a check never crashes on a moved folder.
export function walk(dir, filter = () => true) {
  let out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries.sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out = out.concat(walk(full, filter));
    } else if (filter(full)) {
      out.push(full);
    }
  }
  return out;
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function read(path) {
  return readFileSync(path, 'utf8');
}

// Case-sensitive existence test. Windows and macOS resolve `Core/Api.js` for
// `core/api.js`, so a plain existsSync would let a mis-cased import through
// and it would only break inside the Linux container.
export function existsExact(absolute) {
  const parts = rel(absolute).split('/');
  if (parts[0] === '..') return false;
  let current = ROOT;
  for (const part of parts) {
    let entries;
    try {
      entries = readdirSync(current);
    } catch {
      return false;
    }
    if (!entries.includes(part)) return false;
    current = join(current, part);
  }
  return true;
}
