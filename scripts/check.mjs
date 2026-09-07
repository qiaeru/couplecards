// SPDX-License-Identifier: MIT
// Runs the repo consistency checks. These guard invariants no linter knows
// about: locale parity, the service worker precache list, the seed decks, and
// every local file reference. Dependency-free on purpose, so `node
// scripts/check.mjs` works on a bare clone.
//
// Usage: node scripts/check.mjs [name ...]

import { run as locales } from './checks/locales.mjs';
import { run as i18n } from './checks/i18n.mjs';
import { run as swShell } from './checks/sw-shell.mjs';
import { run as cards } from './checks/cards.mjs';
import { run as references } from './checks/references.mjs';

const CHECKS = { locales, i18n, 'sw-shell': swShell, cards, references };

const requested = process.argv.slice(2);
const unknown = requested.filter((name) => !(name in CHECKS));
if (unknown.length > 0) {
  console.error(`unknown check(s): ${unknown.join(', ')}`);
  console.error(`available: ${Object.keys(CHECKS).join(', ')}`);
  process.exit(2);
}
const selected = requested.length > 0 ? requested : Object.keys(CHECKS);

let failed = 0;
for (const name of selected) {
  const result = await CHECKS[name]();
  const ok = result.errors.length === 0;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`);
  for (const note of result.notes) console.log(`        ${note}`);
  for (const error of result.errors) console.log(`        ${error}`);
}

if (failed > 0) {
  console.log(`\n${failed} of ${selected.length} checks failed.`);
  process.exit(1);
}
console.log(`\n${selected.length} checks passed.`);
