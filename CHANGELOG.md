# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.12.0] - 2026-07-05

### Fixed

- Undo now sticks. Tapping "Undo" on the ban or return toast previously only reverted the change locally, so the entry silently came back in History and Collection on the next reload; the undo now also removes it on the server, including when it happens offline.
- Database migrations that rebuild a table can no longer cascade-delete user data. The migration that added German, Italian, and Spanish did exactly that: instances that upgraded through it lost their banned cards and play history.
- Once an account lockout expires, the failed-attempt counter resets, so a single wrong password no longer re-locks the account for another full period.
- The shared demo account no longer remembers the previous visitor's language choice.
- Switching screens in quick succession can no longer show the wrong screen: the router now discards a navigation that was overtaken by a newer one.
- Tapping a pile and then a navigation link during the short launch animation no longer yanks you to the draw screen afterward.
- The change-password dialog in Settings now behaves like the other dialogs: Escape and clicking outside close it, keyboard focus stays trapped inside, and focus returns to the control that opened it.
- The password-strength meter shown on the forced first-login change now follows the server's configured strength policy instead of a hardcoded threshold.
- The app manifest is now part of the offline cache, so the installed app keeps its name and icons offline right after an update.
- Docker builds run from a working copy no longer bake the local development database (`server/var/`) into the image.
- The bundled nginx configuration no longer strips the app's Content-Security-Policy and Permissions-Policy headers; deployments based on it were running without CSP.
- Creating a card whose identifier already exists shows the proper "identifier already in use" message again instead of a generic server error.
- The admin Users tab shows creation and last sign-in times in the viewer's timezone; they were shifted by the UTC offset.
- "Reduce motion" now also covers the full-screen reveal flash, the revealed card's looping shine, and the screen slide-in animation.
- Switching tabs and back on a revealed card no longer restarts ripple effects that had already finished, and a leftover card-return animation can no longer freeze the tilt effect on the next draw.
- `ENABLE_REGISTRATION` set in `.env` now actually reaches the container, and the HTTPS deployment variants also pass `ADMIN_RESET` and `ENABLE_DEMO_ACCOUNT` through, so the documented recovery and demo switches work without editing the compose file.
- Two deck edits saved within the same second no longer leave clients on the stale text: the deck version now includes a persistent revision counter.
- The container healthcheck follows a custom `PORT` instead of assuming 3000.

### Changed

- The card reveal was redesigned around a "gold dust" sequence. The card levitates while golden particles swirl into it, takes a sharp breath, then flips with a light sweep; the landing sends out a golden shockwave (the full-screen white flash is gone), embers rain down, the card text cascades in, and the revealed card keeps floating over its shadow surrounded by a thin ambient dust. The floating emoji hearts are retired in favor of that dust, and particle density adapts to the device.
- A card opened from Collection or History now floats over its ground shadow like a freshly revealed one; the one-shot reveal effects stay reserved for live draws.
- Switching screens now plays a soft crossfade: the app had transition styles but never actually drove them, so every navigation was an abrupt content swap.
- The rest of the interface now speaks the reveal's gold language: tapping a pile charges it with gold light instead of a brightness flash, the halo around the most recently drawn card in the Collection and the pile counter pop turn gold, the syncing indicator drops its lone cyan for gold, History gets gilded date separators with a gently staggered entrance, and the sign-in card receives the same parchment wash and gold hairline as the rest of the app.
- Toasts, the sync banner, and dialogs now animate out instead of vanishing in one frame, the boot splash fades into the app, Collection tiles respond to touch, admin tabs gain hover states and the same glowing indicator as the bottom navigation, and every one of these animations is disabled under "reduce motion".
- The Docker image is roughly half as large: file ownership is set during copy instead of in a duplicating chown layer.
- `/api/health` no longer exposes the app version publicly; it only reports liveness.
- Seed files are validated at first boot with the same rules as the admin "sync from files" operation; malformed files are skipped with a warning instead of seeding unvalidated data.
- Switching the admin panel language re-renders the lists from memory instead of refetching them.
- The CI license check now installs the root dependencies before running, so the libraries actually bundled for browsers (zxcvbn, fflate) are checked; the step previously inspected an empty tree and verified nothing.
- The backup documentation now covers WAL mode properly: a hot copy must include the `-wal` and `-shm` companion files, and stopping the container first remains the reliable method.

## [1.11.0] - 2026-06-19

### Added

- Public self-registration from the sign-in page. The admin opens it with a switch in the Users tab (off by default, initial state seeded from the `ENABLE_REGISTRATION` variable); a "Create an account" link then lets anyone sign up with a username and a password of their own.
- The admin Users list now shows each account's last sign-in, with a one-click control to remove accounts left inactive for over 3, 6, or 12 months.
- A "Forgot your password?" link on the sign-in page explains that, with no personal data collected, a lost password cannot be reset and the way forward is a new account.
- A small footer on the sign-in screens credits the developer (Qiaeru) and links to the source code on GitHub.

### Changed

