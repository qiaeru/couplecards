-- SPDX-License-Identifier: MIT
-- Count failed sign-ins per (user, client IP) instead of per user. The admin
-- and demo usernames are public, so a per-user lock let anyone keep them
-- locked out; now a lock only blocks the address that earned it.
-- The old per-user columns are dropped rather than left unused.

CREATE TABLE login_failures (
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip               TEXT NOT NULL,
  failed_attempts  INTEGER NOT NULL DEFAULT 0,
  locked_until     TEXT,
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, ip)
) WITHOUT ROWID;

ALTER TABLE users DROP COLUMN failed_attempts;
ALTER TABLE users DROP COLUMN locked_until;
