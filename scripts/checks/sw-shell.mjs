// SPDX-License-Identifier: MIT
// Guards the service worker's precache list. A new file under public/js,
// public/css or public/views that never lands in the SHELL array is served
// online and simply missing offline, which is invisible until a user opens the
// app on a plane. A stale entry is worse: cache.add() rejects and the install
// handler logs a partial precache.
//
// Deck emoji under public/icons/emoji/ are exempt on purpose: they are cached
// at runtime on first fetch, so only the pile and heart icons are precached.

import { repoPath, walk, read, rel, existsExact } from './lib.mjs';

const SW = repoPath('public', 'sw.js');

// Directories whose every file must appear in SHELL.
const REQUIRED_TREES = [
  ['public', 'js'],
  ['public', 'css'],
  ['public', 'views'],
  ['public', 'locales'],
];

function shellEntries() {
  const text = read(SW);
  const start = text.indexOf('const SHELL = [');
  if (start === -1) return null;
  const end = text.indexOf('];', start);
  const body = text.slice(start, end);
  return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

export function run() {
  const errors = [];
  const notes = [];
  const entries = shellEntries();
  if (!entries) {
    return { name: 'sw-shell', errors: ['could not find the SHELL array in public/sw.js'], notes };
  }
  const listed = new Set(entries);

  const required = [];
  for (const tree of REQUIRED_TREES) {
    // Markdown notes sit next to the locale catalogues and are not shipped.
    for (const file of walk(repoPath(...tree), (f) => !f.endsWith('.md'))) {
      required.push(`/${rel(file).replace(/^public\//, '')}`);
    }
  }
  // Top-level pages: '/' is the cached alias for index.html.
  for (const file of walk(repoPath('public'), (f) => f.endsWith('.html'))) {
    const path = `/${rel(file).replace(/^public\//, '')}`;
    if (!path.includes('/', 1)) required.push(path);
  }

  const missing = required.filter((p) => !listed.has(p));
  if (missing.length > 0) {
    errors.push(`public/sw.js SHELL is missing ${missing.length} file(s): ${missing.join(', ')}`);
  }

  // '/' is the cached alias for index.html and /manifest.webmanifest is
  // content-negotiated by routes/manifest.js; neither exists on disk.
  const SERVED_ROUTES = new Set(['/', '/manifest.webmanifest']);
  const stale = entries.filter((entry) => {
    if (SERVED_ROUTES.has(entry)) return false;
    return !existsExact(repoPath('public', entry.replace(/^\//, '')));
  });
  if (stale.length > 0) {
    errors.push(
      `public/sw.js SHELL lists ${stale.length} file(s) that do not exist: ${stale.join(', ')}`,
    );
  }

  const version = read(SW).match(/const VERSION = '([^']+)'/);
  notes.push(`${entries.length} precached assets, version ${version ? version[1] : 'unknown'}`);
  return { name: 'sw-shell', errors, notes };
}