- Standardized on US spelling and punctuation across the documentation, the code comments, and the card deck, and gave the card titles and descriptions a prose polish in all five languages.
- Upgraded the password-strength engine (zxcvbn-ts) to version 4, which slightly recalibrates how a password is scored. The minimum-strength requirements are unchanged.
- The Collection grid defers off-screen card icons until you scroll to them, easing the initial load on large decks.

### Fixed

- Card icons now work offline across the whole deck. The app caches them on your first online visit, instead of only the icons of cards you had already opened online.
- Creating a user with a name that already exists now shows the clear "username already taken" message instead of a generic server error.
- On desktop, a drawn card no longer freezes after the cursor leaves and returns: the hover tilt keeps following the pointer instead of locking up.
- Rare (foil) cards look cleaner: the golden halo now hugs the card instead of floating with a gap around it, and the holographic rainbow loops continuously instead of flashing a flat patch and snapping back each cycle.
- A card opened in preview (from History or Collection) now behaves as a proper static viewer: it no longer sprouts floating hearts and ripples after you switch tabs and come back, and it no longer sends itself back to the home screen after a long idle. Those behaviors stay reserved for a live draw.
- Leaving the draw screen while a card is still being revealed is now clean: the reveal sound and vibration no longer fire a moment later on the screen you moved to, and the "back to home after inactivity" timer no longer lingers on other screens.
- Harmonized a few UI strings: consistent search placeholders, the admin card form now says "Tas" like the rest of the French UI, the weak-password error reuses the strength meter's wording, and an ambiguous French rules sentence ("la retirer") now clearly means the card can come back later.

## [1.10.0] - 2026-06-12

### Added

- The Collection search announces its result count to screen readers, which previously had no feedback that the grid had updated.

### Fixed

- API error responses now use the documented shape (`VALIDATION_ERROR`, error codes) instead of leaking technical messages. Client errors (4xx) are logged as warnings, keeping the `error` level for real server faults.
- Offline support no longer breaks silently when a single asset fails to precache: the Service Worker caches each shell file individually and logs what failed.
- "Reset my data" no longer discards the cached deck version, which forced a needless full deck re-download on the next load.
- A `SESSION_SECRET` containing multi-byte characters (accents, emoji) in its first 32 characters no longer crashes the server at startup.
- The client no longer announces a clean sync when the history upload fails: the entries stay queued and retry on the next online event.
- Failed login attempts are now counted atomically, so simultaneous wrong-password attempts can no longer under-count and delay the account lockout.
- The PWA manifest response now sends `Vary: Accept-Language`, so a shared cache (reverse proxy, CDN) can no longer serve one visitor's localized manifest to everyone.
- The Settings screen no longer accumulates install-prompt listeners across repeat visits.

### Changed

- The Collection search waits 150 ms after the last keystroke before re-rendering the grid, sparing low-end phones a full rebuild per typed letter.
- Docker images are now built with `npm ci` against the committed lockfiles, so every build of a given commit ships the exact dependency versions that were tested. The container healthcheck uses Node's built-in `fetch` instead of shipping `wget`.

## [1.9.0] - 2026-05-27

### Added

- The Collection screen gains a search field that filters discovered cards by title and description, plus a completion bar above the counter that fills with the active pile or rarity filter.

### Fixed

- Corrected stray French typography and grammar in a few `fr.json` strings (non-breaking spaces, curly apostrophes, a verb form).

## [1.8.0] - 2026-05-20

### Added

- Login page gains a slow parallax of card emojis drifting behind the auth card. A single per-icon depth value drives size, blur and opacity together so the layers read as real distance, and on desktop the cursor gently repels nearby icons. Gated by `prefers-reduced-motion`.
- New "Delete all cards" button in the admin Deck maintenance toolbar, behind a destructive confirmation. Lets an admin wipe the seeded deck in one click before importing a custom one, instead of round-tripping through the JSON files.
- Server logs a one-shot warning the first time it receives a plain-HTTP request while `COOKIE_SECURE=true`, surfacing the silent-login-loop trap that hits admins who copy the production Docker image into a LAN deploy without flipping the flag. Documented in `configuration.md`.

### Changed

- Tightened the app icon viewBox so the heart fills the full canvas instead of sitting inside a 10 percent margin. Home-screen and browser-tab icons render noticeably larger. The maskable variant keeps its safe zone so Android adaptive masks do not clip the corners. `favicon.ico` and `apple-touch-icon.png` were regenerated from the new SVG.

### Fixed

- Edit and Delete buttons in the admin cards list went dead after applying a deck sync or import, only recovering on a page reload. The shared modal confirm button kept the disabled flag across dialogs. `showConfirm` and the card editor now reset it on open, matching `withModal`.
- "Copy password" on the new-user admin modal silently did nothing on plain-HTTP LAN deployments because `navigator.clipboard` is gated to secure contexts. Added a legacy `execCommand` fallback, and when both paths fail the password is auto-selected with a toast asking for Ctrl+C.

## [1.7.0] - 2026-05-17

### Security

