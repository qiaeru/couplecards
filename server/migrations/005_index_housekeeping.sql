-- SPDX-License-Identifier: MIT
-- Drop idx_users_username: the UNIQUE COLLATE NOCASE constraint on
-- users.username already creates an equivalent implicit index, so the
-- explicit one only duplicates writes.
-- Add an index on bans.card_id: the bans primary key is (user_id, card_id),
-- which cannot serve lookups by card alone, so every card deletion (single,
-- bulk, mirror sync) full-scans bans to enforce the ON DELETE CASCADE.

DROP INDEX IF EXISTS idx_users_username;
CREATE INDEX idx_bans_card_id ON bans(card_id);
