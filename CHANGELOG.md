# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing released yet._

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