- Hardened the post-login `next` redirect to reject protocol-relative URLs. A crafted `/login.html?next=//attacker.example` previously sent the user off-origin after a successful login, opening a phishing path. The check now requires a same-origin single-slash path.

### Added

- Returning a card surfaces an Undo button in its toast, mirroring the existing affordance after a ban so a misclick on Return is no longer a one-way trip to History.
- Collection filters and the admin Users / Cards search lists ship a real "no matches" empty state, distinct from the "deck is empty" copy.
- Skip link on the admin page jumps past the tablist to the default users panel.
- Picking a new language announces the new locale through the shared live region so screen-reader users get spoken feedback after the selection.

### Changed

- Deck sync and deck import default to the additive Upsert mode, and the Apply button switches to red as soon as the preview reports rows that would be removed. The old default (Mirror with a blue Apply) made a wrong tap quietly destructive.
- Draw screen primary actions (Ban, Return, Redraw, preview row) move to a 44 px touch target so they meet the standard thumb-zone size; admin list rows keep the denser 34 px variant.
- Inactivity timeout on the draw screen rises from 10 to 30 minutes and pauses while the tab is backgrounded, so a longer conversation about a rare card no longer kicks the player back to home mid-read.
- Logout confirmation gains a body line and a red confirm button so the modal matches the row that triggered it.
- "Almost empty" pile hint triggers at 2 cards left instead of 3, so light custom decks stop crying wolf.
- Italian "Banna / bannata / bannare / bannature" replaced by the idiomatic "Escludi / esclusa / escludere / esclusioni" across every screen, and the German and Italian redraw button labels shortened to fit. The login subtitle softened from "credentials provided by the instance administrator" to "Sign in with your Couplecards credentials." across the five locales.

### Fixed

- `PATCH /api/cards/:id` now bumps `cards.updated_at` even on translation-only edits, so the deck ETag invalidates and clients pick up the new text immediately instead of waiting for the next service-worker bump.
- Accessibility pass: every screen starts at an h1 (the draw screen lifts the card title up and demotes the brand mark to a decorative div), the `<main>` landmark stays in the AT tree on older Firefox and Safari, the language selects in Settings and admin expose a programmatic label, the Collection filter chips ship as a real toggle-button group with `aria-pressed` instead of a half-implemented tablist, `role="alert"` regions drop the contradictory `aria-live="polite"`, the update banner reads "A new version is available" instead of "Reload" twice, the home pile buttons carry an explicit `type="button"`, and the card tilt animation honours `prefers-reduced-motion`.
- Visual polish pass: the foil card halo pulses around the rim (was clipped to nothing), the "Rare" suffix on the foil pile label is localised in all five locales instead of hardcoded English in CSS, the update banner sits above the bottom navigation, the Collection counter and grid align with the screen title, the card flip lands on the same frame inset front and back, modal padding is uniform, the boot skeleton no longer flashes a flat fill before the body gradient resolves, the locked-foil tile halo wraps the tile flush, and the `.heart-icon` glow stops bleeding onto the small in-card ornament.
- Initial-password admin modal traps focus and restores focus on close, and neither Escape nor a backdrop click dismisses it, so the one-time generated credential cannot be lost between create-user and Copy. The `withModal` helper moved from `deck-sync.js` to `ui/shell.js` so all admin dialogs share the same focus trap.
- Admin deck sync intro displayed the literal `cards.{{locale}}.json` because the placeholder was never interpolated; reworded across the five locales.
- Unknown server error codes no longer leak as raw `errors.SOMETHING_WEIRD` strings in toasts and inline errors. Routed every call through a shared `errorMessage()` helper that falls back to the generic message when the code has no localised match.
- Card admin save and delete now toast a meaningful confirmation. Save previously showed the literal verb "Save"; Delete showed nothing at all.
- Card editor stopped advertising every per-locale title and description as `required`. The constraint never fired (the modal confirms via JS, not native submit); replaced with an inline hint that matches the actual behaviour.
- Boot-failure pages no longer dump the raw exception into the user's view; show `errors.generic` instead and keep the stack in `console.error`.
- `history` view no longer leaks an `i18n:change` listener on each mount, so a long couple-playing-for-hours session stops accumulating one stale render per past visit.
- The `.action-tag.banned` pill background is now tied to `var(--danger)` via `color-mix` instead of a stale literal rgba, so the badge fill matches its text.
- Internal CSS cleanup: removed the dead `.home-nav` / `.btn-nav` block, dropped the duplicates between `admin.css` and `style.css`, and routed the remaining `'Fraunces'` / `'Inter'` literals through the canonical font variables.

### Performance

