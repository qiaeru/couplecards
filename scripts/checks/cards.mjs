// SPDX-License-Identifier: MIT
// Validates data/cards.<locale>.json with the server's own reader rather than
// a second copy of the rules, so a deck that passes here is a deck the server
// will accept at boot. readSeedDecks() enforces the id/pile/emoji shape, the
// title and description limits, and cross-locale structural agreement (a card
// cannot be `foil` in English and plain in French).
//
// On top of that: every card needs an English entry, since getCardText falls
// back to English, and every emoji slug needs its SVG or the card renders with
// a hole where the icon should be.

import { repoPath, readJson, existsExact, walk, rel } from './lib.mjs';

// Best-effort explanation for an INVALID_DECK: the structural fields of a card
// must be identical in every locale file, and that mismatch is the failure
// nobody spots by eye across five files.
function diagnose() {
  const out = [];
  const byId = new Map();
  for (const file of walk(repoPath('data'), (f) => /cards\.[a-z]{2}\.json$/.test(f))) {
    const locale = rel(file).split('/').pop().split('.')[1];
    let payload;
    try {
      payload = readJson(file);
    } catch (err) {
      out.push(`${rel(file)} is not valid JSON: ${err.message}`);
      continue;
    }
    if (!Array.isArray(payload?.cards)) {
      out.push(`${rel(file)} has no "cards" array`);
      continue;
    }
    for (const card of payload.cards) {
      if (!card?.id) {
        out.push(`${rel(file)} holds a card with no id`);
        continue;
      }
      const shape = `pile=${card.pile} foil=${!!card.foil} emoji=${card.emoji ?? null}`;
      const seen = byId.get(card.id) ?? new Map();
      seen.set(shape, [...(seen.get(shape) ?? []), locale]);
      byId.set(card.id, seen);
    }
  }
  for (const [id, shapes] of byId) {
    if (shapes.size < 2) continue;
    const detail = [...shapes]
      .map(([shape, locales]) => `${locales.join('/')}: ${shape}`)
      .join(' vs ');
    out.push(`card '${id}' has different structural fields per locale (${detail})`);
  }
  return out;
}

export async function run() {
  const errors = [];
  const notes = [];

  // config.js reads DATA_SEED_DIR at import time, so point it at the repo's
  // data/ directory before the server modules are pulled in.
  process.env.DATA_SEED_DIR = repoPath('data');
  let deck;
  try {
    const { readSeedDecks } = await import(
      new URL('../../server/src/lib/deckSync.js', import.meta.url)
    );
    deck = readSeedDecks();
  } catch (err) {
    const code = err?.deckCode ?? err?.message ?? String(err);
    const errors = [`data/ decks rejected by the server reader: ${code}`];
    // The reader throws a bare INVALID_DECK without naming the card, so run a
    // structural diff to turn it into something actionable.
    errors.push(...diagnose());
    return { name: 'cards', errors, notes };
  }

  const noEnglish = deck.filter((card) => !card.translations.en).map((card) => card.id);
  if (noEnglish.length > 0) {
    errors.push(
      `${noEnglish.length} card(s) have no English translation, so every locale falls back to nothing: ${noEnglish.join(', ')}`,
    );
  }

  const available = new Set(
    walk(repoPath('public', 'icons', 'emoji'), (f) => f.endsWith('.svg')).map((f) =>
      rel(f)
        .split('/')
        .pop()
        .replace(/\.svg$/, ''),
    ),
  );
  const used = new Set(deck.map((card) => card.emoji).filter(Boolean));
  const missingIcons = [...used].filter((slug) => !available.has(slug));
  if (missingIcons.length > 0) {
    errors.push(
      `${missingIcons.length} emoji slug(s) used by a card have no SVG in public/icons/emoji: ${missingIcons.join(', ')}`,
    );
  }

  // Slugs the app draws itself (piles, hearts) are never on a card, so an
  // unused SVG is reported rather than failed: it may be deliberate.
  const orphans = [...available].filter((slug) => !used.has(slug));
  if (orphans.length > 0) {
    notes.push(`${orphans.length} emoji SVG(s) not used by any card: ${orphans.join(', ')}`);
  }

  const counts = {};
  for (const card of deck) {
    for (const locale of Object.keys(card.translations)) {
      counts[locale] = (counts[locale] ?? 0) + 1;
    }
  }
  const summary = Object.entries(counts)
    .map(([locale, n]) => `${locale} ${n}`)
    .join(', ');
  notes.push(`${deck.length} cards (${summary})`);

  // A locale missing translations is legitimate mid-authoring, but worth
  // seeing, so surface it as a note rather than an error.
  for (const [locale, n] of Object.entries(counts)) {
    if (n < deck.length) {
      notes.push(`${locale} is missing ${deck.length - n} of ${deck.length} card translations`);
    }
  }

  // Guards against a data file that exists but was never wired into the deck.
  const files = walk(repoPath('data'), (f) => /cards\.[a-z]{2}\.json$/.test(f));
  for (const file of files) {
    const payload = readJson(file);
    if (!Array.isArray(payload.cards)) {
      errors.push(`${rel(file)} has no "cards" array`);
    }
  }

  if (!existsExact(repoPath('data', 'cards.en.json'))) {
    errors.push('data/cards.en.json is missing');
  }

  return { name: 'cards', errors, notes };
}
