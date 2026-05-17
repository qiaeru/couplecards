// SPDX-License-Identifier: MIT
// Admin-only deck maintenance: export the current multilingual deck as a ZIP
// containing one cards.<locale>.json file per supported locale, synchronise
// the database from the seed files shipped under data/, or import an uploaded
// backup (already parsed into the internal multilingual shape by the client).

import { promisify } from 'node:util';
import { zip as zipCb, strToU8 } from 'fflate';
import { requireAdmin } from '../lib/auth.js';
import {
  readSeedDecks,
  readDbDeck,
  validateDeckPayload,
  summariseDiff,
  applyDeckSync,
  serialiseForExport,
} from '../lib/deckSync.js';
import { SUPPORTED_LOCALES } from '../lib/locales.js';
import { invalidateDeckVersion } from './cards.js';

const zipAsync = promisify(zipCb);
const DECK_ERRORS = new Set(['SEED_FILE_NOT_FOUND', 'INVALID_DECK', 'INVALID_MODE']);

function handleDeckError(err, reply) {
  if (err && DECK_ERRORS.has(err.deckCode)) {
    return reply.code(400).send({ error: err.deckCode });
  }
  throw err;
}

export default async function adminCardRoutes(app) {
  app.get('/cards/export', { preHandler: requireAdmin }, async (_request, reply) => {
    const byLocale = serialiseForExport();
    const entries = {};
    for (const locale of SUPPORTED_LOCALES) {
      const payload = { version: 1, cards: byLocale[locale] ?? [] };
      entries[`cards.${locale}.json`] = strToU8(`${JSON.stringify(payload, null, 2)}\n`);
    }
    const zipped = await zipAsync(entries, { level: 6 });
    const buffer = Buffer.from(zipped);
    const stamp = new Date().toISOString().slice(0, 10);
    reply.header('Content-Type', 'application/zip');
    reply.header('Content-Disposition', `attachment; filename="couplecards-deck-${stamp}.zip"`);
    reply.header('Cache-Control', 'no-store');
    return reply.send(buffer);
  });

  app.post('/cards/sync', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        required: ['mode'],
        additionalProperties: false,
        properties: {
          mode: { type: 'string', enum: ['mirror', 'upsert'] },
          dryRun: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const { mode, dryRun = false } = request.body;
    let next;
    try {
      next = readSeedDecks();
    } catch (err) {
      return handleDeckError(err, reply);
    }
    if (dryRun) {
      return { dryRun: true, ...summariseDiff(readDbDeck(), next, mode) };
    }
    try {
      const result = applyDeckSync(next, mode);
      invalidateDeckVersion();
      return { dryRun: false, ...result };
    } catch (err) {
      return handleDeckError(err, reply);
    }
  });

  app.post('/cards/import', {
    preHandler: requireAdmin,
    // Body size is already capped by the global bodyLimit in index.js (512 KB).
    // `validateDeckPayload` runs a second pass inside `deckSync.js` to check
    // each card; the lightweight schema here is just a first gate.
    schema: {
      body: {
        type: 'object',
        required: ['deck', 'mode'],
        additionalProperties: false,
        properties: {
          deck: {
            type: 'object',
            additionalProperties: false,
            properties: {
              version: {},
              cards: { type: 'array', maxItems: 2000 },
              cardsByLocale: { type: 'object', maxProperties: 16 },
            },
          },
          mode: { type: 'string', enum: ['mirror', 'upsert'] },
          dryRun: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const { deck, mode, dryRun = false } = request.body;
    let next;
    try {
      next = validateDeckPayload(deck);
    } catch (err) {
      return handleDeckError(err, reply);
    }
    if (dryRun) {
      return { dryRun: true, ...summariseDiff(readDbDeck(), next, mode) };
    }
    try {
      const result = applyDeckSync(next, mode);
      invalidateDeckVersion();
      return { dryRun: false, ...result };
    } catch (err) {
      return handleDeckError(err, reply);
    }
  });
}