- `/api/cards`, `/api/state`, `/api/history` and the locale catalogues now negotiate brotli or gzip via `@fastify/compress`. The deck payload alone drops from ~90 KB JSON to under 15 KB on the wire.
- `/api/cards` ETag is cached in memory and invalidated on every mutating handler, so 304 responses skip two SQL queries on every stale-while-revalidate pass.
- PWA manifest files are loaded into memory at boot instead of `readFileSync` per request, and the per-request access log line is disabled in production so a PWA cold start no longer pays a log encode for every static asset.
- Draw screen: `prefers-reduced-motion` is cached and watched via `matchMedia` change events instead of re-queried per animation frame; hearts and ripples pause when the tab is backgrounded; `bumpInactivity` throttles to one re-arm per 500 ms so pointer drags don't tear down and rebuild the timer 60 times a second.
- Outbox flush parallelises ban / unban requests across distinct `cardId`s while preserving order on the same card, so banning five cards in a row no longer costs five sequential round-trips.
- Player JS bundles no longer parse the admin-only `EMOJI_SLUGS` list.

## [1.6.2] - 2026-05-09

### Security

- Bumped the transitive `fast-uri` dependency from 3.1.0 to 3.1.2 to pull in the upstream fixes for GHSA-q3j6-qgpj-74h6 and GHSA-v39h-62p7-jpjc, two URI-parsing vulnerabilities reachable through Fastify's request handling.

## [1.6.1] - 2026-05-06

### Fixed

- Existing instances upgrading to 1.6.0 stayed on the pile fallback icon for every card because the seed only runs against an empty deck. The boot sequence now back-fills `cards.emoji` from the seed JSON files for any row still at NULL, so per-card emojis appear without manual admin action. Emoji values that were already set (admin edits, custom imports) are left untouched.

## [1.6.0] - 2026-05-06

### Added

- Per-card emoji on the card face. Each deck card now ships its own Fluent UI Emoji icon, used on the drawn face and on discovered tiles in Collection. Locked silhouettes keep the pile icon, and cards without an emoji fall back to it as well.
- Admin cards editor now exposes an Emoji field with autocomplete on the bundled slug list. Leaving it blank reuses the pile icon.

### Fixed

- Plain-HTTP LAN deployments no longer break with `ERR_SSL_PROTOCOL_ERROR` on every asset. The `upgrade-insecure-requests` CSP directive is now emitted only when the app is served over HTTPS.

## [1.5.0] - 2026-05-03

### Added

- New **Collection** screen showing every card in the deck as a grid: drawn cards reveal their full design, banned cards carry a red cross, undiscovered cards stay as dark silhouettes with a "?". A `X / Y cards discovered` counter (with a slot-machine cipher reveal), filters by pile plus a Rare-only filter, and a pulse outline that follows the most recently drawn card so it is easy to locate after a draw. Rare silhouettes wear a soft breathing rainbow halo so they stand out without revealing the title.

### Changed

- Banned-card management is folded into the card preview: tap any drawn or banned card from Collection or History and the preview offers a Ban or Restore button next to Close. Banning from the preview now also surfaces an Undo action in the toast.
- Bottom navigation entry `Bans` is replaced by `Collection`. Closing the card preview now returns to the previous screen instead of always going Home.
- Card preview opened from Collection or History no longer plays the floating-hearts ambience; that animation stays on the live draw, where it belongs.
- New offline / pending-sync banner pinned above the bottom nav: surfaces "Offline" while the network is gone, "Syncing your changes…" while the IndexedDB outbox still has writes to flush, hidden once everything settles.
- The SPA router now restores scroll position when the user returns to a screen via the browser back button or the in-app `Close preview`, so opening a card from Collection or History no longer jumps back to the top of the list.

### Removed

- `#/bans` route and view. Old bookmarks fall through to the default home redirect.

## [1.4.2] - 2026-05-01

### Fixed

- Home screen and revealed card now fit on short phone viewports (around 640 to 720px tall) without scrolling. The stacked piles shrink and tighten their gap on small heights, and on the draw screen the card and the action buttons step down so the description stays readable above them.
- Bottom navigation no longer mangles long localised labels on narrow phones. Two-line entries ("Bannissements", "Verbannte Karten", "Cartas vetadas", "Carte bannite", "Impostazioni") are now centered under their icon, can wrap mid-word when needed, and step down to a smaller font under 380px wide.
- `POST /api/auth/preferences` accepted only `fr` and `en` because of a hardcoded enum, so users on de, it or es could not persist their language choice to the server (the locale still applied client-side). The schema now reads from the canonical `SUPPORTED_LOCALES` list and accepts every shipped locale.
- Reset Data button in Settings now disables itself during the request, so a double-tap can no longer fire two `POST /api/state/reset` calls in a row.
- Deleting an admin user showed a "Copied" toast instead of a deletion confirmation (copy-paste leftover from the clipboard handler). A new `admin.users.delete.toast` key now ships in the five locale catalogues and is displayed instead.
- Boot error pages (shown when the SPA or admin shell fails to start) now display localised strings instead of hardcoded English, falling back to English only when the catalogue itself never loaded.
- Both language pickers (Settings and admin) build their `<option>` lists with `createElement` instead of `innerHTML` template strings, matching the rest of the codebase's CSP-defensive DOM construction.

## [1.4.1] - 2026-04-29

### Changed

