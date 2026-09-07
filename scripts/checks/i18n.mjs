// SPDX-License-Identifier: MIT
// Guards the UI catalogues in public/locales:
//   * every locale carries exactly the same keys as English, none of them empty;
//   * every key referenced from JS or HTML exists;
//   * no key sits unused in the catalogues.
// A missing key is invisible in the browser: t() silently falls back to
// English, so a French user reads English text and nobody notices.

import { repoPath, walk, readJson, read, rel } from './lib.mjs';

const FALLBACK = 'en';

// Any quoted, space-free string holding a dot. Narrowed afterwards to the ones
// whose first segment is a real catalogue namespace, which is what separates
// `errors.RATE_LIMITED` from `image/svg+xml` or `couplecards.sid`. Matching the
// literal rather than the call site covers every helper that forwards a key
// (t, tn, tOr, showError) plus the data-i18n attributes in HTML.
const LITERAL_RE = /(['"`])([^'"`\s>=<]*\.[^'"`\s>=<]*)\1/g;

// Strips // and /* */ comments (JS) and <!-- --> comments (HTML) without
// touching quoted strings, so a key named inside a comment is not mistaken for
// a real usage. Not a full parser: it only tracks quotes, which is all the
// source tree needs.
function stripComments(text, html) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (quote) {
      if (c === '\\') {
        out += c + (next ?? '');
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      out += c;
      i += 1;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    if (!html && c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (!html && c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    if (html && text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      i = end === -1 ? text.length : end + 3;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function collectCatalogues() {
  const files = walk(repoPath('public', 'locales'), (f) => f.endsWith('.json'));
  const byLocale = new Map();
  for (const file of files) {
    const locale = rel(file)
      .split('/')
      .pop()
      .replace(/\.json$/, '');
    byLocale.set(locale, readJson(file));
  }
  return byLocale;
}

// One literal can hold several keys: `data-i18n-attr` packs them as
// "aria-label:nav.main,placeholder:collection.search".
function candidates(raw) {
  const out = [raw];
  for (const pair of raw.split(',')) {
    const colon = pair.indexOf(':');
    out.push((colon === -1 ? pair : pair.slice(colon + 1)).trim());
  }
  return out;
}

// Returns every key the source tree asks for: exact strings, plus regexes for
// template literals whose `${...}` hole cannot be resolved statically.
function collectUsages(namespaces) {
  const exact = new Set();
  const patterns = [];
  const sources = [
    ...walk(repoPath('public', 'js'), (f) => f.endsWith('.js')),
    ...walk(repoPath('public'), (f) => f.endsWith('.html')),
  ];
  for (const file of sources) {
    const html = file.endsWith('.html');
    const text = stripComments(read(file), html);
    for (const match of text.matchAll(LITERAL_RE)) {
      for (const raw of candidates(match[2])) {
        if (!namespaces.has(raw.split('.')[0])) continue;
        if (raw.includes('${')) {
          const escaped = raw
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\\\$\\\{[^}]*\\\}/g, '[^.]+');
          patterns.push(new RegExp(`^${escaped}$`));
        } else {
          exact.add(raw);
        }
      }
    }
  }
  return { exact, patterns };
}

export function run() {
  const errors = [];
  const notes = [];
  const catalogues = collectCatalogues();
  const reference = catalogues.get(FALLBACK);
  if (!reference) {
    return { name: 'i18n', errors: [`public/locales/${FALLBACK}.json is missing`], notes };
  }
  const referenceKeys = Object.keys(reference);
  const namespaces = new Set(referenceKeys.map((k) => k.split('.')[0]));

  for (const [locale, catalogue] of catalogues) {
    if (locale === FALLBACK) continue;
    const keys = Object.keys(catalogue);
    const present = new Set(keys);
    const missing = referenceKeys.filter((k) => !present.has(k));
    const extra = keys.filter((k) => !(k in reference));
    const empty = keys.filter((k) => String(catalogue[k]).trim() === '');
    if (missing.length > 0) {
      errors.push(`${locale}.json is missing ${missing.length} key(s): ${missing.join(', ')}`);
    }
    if (extra.length > 0) {
      errors.push(
        `${locale}.json defines ${extra.length} key(s) absent from ${FALLBACK}.json: ${extra.join(', ')}`,
      );
    }
    if (empty.length > 0) {
      errors.push(`${locale}.json has ${empty.length} empty translation(s): ${empty.join(', ')}`);
    }
  }

  const { exact, patterns } = collectUsages(namespaces);
  const known = new Set(referenceKeys);
  // tn() asks for `key.<plural category>` and the settings rows use
  // `namespace.action.action`, so a stem whose children exist counts as known.
  const isKnown = (key) => known.has(key) || referenceKeys.some((k) => k.startsWith(`${key}.`));
  const missingKeys = [...exact].filter((k) => !isKnown(k));
  if (missingKeys.length > 0) {
    errors.push(
      `${missingKeys.length} key(s) used in the source tree but absent from ${FALLBACK}.json: ${missingKeys.join(', ')}`,
    );
  }

  const usedStems = [...exact];
  const isUsed = (key) =>
    exact.has(key) ||
    patterns.some((p) => p.test(key)) ||
    usedStems.some((used) => key.startsWith(`${used}.`));
  const unused = referenceKeys.filter((k) => !isUsed(k));
  if (unused.length > 0) {
    errors.push(
      `${unused.length} key(s) defined in ${FALLBACK}.json but never used: ${unused.join(', ')}`,
    );
  }

  notes.push(`${catalogues.size} locales, ${referenceKeys.length} keys each`);
  return { name: 'i18n', errors, notes };
}
