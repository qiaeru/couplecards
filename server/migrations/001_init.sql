-- SPDX-License-Identifier: MIT
-- Initial schema: users, cards, card_translations, bans, history, settings.

CREATE TABLE users (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  username              TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash         TEXT NOT NULL,
  role                  TEXT NOT NULL CHECK (role IN ('admin','user')),
  must_change_password  INTEGER NOT NULL DEFAULT 1,
  session_epoch         INTEGER NOT NULL DEFAULT 1,
  failed_attempts       INTEGER NOT NULL DEFAULT 0,
  locked_until          TEXT,
  locale                TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('fr','en')),
  is_demo               INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_users_username ON users(username);

-- Cards are language-neutral: they hold structural fields only. Every
-- user-visible text lives in card_translations, keyed by locale.
CREATE TABLE cards (
  id          TEXT PRIMARY KEY,
  pile        TEXT NOT NULL CHECK (pile IN ('home','outdoor')),
  foil        INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_cards_pile ON cards(pile);

CREATE TABLE card_translations (
  card_id     TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  locale      TEXT NOT NULL CHECK (locale IN ('fr','en')),
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  PRIMARY KEY (card_id, locale)
);
CREATE INDEX idx_card_translations_locale ON card_translations(locale);

CREATE TABLE bans (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id   TEXT    NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  banned_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, card_id)
);
CREATE INDEX idx_bans_user ON bans(user_id);

CREATE TABLE history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id     TEXT    NOT NULL,
  action      TEXT    NOT NULL CHECK (action IN ('returned','banned')),
  drawn_at    TEXT    NOT NULL,
  synced_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  client_uuid TEXT UNIQUE
);
CREATE INDEX idx_history_user_time ON history(user_id, drawn_at DESC);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
