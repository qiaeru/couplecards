// SPDX-License-Identifier: MIT
// First-run seed: default admin, optional demo account, multilingual starter
// deck from every data/cards.*.json.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../config.js';
import { getDb, transaction, setSetting } from './index.js';
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
    throw new Error('Argon2id self-test failed: hash-wasm cannot verify its own hashes on this machine');
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

    // First-boot default for public registration. The admin GUI toggle owns
    // this value afterward; the env var only seeds the initial state so a
    // headless deployment can open registration without touching the panel.
    setSetting('registration_enabled', config.enableRegistration ? '1' : '0');

    logger?.info({ locale }, 'seeded default admin (username=couplecards, password=changeme)');
  }

  // ENABLE_DEMO_ACCOUNT is the single source of truth for the demo row:
  // flag on seeds it when missing, flag off prunes it when still present.
  // The admin UI refuses to delete the demo row so the operator points at
  // the env var rather than at a button that would only last until the
  // next restart. CASCADE on bans and history cleans up automatically.
  if (config.enableDemoAccount) {
    const existing = db.prepare('SELECT id FROM users WHERE username = ? AND is_demo = 1').get(DEMO_USERNAME);
    if (!existing) {
      const locale = db.prepare("SELECT value FROM settings WHERE key = 'seed_locale'").get()?.value || 'en';
      const hash = await hashPassword(DEMO_PASSWORD);
      db.prepare(`
        INSERT INTO users (username, password_hash, role, must_change_password, is_demo, locale)
        VALUES (?, ?, 'user', 0, 1, ?)
      `).run(DEMO_USERNAME, hash, locale);
      logger?.info('seeded demo account (username=demo, password=demo), state resets on each sign-in');
    }
  } else {
    const removed = db.prepare('DELETE FROM users WHERE is_demo = 1').run();
    if (removed.changes > 0) {
      logger?.info('ENABLE_DEMO_ACCOUNT is off: removed the demo account row');
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
      INSERT INTO cards (id, pile, foil, emoji, sort_order)
      VALUES (@id, @pile, @foil, @emoji, @sort_order)
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
          emoji: card.emoji ?? null,
          sort_order: card.sortOrder,
        });
        for (const [locale, text] of Object.entries(card.translations)) {
          insertTr.run(card.id, locale, text.title, text.description);
        }
      }
    });
    applySeed();
    logger?.info({ count: deck.length, locales: Object.keys(deck[0]?.translations || {}) }, 'seeded card deck');
  } else {
    backfillCardEmoji(logger);
  }
}

// Back-fills `cards.emoji` for rows still at NULL, using whatever the seed
// JSON files declare for that id. Runs on every boot once the deck is already
// seeded, so an instance that pre-dates the emoji column picks up the per-card
// icons without manual admin action. Never overwrites a non-NULL value, so
// emoji edits made through the admin UI are preserved.
function backfillCardEmoji(logger) {
  const db = getDb();
  const stillNull = db.prepare('SELECT COUNT(*) AS n FROM cards WHERE emoji IS NULL').get().n;
  if (stillNull === 0) return;
  const deck = loadSeedDeck(logger);
  if (deck.length === 0) return;
  const update = db.prepare(`
    UPDATE cards SET emoji = ?, updated_at = datetime('now')
    WHERE id = ? AND emoji IS NULL
  `);
  let patched = 0;
  const apply = transaction(() => {
    for (const card of deck) {
      if (!card.emoji) continue;
      const info = update.run(card.emoji, card.id);
      patched += info.changes;
    }
  });
  apply();
  if (patched > 0) {
    logger?.info({ patched }, 'back-filled cards.emoji from seed files');
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
// A card may ship only one translation; structural fields (pile, foil, emoji)
// must agree across locales for the same id.
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
        if (
          existing.pile !== raw.pile
          || !!existing.foil !== !!raw.foil
          || (existing.emoji ?? null) !== (raw.emoji ?? null)
        ) {
          throw new Error(
            `seed card "${raw.id}": structural fields differ between locales `
              + `(pile=${existing.pile}/${raw.pile}, foil=${existing.foil}/${!!raw.foil}, `
              + `emoji=${existing.emoji ?? 'null'}/${raw.emoji ?? 'null'})`,
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
          emoji: typeof raw.emoji === 'string' ? raw.emoji : null,
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
  // Normalize sort order so cards introduced only by a later locale still
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
