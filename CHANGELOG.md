# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing released yet._

## [1.0.2] - 2026-04-23

### Changed

- Pinned the container runtime UID and GID to `999:999` explicitly (previously assigned automatically by `useradd --system`, which could drift across base-image updates). Existing deployments on v1.0.1 do not need to re-chown since the effective UID was already 999.

### Documentation

- Deployment guide now states that host directories bind-mounted to `/app/var` must be owned by UID 999, and shows the `mkdir -p ./var && sudo chown -R 999:999 ./var` bootstrap step. This prevents the `SQLITE_ERROR: unable to open database file` crash that first-time self-hosted installs hit when Docker auto-creates the bind-mount as root.

## [1.0.1] - 2026-04-23

### Fixed

- Container crashed on startup with `ADDON_NOT_FOUND` for `sodium-native` (pulled in by `@fastify/secure-session`). Switched the Docker image from `node:24-alpine` (musl) to `node:24-slim` (glibc) on all three build stages, since sodium-native's musl prebuilds are not reliably fetched by npm. Package manager calls (`apk` → `apt-get`), user creation (`adduser -S` → `useradd --system`), and the `tini` path (`/sbin/tini` → `/usr/bin/tini`) were adapted accordingly.
