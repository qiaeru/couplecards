# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Accessibility: demote the CoupleCards wordmark on `login.html` from `<h1>` to `<div>`. Each login stage (Sign in, Change password) keeps its own `<h1>`, so the document hierarchy now has a single top-level heading per view instead of two.
- Accessibility: associate the Settings switches (Sound effects, Vibrations) with their visible label via `aria-labelledby`. Screen readers now announce the checkbox name instead of an unlabeled toggle.
- Accessibility: replace the first tab stop of the SPA shell with a real "Skip to main content" link. It previously pointed at `#/home` with the label "Back", which was misleading for keyboard users expecting the standard skip-link behaviour. It now targets `<main id="main-content">` (marked `tabindex="-1"` so it can receive focus) and uses a dedicated `common.skipToContent` i18n key in both locales.
- Accessibility: move focus to `<main id="main-content">` after every SPA route change. Keyboard and screen-reader users now hear the new view's contents instead of staying stranded on the last clicked link.
- Accessibility: tag the revealed card's title and description with the effective `lang` attribute. When a card has no translation in the active UI locale and falls back to English, screen readers now switch to the English voice instead of mispronouncing the text with the UI voice.
- Accessibility: make the admin tablist follow the WAI-ARIA APG tabs pattern. The active tab carries `tabindex="0"` and every other tab `tabindex="-1"`, so `Tab` moves from the tablist straight into the visible panel. `ArrowLeft` / `ArrowRight`, `Home` and `End` now cycle between tabs and move focus to the newly selected one.

### Security

- Raise the Argon2id iteration count from `t=2` to `t=3` on password hashing. Still uses the same 19 MiB memory cost. Adds roughly 15 ms to each login and password change; existing stored hashes keep verifying since the PHC string embeds its own parameters.

### Documentation

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