- Wordmark and brand name lowercased to **Couplecards** across the UI, page titles, all five web manifests, locale catalogues and the project docs. Past CHANGELOG entries keep the original `CoupleCards` spelling.
- The PWA manifest negotiator now parses `Accept-Language` by quality score and reads `SUPPORTED_LOCALES` from the canonical list. A request like `Accept-Language: ja, fr;q=0.9` correctly serves the French manifest (it served English before), and adding a new locale no longer requires editing `server/src/routes/manifest.js`.

### Fixed

- Static `404.html` and `500.html` no longer rely on an inline `<script type="module">`, which the strict `script-src 'self'` CSP blocked in modern browsers. The boot logic moved to `public/js/error-page.js`, so the i18n strings now actually load and the **Reload** button on the 500 page actually triggers.
- A demo visitor who tried to change their password got a misleading `400 VALIDATION_ERROR` because the `currentPassword` schema enforced an 8-character minimum while the demo password is 4 characters. The field now accepts any non-empty value and the route correctly returns `403 DEMO_READONLY`. The strength policy still applies to `newPassword`.

### Security

- Player-only API endpoints (`/api/state`, `/api/state/reset`, `/api/bans*`, `/api/history`) now reject the admin role with `403 FORBIDDEN`. The admin UI lands on `/admin.html` and never plays cards, but the routes were previously gated only by `requireSession`, which left an admin cookie able to script against its own bans and history. A new `requireUser` guard in `server/src/lib/auth.js` consolidates the session check, the password-change gate and the non-admin check.

### Documentation

- `docs/i18n.md` states explicitly that locale strings are plain text. The DOM injection paths run translated values through `escapeHtml`, so HTML tags inside a locale entry render literally and contributors should structure the DOM around the text rather than embed markup in the catalogue.
- `docs/security.md` calls out that authentication attempts are not written to a historical journal: only the per-user `failed_attempts` counter exists and it is reset on successful sign-in. Operators who need an audit trail can rely on the Pino access logs or a reverse proxy.

## [1.4.0] - 2026-04-28

### Added

- Three new locales shipped end-to-end: German, Italian and Spanish. Each comes with a full UI catalogue (`public/locales/<locale>.json`), a card deck (`data/cards.<locale>.json`), a translated web manifest, an entry in the in-app language selector, and a SQLite migration (`002_locales_de_it_es.sql`) that widens the locale CHECK constraint on `users.locale` and `card_translations.locale`. Translations follow the FR-source, target-language-naturalised rule.
- 20 new French cards (10 home, 10 outdoor) covering activities the deck did not yet have, all of them naturalised into the four other locales.
- Foil cards are now drawn less often than standard cards. `FOIL_WEIGHT = 0.3` in `public/js/core/sync.js` keeps the effective draw rate around 9.7% on the home pile and 4.4% on the outdoor pile, regardless of how many foil cards are in the deck.
- zxcvbn now loads a dictionary per supported locale (`@zxcvbn-ts/language-de`, `language-it`, `language-es-es` joining the existing `language-en` and `language-fr`), so the password strength meter catches weak patterns specific to each language. Loaded both server-side in `server/src/lib/password.js` and bundled into `public/vendor/zxcvbn.js`.
- New paragraph in the in-app Rules screen explaining that some cards are rare, spicier and drawn less often (`rules.foil`).

### Changed

- French deck pass on the carried-over 125 cards: 30 rewritten and 3 removed for tone (humorous, second-degree), action clarity, pile-aware timing (post-bedtime evenings for `home`, daytime for `outdoor`), and consistent punctuation (no colons, em-dashes or slashes). Net FR deck size is 142 cards (122 carried over plus the 20 new ones).
- Foil flag rationalised to mean exactly "explicitly sexual content": twelve cards promoted, two demoted.
- English deck rewritten end-to-end so it follows the new authoring rules and reads as idiomatic English rather than a literal calque of the French (`grimper au rideau` → `see stars`, `Local foams` → `Local brews`, etc.).
- English UI catalogue naturalised: nine phrasings rewritten so the strings read as native English.
- Locale catalogues reorganised into a canonical section order (app/common, navigation, authentication, piles, draw, history, bans, settings, rules, demo, admin, errors). 14 duplicate keys merged into their canonical name (e.g. `nav.history` → `history.title`, `home.draw.home` → `piles.home.label`, `admin.cards.save` → `common.save`), 9 pure orphans removed. Every locale now has the same 216 keys in the same order.
- Replace `jszip` (last release March 2023) with the actively maintained `fflate` for the deck export and import paths. The lazy-loaded vendor bundle drops from ~96 KB to 5.3 KB. The ZIP wire format is unchanged, so existing backups remain importable.
- Wordmark glow softened, font-size shrunk ~10%, and the primary blur radius now matches between the wordmark text and the heart icon next to it.
- Bright accent colour applied to the selected and hovered option of every `<select>` dropdown so the highlight is clearly visible (was previously a muted dark-pink barely distinguishable from the option background).
- README and screenshots refreshed to reflect the five-locale lineup.

### Fixed

