// SPDX-License-Identifier: MIT
// First-run seed: admin with a random password, optional demo account, multilingual starter
// deck from every data/cards.*.json.

import { config } from '../config.js';
import { getDb, transaction, setSetting } from './index.js';
import { hashPassword, verifyPassword, generateInitialPassword } from '../lib/password.js';
import { SUPPORTED_LOCALES } from '../lib/locales.js';
import { readSeedDecks } from '../lib/deckSync.js';

// Fixed admin password of releases up to 1.17.1, still checked at boot to
// rotate admins nobody has claimed yet.
const LEGACY_ADMIN_PASSWORD = 'changeme';
const DEMO_USERNAME = 'demo';
const DEMO_PASSWORD = 'demo';

export async function runSeed(logger) {
  const db = getDb();

  // Hash+verify round-trip at boot so a hash-wasm WebAssembly load failure
  // fails loudly here instead of masquerading as "wrong password" later.
  const probe = await hashPassword('__startup_probe__');
  const probeOk = await verifyPassword(probe, '__startup_probe__');
  if (!probeOk) {
    throw new Error(
      'Argon2id self-test failed: hash-wasm cannot verify its own hashes on this machine',
    );
  }

  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (userCount === 0) {
    const locale = pickSeedLocale();
    const password = generateInitialPassword();
    const hash = await hashPassword(password);
    db.prepare(
      `
      INSERT INTO users (username, password_hash, role, must_change_password, locale)
      VALUES ('couplecards', ?, 'admin', 1, ?)
    `,
    ).run(hash, locale);

    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'seed_locale',
      locale,
    );

    // First-boot default for public registration. The admin GUI toggle owns
    // this value afterward; the env var only seeds the initial state so a
    // headless deployment can open registration without touching the panel.
    setSetting('registration_enabled', config.enableRegistration ? '1' : '0');

    announceAdminPassword(logger, 'Admin account created.', 'couplecards', password);
  }

  await rotateLegacyAdminPassword(logger);

  // ENABLE_DEMO_ACCOUNT is the single source of truth for the demo row:
  // flag on seeds it when missing, flag off prunes it when still present.
  // The admin UI refuses to delete the demo row so the operator points at
  // the env var rather than at a button that would only last until the
  // next restart. CASCADE on bans and history cleans up automatically.
  if (config.enableDemoAccount) {
    const existing = db
      .prepare('SELECT id FROM users WHERE username = ? AND is_demo = 1')
      .get(DEMO_USERNAME);
    if (!existing) {
      const locale =
        db.prepare("SELECT value FROM settings WHERE key = 'seed_locale'").get()?.value || 'en';
      const hash = await hashPassword(DEMO_PASSWORD);
      db.prepare(
        `
        INSERT INTO users (username, password_hash, role, must_change_password, is_demo, locale)
        VALUES (?, ?, 'user', 0, 1, ?)
      `,
      ).run(DEMO_USERNAME, hash, locale);
      logger?.info(
        'seeded demo account (username=demo, password=demo), state resets on each sign-in',
      );
    }
  } else {
    const removed = db.prepare('DELETE FROM users WHERE is_demo = 1').run();
    if (removed.changes > 0) {
      logger?.info('ENABLE_DEMO_ACCOUNT is off: removed the demo account row');
    }
  }

  const cardCount = db.prepare('SELECT COUNT(*) AS n FROM cards').get().n;
  if (cardCount === 0) {
    const deck = loadSeedDeckSafe(logger);
    if (deck.length === 0) return;
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
    logger?.info(
      { count: deck.length, locales: Object.keys(deck[0]?.translations || {}) },
      'seeded card deck',
    );
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
  const deck = loadSeedDeckSafe(logger);
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
  const password = generateInitialPassword();
  const hash = await hashPassword(password);
  db.prepare(
    `
    UPDATE users
    SET password_hash = ?,
        must_change_password = 1,
        session_epoch = session_epoch + 1,
        updated_at = datetime('now')
    WHERE role = 'admin'
  `,
  ).run(hash);
  db.prepare(
    `DELETE FROM login_failures WHERE user_id IN (SELECT id FROM users WHERE role = 'admin')`,
  ).run();
  announceAdminPassword(
    logger,
    'ADMIN_RESET is set: admin password reset. Unset the variable and restart.',
    adminUsernames(db),
    password,
  );
}

// An admin still waiting for its first password change with the old fixed
// password is open to whoever signs in first, since the forced change only
// asks for that public password. Rotate it to a random one, and bump the
// epoch so a session opened with the old password dies too.
async function rotateLegacyAdminPassword(logger) {
  const db = getDb();
  const pending = db
    .prepare(
      "SELECT id, password_hash FROM users WHERE role = 'admin' AND must_change_password = 1",
    )
    .all();
  const legacy = [];
  for (const row of pending) {
    if (await verifyPassword(row.password_hash, LEGACY_ADMIN_PASSWORD)) legacy.push(row.id);
  }
  if (legacy.length === 0) return;
  const password = generateInitialPassword();
  const hash = await hashPassword(password);
  const update = db.prepare(`
    UPDATE users
    SET password_hash = ?, session_epoch = session_epoch + 1, updated_at = datetime('now')
    WHERE id = ?
  `);
  transaction(() => {
    for (const id of legacy) update.run(hash, id);
  })();
  announceAdminPassword(
    logger,
    'The admin account still had the old default password: it was replaced.',
    adminUsernames(db, legacy),
    password,
  );
}

function adminUsernames(db, ids = null) {
  const rows = db.prepare("SELECT id, username FROM users WHERE role = 'admin'").all();
  return rows
    .filter((r) => !ids || ids.includes(r.id))
    .map((r) => r.username)
    .join(', ');
}

// The only place the generated password ever appears. Printed with warn so it
// stands out in `docker compose logs`; the account must change it on sign-in.
function announceAdminPassword(logger, headline, username, password) {
  const rule = '='.repeat(64);
  logger?.warn(
    [
      rule,
      headline,
      `  Username: ${username}`,
      `  Password: ${password}`,
      'Sign in with these and pick your own password.',
      rule,
    ].join('\n'),
  );
}

// Same reader and validation as the admin "sync from files" path, so a card
// that seeds at first boot can never later fail POST /cards/sync. At boot a
// missing or malformed data directory degrades to an empty deck (warn and
// skip) instead of refusing to start.
function loadSeedDeckSafe(logger) {
  try {
    return readSeedDecks();
  } catch (err) {
    logger?.warn(
      { reason: err.deckCode || err.message },
      'seed deck unavailable or invalid, skipping card seed/backfill',
    );
    return [];
  }
}

function pickSeedLocale() {
  if (SUPPORTED_LOCALES.includes(config.seedLocale)) return config.seedLocale;
  const lang = (process.env.LANG || '').toLowerCase();
  if (lang.startsWith('fr')) return 'fr';
  return 'en';
}
