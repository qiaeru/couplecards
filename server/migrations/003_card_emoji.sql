-- SPDX-License-Identifier: MIT
-- Add an `emoji` slug per card. The slug references a Fluent UI Emoji SVG
-- bundled under public/icons/emoji/<slug>.svg. NULL means "fall back to the
-- pile icon" (house / city), keeping legacy decks renderable.

ALTER TABLE cards ADD COLUMN emoji TEXT;