- Language picker order. Both the settings page and the admin language selector now sort by native name (Deutsch, English, Español, Français, Italiano) instead of insertion order, so the order is stable across UI locales and predictable for users.
- Admin "Edit card" dialog and the deck import dialog only listed `en` and `fr` translation fields (and only accepted `cards.{en,fr}.json` inside zip backups). The hardcoded `SUPPORTED_LOCALES` arrays in `cards.js` and `deck-sync.js` now read from the canonical `supportedLocales()` helper, so DE/IT/ES are recognised everywhere.
- Pink flash on the home pile counts at first paint. The pop animation now only fires when replacing a real count, not when leaving the dash placeholder.
- License-checker allowed list out of sync with CI: `BlueOak-1.0.0` is now documented in `CONTRIBUTING.md` and `CREDITS.md` (the CI workflow already accepted it for transitive Fastify deps such as `glob`, `lru-cache`, `minimatch`).

## [1.3.0] - 2026-04-27

### Changed

- Swap the serif Literata for **Fraunces** as the display font. The CoupleCards wordmark on the home header, login screen, boot splash, and draw screen now uses Fraunces' soft-and-wonky variant (`font-variation-settings: "SOFT" 100, "WONK" 1, "opsz" 144`) with a soft pink glow. Section headings (Settings, Rules, Bans, History, Administration) are demoted to the body Inter face so they no longer compete visually with the wordmark, and `.auth-title` ("Sign in", "Change your password") follows the same neutral style. Card text keeps a serif feel by using the standard rendering of Fraunces. The 14 Literata WOFF2 files are removed; Fraunces ships with Latin, Latin Extended, and Vietnamese subsets. Greek and Cyrillic are not part of the Fraunces upstream, so locales using those scripts now fall back to Georgia / serif.
- Consolidate the wordmark CSS into a single rule shared across all four locations so size, weight, letter-spacing, glow and variation axes stay in sync. Section-title overrides for `.app-header` and `.admin-header` collapse into the base `.title` rule.
- Add a magnifying-glass icon inside the Users and Cards search inputs in the admin panel, so the affordance reads as a search box rather than a generic text input.
- Tighten the admin panels: remove the redundant `<h2>` subtitles ("Users", "Cards", "Settings") that duplicated the active tab label, drop the now-orphaned `.admin-panel h2` style, and normalise every gap inside `.admin-panel` to 14 px. The previous `.list` internal padding and the manual `margin-top` on the "Add a card" button were compensating for each other; both are gone.
- Login form: hide the empty error region (`.auth-error:empty`) so the gap between the password input and the "Sign in" button is no longer doubled by an invisible flex item.

### Fixed

- Surface the right error message when the two new passwords disagree on the change-password screen. The client emitted the correct key (`changePassword.mismatch`) but `showError` rewrapped any code that did not start with `login.errors.` under the `errors.` namespace, turning the key into the missing `errors.changePassword.mismatch` and falling through to the generic "Une erreur est survenue.". The resolver now passes any code that already contains a dot through unchanged and only prefixes bare server enums.

### Documentation

- README screenshots replaced with the current home-with-piles and revealed-card captures, and the Highlights section split into a "What it does" block (the user-facing flow, deck memory, household control, responsive PWA) and an "Under the hood" block (the existing technical bullets), so the page reads as a product introduction before becoming a tech overview.
- `CREDITS.md`, `CONTRIBUTING.md` and `docs/i18n.md` updated to list Fraunces in place of Literata, document the new Latin / Latin Extended / Vietnamese coverage, and call out the Greek / Cyrillic fallback so future translators are not surprised.

## [1.2.2] - 2026-04-24

### Fixed

- `ENABLE_DEMO_ACCOUNT` is now the single source of truth for the demo account. The admin UI refuses to delete the demo row (a new `CANNOT_DELETE_DEMO` error, matching the existing `CANNOT_EDIT_DEMO` / `CANNOT_RESET_DEMO` guards), and the seed step now removes any stale demo row on boot when the flag is off. Previously a delete through the admin UI was undone by the next restart since the seed recreated the row whenever the flag was still set, and unsetting the flag left the demo row in place.
- Admin Cards panel: balance the spacing around the "Add a card" button. It previously had 28 px of visual gap above and 40 px below, because the button carried a 14 px vertical margin on top of the panel's flex gap while the list below added another 12 px of internal top padding for its fade mask. The button now offsets by 12 px on top only, so both gaps settle at 26 px.

### Documentation

- `docs/security.md` and `docs/administration.md` now state that the demo account is controlled exclusively by `ENABLE_DEMO_ACCOUNT` and describe the new "flag off means the row goes away at the next boot" behaviour.

## [1.2.1] - 2026-04-24

### Fixed

