-- SPDX-License-Identifier: MIT
-- Widen the locale CHECK constraint on `users.locale` and
-- `card_translations.locale` to allow German, Italian and Spanish in addition
-- to French and English. SQLite cannot ALTER a CHECK constraint, so we rebuild
-- both tables in place.

-- 1. users.locale
CREATE TABLE users_new (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  username              TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash         TEXT NOT NULL,
  role                  TEXT NOT NULL CHECK (role IN ('admin','user')),
  must_change_password  INTEGER NOT NULL DEFAULT 1,
  session_epoch         INTEGER NOT NULL DEFAULT 1,
  failed_attempts       INTEGER NOT NULL DEFAULT 0,
  locked_until          TEXT,
  locale                TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('fr','en','de','it','es')),
  is_demo               INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO users_new SELECT * FROM users;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
CREATE INDEX idx_users_username ON users(username);

-- 2. card_translations.locale
CREATE TABLE card_translations_new (
  card_id     TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  locale      TEXT NOT NULL CHECK (locale IN ('fr','en','de','it','es')),
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  PRIMARY KEY (card_id, locale)
);
INSERT INTO card_translations_new SELECT * FROM card_translations;
DROP TABLE card_translations;
ALTER TABLE card_translations_new RENAME TO card_translations;
CREATE INDEX idx_card_translations_locale ON card_translations(locale);
