-- SPDX-License-Identifier: MIT
-- Drop three indexes that only cost writes:
-- idx_bans_user duplicates the leading column of the bans primary key
-- (user_id, card_id), which already serves every lookup by user.
-- idx_cards_pile and idx_card_translations_locale match no query: the deck
-- and its translations are always read whole.

DROP INDEX IF EXISTS idx_bans_user;
DROP INDEX IF EXISTS idx_cards_pile;
DROP INDEX IF EXISTS idx_card_translations_locale;