- Accessibility: demote the CoupleCards wordmark on `login.html` from `<h1>` to `<div>`. Each login stage (Sign in, Change password) keeps its own `<h1>`, so the document hierarchy now has a single top-level heading per view instead of two.
- Accessibility: associate the Settings switches (Sound effects, Vibrations) with their visible label via `aria-labelledby`. Screen readers now announce the checkbox name instead of an unlabeled toggle.
- Accessibility: replace the first tab stop of the SPA shell with a real "Skip to main content" link. It previously pointed at `#/home` with the label "Back", which was misleading for keyboard users expecting the standard skip-link behaviour. It now targets `<main id="main-content">` (marked `tabindex="-1"` so it can receive focus) and uses a dedicated `common.skipToContent` i18n key in both locales.
- Accessibility: move focus to `<main id="main-content">` after every SPA route change. Keyboard and screen-reader users now hear the new view's contents instead of staying stranded on the last clicked link.
- Accessibility: tag the revealed card's title and description with the effective `lang` attribute. When a card has no translation in the active UI locale and falls back to English, screen readers now switch to the English voice instead of mispronouncing the text with the UI voice.
- Accessibility: make the admin tablist follow the WAI-ARIA APG tabs pattern. The active tab carries `tabindex="0"` and every other tab `tabindex="-1"`, so `Tab` moves from the tablist straight into the visible panel. `ArrowLeft` / `ArrowRight`, `Home` and `End` now cycle between tabs and move focus to the newly selected one.
- Accessibility: apply the shared modal a11y pattern (focus trap, `Escape`, backdrop click, focus return to opener) to the Sync / Import deck-sync dialog and to the admin Create / Edit card dialog, bringing them in line with the shared confirmation modal.
- Accessibility: hide the decorative emoji on empty-state screens (Admin cards, Bans, History) from assistive tech. Screen readers stopped announcing "playing card", "herb" or "heart with ribbon" before the real title and hint.
- Accessibility: expose the home screen "Almost empty" hint to screen readers. The pile button uses `aria-label`, which replaced its inner text for assistive tech, so the visible low-pile warning was ignored. It is now linked via `aria-describedby` only while the hint is actually shown.
- Accessibility: link the sign-in and change-password inputs to their error region via `aria-describedby`, and toggle `aria-invalid` on each field while the form holds an error. The password-change "New password" field also links to the strength meter so screen readers reach the live hints when the field is focused.
- Accessibility: mark the password strength label as an `aria-live="polite"` region and only mutate its text when the tier actually changes. Screen readers now hear the new strength level (Weak, Fair, Good, Strong) once when it shifts, instead of staying silent or spamming every keystroke.

### Security

- Raise the Argon2id iteration count from `t=2` to `t=3` on password hashing. Still uses the same 19 MiB memory cost. Adds roughly 15 ms to each login and password change; existing stored hashes keep verifying since the PHC string embeds its own parameters.

### Documentation

- Move the README screenshots from the repository root to `docs/assets/` and render them side by side inside a two-column Markdown table with short captions. The table layout caps each image at half the container width on GitHub without resorting to inline HTML.
- Spell out in `docs/configuration.md` and `docs/security.md` that `TRUST_PROXY=1` must only be enabled behind a reverse proxy that strips inbound `X-Forwarded-*` headers. Without that, a remote caller can spoof `X-Forwarded-For` and bypass the per-IP rate limits.

## [1.2.0] - 2026-04-24

### Added

- README: hero screenshots (desktop + mobile) and a "Try the demo" callout pointing at <https://couplecards.qiaeru.com/> with the `demo` / `demo` credentials.
- Display the pink heart logo alongside the "CoupleCards" wordmark everywhere the app name is shown as a title: the home-screen header, the card-draw header, the login page, and the boot splash on both `/` and `/admin.html`.
- `favicon.ico` (multi-resolution) and `apple-touch-icon.png` (180×180) under `/icons/`, linked from `index.html` and `login.html`. Improves rendering on legacy browsers, Windows shortcuts, and iOS "Add to Home Screen".

### Changed

- Restyle all app titles to a flat pink (`#ec5a9e`, matching the new logo) with tighter letter-spacing. Removes the previous `--accent` → `--accent-2` gradient text on `.title`, `.brand-title`, `.draw-title`, and `.boot-logo`.
- Replace the app logo with a new flat pink heart silhouette. `icon.svg` (favicon) is now a transparent cœur, and `icon-maskable.svg` keeps the dark gradient plaque for safe PWA masking.
- Rename the shared heart-ornament CSS class from `.heart-gold` to `.heart-icon`. The gold heart ornament (`heart-gold.svg`) is kept for the card-back crest, the card-front divider, and the rules-page dividers, where its warm gradient reads better than the flat pink logo.
- Enlarge the bottom navigation icons (22 → 26 px) so they read better on mobile without increasing the nav height enough to require scrolling on the home screen.
- Add a little breathing room between the icon and the label in each bottom-nav item (gap 4 → 6 px).
- Widen the gap between the two piles on the home screen on desktop (≥ 540 px viewports): grid gap 14 → 40 px, container max-width 460 → 500 px. Mobile single-column layout is unchanged.
- Align every pink in the app with the new brand primary `#ec5a9e`. `--accent` switches from `#ff5e95` to `#ec5a9e`, `--accent-2` becomes a softer `#f49cc5` tint, and every hardcoded `rgba(255, 94, 149, …)` / `rgba(255, 120, 170, …)` shadow or glow across `app.css`, `style.css`, `cards.css`, and `admin.css` follows suit. The five `color: #ec5a9e` rules introduced by the title restyle now use `var(--accent)` so the brand has one source of truth. The `.btn-primary:hover` glow, previously hardcoded as `rgba(229, 53, 107, 0.38)`, now derives from the token via `color-mix(in srgb, var(--accent) 38%, transparent)`.

