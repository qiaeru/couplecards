// SPDX-License-Identifier: MIT
// Inserts French typographic non-breaking spaces into the FR locale file and
// the FR card deck. Run with `node scripts/frenchify.mjs` from the repo root.
// Rules: U+00A0 before ":", U+202F before ";", "!", "?" and with "«" / "»".

import { readFileSync, writeFileSync } from 'node:fs';

const NBSP = ' ';
const NARROW = ' ';

function frenchify(s) {
  if (typeof s !== 'string') return s;
  let out = s;
  out = out.replace(/«[   ]+/g, '«' + NARROW);
  out = out.replace(/[   ]+»/g, NARROW + '»');
  out = out.replace(/[   ]+([;!?])/g, NARROW + '$1');
  // Skip "://" and Windows drive paths when matching the space before ":".
  out = out.replace(/(^|[^:/\\])[   ]+:/g, (_m, pre) => pre + NBSP + ':');
  return out;
}

function walk(val) {
  if (typeof val === 'string') return frenchify(val);
  if (Array.isArray(val)) return val.map(walk);
  if (val && typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) out[k] = walk(v);
    return out;
  }
  return val;
}

const files = ['public/locales/fr.json', 'data/cards.fr.json'];
for (const file of files) {
  const before = readFileSync(file, 'utf8');
  const json = JSON.parse(before);
  const updated = walk(json);
  writeFileSync(file, `${JSON.stringify(updated, null, 2)}\n`);
  const text = JSON.stringify(updated);
  let nbsp = 0, narrow = 0;
  for (const ch of text) {
    if (ch === NBSP) nbsp++;
    else if (ch === NARROW) narrow++;
  }
  console.log(`${file}: ${nbsp} U+00A0, ${narrow} U+202F`);
}
