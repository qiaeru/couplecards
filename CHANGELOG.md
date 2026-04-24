# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- New `POST /api/state/reset` endpoint backing a "Reset my data" action in the settings screen. It deletes the caller's bans and history in a single transaction. Demo accounts are rejected with 403 since their state is already wiped at every sign-in.

### Changed

- Admin UI polish: header title shrunk so the logout button stays in the viewport on narrow screens, Export/Import backup buttons aligned with the full-width "Sync from the files" button, user-list and card-list action buttons resized via a new `.btn-sm` utility, demo badge now shares the admin gold palette to read as a role.
- History entries render as tilted stamps instead of horizontal pills; action labels shortened ("Remise"/"Bannie", "Returned"/"Banned").
- Banned-card tiles are now clickable and open the card in preview mode, mirroring the History view.
- Home piles shrink on mobile so both fit in a ~375×667 viewport without scrolling.
- Bottom-nav selected-state gradients softened and icon spacing normalised with `space-evenly`.
- The heart divider between the "draw" and "reveal" paragraphs on the Rules page was removed.

### Fixed

- `POST /auth/login` rejected any password shorter than 8 characters at schema validation, so the seeded demo account (`demo` / `demo`) never reached the handler. Login now accepts any non-empty password; the strength policy is still enforced on change-password.

## [1.0.2] - 2026-04-23

### Changed

- Pinned the container runtime UID and GID to `999:999` explicitly (previously assigned automatically by `useradd --system`, which could drift across base-image updates). Existing deployments on v1.0.1 do not need to re-chown since the effective UID was already 999.

### Documentation

- Deployment guide now states that host directories bind-mounted to `/app/var` must be owned by UID 999, and shows the `mkdir -p ./var && sudo chown -R 999:999 ./var` bootstrap step. This prevents the `SQLITE_ERROR: unable to open database file` crash that first-time self-hosted installs hit when Docker auto-creates the bind-mount as root.

## [1.0.1] - 2026-04-23

### Fixed

- Container crashed on startup with `ADDON_NOT_FOUND` for `sodium-native` (pulled in by `@fastify/secure-session`). Switched the Docker image from `node:24-alpine` (musl) to `node:24-slim` (glibc) on all three build stages, since sodium-native's musl prebuilds are not reliably fetched by npm. Package manager calls (`apk` → `apt-get`), user creation (`adduser -S` → `useradd --system`), and the `tini` path (`/sbin/tini` → `/usr/bin/tini`) were adapted accordingly.