### Fixed

- Remove the white tap-highlight flash that appeared when tapping an item of the bottom navigation bar on mobile browsers.

## [1.1.0] - 2026-04-24

### Added

- **Reset my data** action in Settings, backed by a new `POST /api/state/reset` endpoint. Wipes the caller's bans and history in a single transaction. Demo accounts are rejected with 403 since their state is already wiped at every sign-in.
- **Admin Settings tab** (right-aligned) hosting the language selector and the logout button, using the same `.setting-row` layout as the user Settings view.
- **Live search** above the admin Users and Cards lists. Case-insensitive substring match; for cards the search scans every locale's title and description.
- **Floating "back to top" button** on admin and user pages. Appears after 320 px of scroll and scrolls smoothly to the top.
- **Undo action on the post-ban toast** (5 s). Dismissing the toast or waiting commits the ban; tapping Undo restores the card and removes the matching history entry.
- **Low-pile hint** on the home screen. When a pile has 3 or fewer cards left, the count badge turns amber and a "Presque vide" label appears below it.
- **Swipe-threshold haptic**: short vibration the first time a drag crosses the commit distance, so the user feels when the swipe becomes validating.
- **Banned tiles are clickable** and open the card in preview mode (Restore button still works independently).
- **Redraw is now traced** in History as a `returned` entry (the card effectively returns to the pile).

### Changed

- Admin header title normalised to 2 rem and centred, matching the Settings/Rules/Bans/History titles.
- New `.btn-sm` utility applied across admin (user/card actions, Export/Import) and user Settings, Bans Restore, and draw screen action buttons.
- History renders action labels as tilted **stamps** echoing the draw-screen swipe labels; the French return label reads "Remise dans la pioche" to match the reveal flow.
- Admin user/card lists and Bans list move their action buttons **to the bottom of each tile** (under a subtle top border) rather than to the right, so long descriptions and dates have full width.
- Dates use the full month name with an `à` / `at` separator (e.g. "23 avril 2026 à 12:29"), and list-meta lines end with a period.
- Home piles resized to fit a single iPhone-SE viewport without scrolling; pile max-width 186 px, gap 24 px, title 2.2 rem.
- Bottom nav switched to a CSS grid with four equal columns, softened selected-state gradient (halo rising from the top accent bar), and hover styles gated behind `(hover: hover)` so taps don't leave a stuck highlight on mobile.
- Login / change-password page pins the CoupleCards title to the top, size unified with the home header.
- Rules panel tightened vertically to fit the mobile viewport without scrolling.
- History meta strings shortened; the `list-item-meta` font size dropped to 0.72 rem.
- CoupleCards demo badge shares the admin gold palette so both read as roles.
- `.admin-language-select` pill replaced by the shared `.setting-select` styling (moved from `app.css` to `style.css` so admin.html can use it).

### Fixed

- `POST /auth/login` rejected any password shorter than 8 characters at schema validation, so the seeded demo account (`demo` / `demo`) never reached the handler. Login now accepts any non-empty password; the strength policy is still enforced on change-password.
- Redrawing from the same pile silently discarded the current card — no history entry was created. It now logs a `returned` entry.
- `.rules-text` and `.btn-compact` orphaned CSS rules removed.

## [1.0.2] - 2026-04-23

### Changed

- Pinned the container runtime UID and GID to `999:999` explicitly (previously assigned automatically by `useradd --system`, which could drift across base-image updates). Existing deployments on v1.0.1 do not need to re-chown since the effective UID was already 999.

### Documentation

- Deployment guide now states that host directories bind-mounted to `/app/var` must be owned by UID 999, and shows the `mkdir -p ./var && sudo chown -R 999:999 ./var` bootstrap step. This prevents the `SQLITE_ERROR: unable to open database file` crash that first-time self-hosted installs hit when Docker auto-creates the bind-mount as root.

## [1.0.1] - 2026-04-23

### Fixed

- Container crashed on startup with `ADDON_NOT_FOUND` for `sodium-native` (pulled in by `@fastify/secure-session`). Switched the Docker image from `node:24-alpine` (musl) to `node:24-slim` (glibc) on all three build stages, since sodium-native's musl prebuilds are not reliably fetched by npm. Package manager calls (`apk` → `apt-get`), user creation (`adduser -S` → `useradd --system`), and the `tini` path (`/sbin/tini` → `/usr/bin/tini`) were adapted accordingly.

## [1.0.0] - 2026-04-23

### Added

- Initial release.
