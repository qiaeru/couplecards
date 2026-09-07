// SPDX-License-Identifier: MIT
// validateDeckPayload is the only thing standing between an uploaded JSON file
// and the cards table. Every rejection below is a file an operator could
// plausibly upload by hand.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { withDatabase } from './helpers.js';

let context;
let validateDeckPayload;
let readSeedDecks;
let applyDeckSync;
let readDbDeck;
let summariseDiff;

before(async () => {
  context = await withDatabase();
  ({ validateDeckPayload, readSeedDecks, applyDeckSync, readDbDeck, summariseDiff } =
    await import('../src/lib/deckSync.js'));
});

after(() => context.cleanup());

function card(overrides = {}) {
  return {
    id: 'test-001',
    pile: 'home',
    translations: { en: { title: 'Title', description: 'Description' } },
    ...overrides,
  };
}

test('the internal shape round-trips through the validator', () => {
  const deck = validateDeckPayload({ cards: [card()] });
  assert.equal(deck.length, 1);
  assert.deepEqual(deck[0], {
    id: 'test-001',
    pile: 'home',
    foil: false,
    emoji: null,
    sortOrder: 0,
    translations: { en: { title: 'Title', description: 'Description' } },
  });
});

test('the seed shape merges one entry per locale into a single card', () => {
  const deck = validateDeckPayload({
    cardsByLocale: {
      en: [{ id: 'test-001', pile: 'home', title: 'Title', description: 'Description' }],
      fr: [{ id: 'test-001', pile: 'home', title: 'Titre', description: 'Description FR' }],
    },
  });
  assert.equal(deck.length, 1);
  assert.deepEqual(Object.keys(deck[0].translations).sort(), ['en', 'fr']);
});

test('a card whose structure disagrees between locales is rejected', () => {
  assert.throws(
    () =>
      validateDeckPayload({
        cardsByLocale: {
          en: [{ id: 'test-001', pile: 'home', title: 'T', description: 'D' }],
          fr: [{ id: 'test-001', pile: 'outdoor', title: 'T', description: 'D' }],
        },
      }),
    /INVALID_DECK/,
  );
});

test('structural rules are enforced', () => {
  const rejected = [
    ['an unknown pile', card({ pile: 'garden' })],
    ['an uppercase id', card({ id: 'Test-001' })],
    ['an empty id', card({ id: '' })],
    ['a non-boolean foil', card({ foil: 'yes' })],
    ['an emoji slug with a slash', card({ emoji: 'a/b' })],
    ['no translation at all', card({ translations: {} })],
    ['an empty title', card({ translations: { en: { title: '  ', description: 'D' } } })],
    ['an empty description', card({ translations: { en: { title: 'T', description: '' } } })],
    [
      'an over-long title',
      card({ translations: { en: { title: 'x'.repeat(201), description: 'D' } } }),
    ],
    [
      'an over-long description',
      card({ translations: { en: { title: 'T', description: 'x'.repeat(1001) } } }),
    ],
  ];
  for (const [label, payload] of rejected) {
    assert.throws(() => validateDeckPayload({ cards: [payload] }), /INVALID_DECK/, label);
  }
});

test('a duplicate id inside one payload is rejected', () => {
  assert.throws(() => validateDeckPayload({ cards: [card(), card()] }), /INVALID_DECK/);
});

test('a payload that is neither shape is rejected', () => {
  for (const payload of [null, 'nope', 42, {}, { cards: 'nope' }]) {
    assert.throws(() => validateDeckPayload(payload), /INVALID_DECK/);
  }
});

test('titles and descriptions are trimmed', () => {
  const deck = validateDeckPayload({
    cards: [card({ translations: { en: { title: '  T  ', description: '  D  ' } } })],
  });
  assert.deepEqual(deck[0].translations.en, { title: 'T', description: 'D' });
});

test('the repo seed decks are readable and complete', () => {
  const deck = readSeedDecks();
  assert.ok(deck.length > 0);
  // Every card must have English: getCardText falls back to it.
  for (const entry of deck) {
    assert.ok(entry.translations.en, `card ${entry.id} has no English translation`);
  }
  // finaliseDeck renumbers sortOrder into a dense 0..n-1 range.
  assert.deepEqual(
    deck.map((c) => c.sortOrder),
    deck.map((_, i) => i),
  );
});

test('mirror removes cards absent from the payload, upsert keeps them', () => {
  const before = readDbDeck().length;
  assert.ok(before > 0, 'the seed should have populated the deck');

  const kept = readDbDeck()[0];
  const single = [{ ...kept, sortOrder: 0 }];

  assert.deepEqual(summariseDiff(readDbDeck(), single, 'upsert').keptOutsideFile, before - 1);
  assert.deepEqual(summariseDiff(readDbDeck(), single, 'mirror').removed, before - 1);

  const upserted = applyDeckSync(single, 'upsert');
  assert.equal(upserted.removed, 0);
  assert.equal(readDbDeck().length, before);

  const mirrored = applyDeckSync(single, 'mirror');
  assert.equal(mirrored.removed, before - 1);
  assert.equal(readDbDeck().length, 1);
});

test('an unknown sync mode is rejected before anything is written', () => {
  assert.throws(() => applyDeckSync([], 'replace'), /INVALID_MODE/);
});
