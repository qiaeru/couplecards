// SPDX-License-Identifier: MIT
// Fails when a change touches a precached static asset without bumping the
// service worker's VERSION constant. Browsers keep serving the old cached
// shell until that string changes, so the fix ships and nobody sees it.
//
// Needs a diff base, which only CI reliably has, so it lives outside
// scripts/check.mjs and takes the base ref as an argument:
//
//   node scripts/check-sw-version.mjs origin/main
//
// Emoji SVGs under public/icons/emoji/ are exempt: they are cached at runtime
// on first fetch rather than precached, so a new one needs no bump.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SW = 'public/sw.js';
const EXEMPT = [/^public\/icons\/emoji\//];

const base = process.argv[2];
if (!base) {
  console.error('usage: node scripts/check-sw-version.mjs <base-ref>');
  process.exit(2);
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

// Compare the merge base against the working tree: on a branch that trails
// main, a plain two-dot diff would blame it for assets someone else changed,
// and reading the working tree makes the check usable before committing too.
let mergeBase;
let changed;
try {
  mergeBase = git('merge-base', base, 'HEAD');
  changed = git('diff', '--name-only', mergeBase).split('\n').filter(Boolean);
} catch (err) {
  console.error(`could not diff against '${base}': ${err.message}`);
  process.exit(2);
}

const assets = changed.filter(
  (file) =>
    file.startsWith('public/') &&
    file !== SW &&
    !file.startsWith('public/vendor/') &&
    !EXEMPT.some((pattern) => pattern.test(file)),
);

if (assets.length === 0) {
  console.log('ok    sw-version');
  console.log('        no precached asset changed');
  process.exit(0);
}

function versionAt(ref) {
  const source = ref === null ? readFileSync(SW, 'utf8') : git('show', `${ref}:${SW}`);
  const match = source.match(/const VERSION = '([^']+)'/);
  return match ? match[1] : null;
}

const before = versionAt(mergeBase);
const after = versionAt(null);

if (before !== null && before === after) {
  console.log('FAIL  sw-version');
  console.log(
    `        ${assets.length} precached asset(s) changed but ${SW} still says '${after}'.`,
  );
  console.log(`        Bump the VERSION constant so clients drop the stale cache.`);
  console.log(`        changed: ${assets.join(', ')}`);
  process.exit(1);
}

console.log('ok    sw-version');
console.log(`        ${assets.length} asset(s) changed, VERSION moved ${before} -> ${after}`);
