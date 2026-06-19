// SPDX-License-Identifier: MIT
// Length limits for a card's title and description. Shared by the create/edit
// route (routes/cards.js) and the deck-import validator (lib/deckSync.js) so the
// two stay in lockstep. The admin form mirrors these as `maxlength` attributes
// in public/js/features/admin/cards.js: a browser module can't import server
// code without a build step we deliberately don't run, so keep that copy in sync.

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 1000;
