// SPDX-License-Identifier: MIT
// First-run seed: default admin, optional demo account, multilingual starter
// deck from every data/cards.*.json.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../config.js';
import { getDb, transaction } from './index.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { SUPPORTED_LOCALES } from '../lib/locales.js';

const DEFAULT_ADMIN_PASSWORD = 'changeme';
const DEMO_USERNAME = 'demo';
const DEMO_PASSWORD = 'demo';
const SEED_FILE_PATTERN = /^cards\.([a-z]{2})\.json$/i;

export async function runSeed(logger) {
  const db = getDb();

  // Hash+verify round-trip at boot so a hash-wasm WebAssembly load failure
  // fails loudly here instead of masquerading as "wrong password" later.
  const probe = await hashPassword('__startup_probe__');
  const probeOk = await verifyPassword(probe, '__startup_probe__');
  if (!probeOk) {
    throw new Error('Argon2id self-test failed — hash-wasm cannot verify its own hashes on this machine');
  }

  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (userCount === 0) {
    const locale = pickSeedLocale();
    const hash = await hashPassword(DEFAULT_ADMIN_PASSWORD);
    db.prepare(`
      INSERT INTO users (username, password_hash, role, must_change_password, locale)
      VALUES ('couplecards', ?, 'admin', 1, ?)
    `).run(hash, locale);

    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .run('seed_locale', locale);

    logger?.info({ locale }, 'seeded default admin (username=couplecards, password=changeme)');
  }

  if (config.enableDemoAccount) {
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(DEMO_USERNAME);
    if (!existing) {
      const locale = db.prepare("SELECT value FROM settings WHERE key = 'seed_locale'").get()?.value || 'en';
      const hash = await hashPassword(DEMO_PASSWORD);
      db.prepare(`
        INSERT INTO users (username, password_hash, role, must_change_password, is_demo, locale)
        VALUES (?, ?, 'user', 0, 1, ?)
      `).run(DEMO_USERNAME, hash, locale);
      logger?.info('seeded demo account (username=demo, password=demo) — state resets on each sign-in');
    }
  }

  const cardCount = db.prepare('SELECT COUNT(*) AS n FROM cards').get().n;
  if (cardCount === 0) {
    const deck = loadSeedDeck(logger);
    if (deck.length === 0) {
      logger?.warn('no cards.*.json files found under the data directory, skipping card seed');
      return;
    }
    const insertCard = db.prepare(`
      INSERT INTO cards (id, pile, foil, sort_order)
      VALUES (@id, @pile, @foil, @sort_order)
    `);
    const insertTr = db.prepare(`
      INSERT INTO card_translations (card_id, locale, title, description)
      VALUES (?, ?, ?, ?)
    `);
    const applySeed = transaction(() => {
      for (const card of deck) {
        insertCard.run({
          id: card.id,
          pile: card.pile,
          foil: card.foil ? 1 : 0,
          sort_order: card.sortOrder,
        });
        for (const [locale, text] of Object.entries(card.translations)) {
          insertTr.run(card.id, locale, text.title, text.description);
        }
      }
    });
    applySeed();
    logger?.info({ count: deck.length, locales: Object.keys(deck[0]?.translations || {}) }, 'seeded card deck');
  }
}

export async function maybeResetAdmin(logger) {
  if (!config.adminReset) return;
  const db = getDb();
  const hash = await hashPassword(DEFAULT_ADMIN_PASSWORD);
  db.prepare(`
    UPDATE users
    SET password_hash = ?,
        must_change_password = 1,
        failed_attempts = 0,
        locked_until = NULL,
        session_epoch = session_epoch + 1,
        updated_at = datetime('now')
    WHERE role = 'admin'
  `).run(hash);
  logger?.warn('ADMIN_RESET was enabled: admin password reset to "changeme". Unset the variable and restart.');
}

// Merges every data/cards.<locale>.json into a single deck keyed by card id.
// A card may ship only one translation; pile and foil must agree across
// locales for the same id.
function loadSeedDeck(logger) {
  const dir = config.dataSeedDir;
  if (!existsSync(dir)) return [];
  const byId = new Map();
  let firstLocaleOrder = null;
  for (const file of readdirSync(dir)) {
    const match = SEED_FILE_PATTERN.exec(file);
    if (!match) continue;
    const locale = match[1].toLowerCase();
    if (!SUPPORTED_LOCALES.includes(locale)) {
      logger?.warn({ file, locale }, 'skipping seed file for an unsupported locale');
      continue;
    }
    const payload = JSON.parse(readFileSync(resolve(dir, file), 'utf8'));
    const cards = Array.isArray(payload?.cards) ? payload.cards : [];
    if (firstLocaleOrder === null) firstLocaleOrder = locale;
    cards.forEach((raw, index) => {
      if (!raw || typeof raw.id !== 'string') return;
      const existing = byId.get(raw.id);
      if (existing) {
        if (existing.pile !== raw.pile || !!existing.foil !== !!raw.foil) {
          throw new Error(
            `seed card "${raw.id}": pile or foil flag differs between locales (${existing.pile}/${existing.foil} vs ${raw.pile}/${!!raw.foil})`,
          );
        }
        existing.translations[locale] = {
          title: String(raw.title ?? ''),
          description: String(raw.description ?? ''),
        };
      } else {
        const order = locale === firstLocaleOrder ? index : Number.MAX_SAFE_INTEGER;
        byId.set(raw.id, {
          id: raw.id,
          pile: raw.pile,
          foil: !!raw.foil,
          sortOrder: order,
          translations: {
            [locale]: {
              title: String(raw.title ?? ''),
              description: String(raw.description ?? ''),
            },
          },
        });
      }
    });
  }
  // Normalise sort order so cards introduced only by a later locale still
  // get a deterministic position.
  const deck = [...byId.values()];
  deck.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  deck.forEach((card, index) => { card.sortOrder = index; });
  return deck;
}

function pickSeedLocale() {
  if (SUPPORTED_LOCALES.includes(config.seedLocale)) return config.seedLocale;
  const lang = (process.env.LANG || '').toLowerCase();
  if (lang.startsWith('fr')) return 'fr';
  return 'en';
}
