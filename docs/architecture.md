# Architecture overview

Audience: contributors who want to understand how the pieces fit together before editing anything.

## High-level layout

```text
couplecards/
├── server/                       Node.js backend (Fastify 5 and node:sqlite)
│   ├── src/
│   │   ├── index.js              bootstrap
│   │   ├── config.js             environment parsing
│   │   ├── db/
│   │   │   ├── index.js          DatabaseSync wrapper and transaction helper
│   │   │   ├── migrate.js        migration runner
│   │   │   └── seed.js           first-run seeding
│   │   ├── plugins/              session, csrf, helmet, ratelimit, static
│   │   ├── lib/                  password hashing, auth guards, locale list, deck sync helpers
│   │   └── routes/               auth, cards, admin-cards, users, sync, manifest, health
│   └── migrations/               *.sql migration files
├── public/                       Frontend (plain ES modules, no build step for source)
│   ├── index.html                SPA shell
│   ├── login.html                login and forced-change flow
│   ├── admin.html                admin panel (users, cards, deck maintenance, language toggle)
│   ├── 404.html, 500.html        localised error pages
│   ├── views/                    SPA partials loaded by the router
│   ├── js/
│   │   ├── app.js, login.js, admin.js       page entry points
│   │   ├── core/                 api, auth, events, i18n, idb, router, sync
│   │   ├── features/             home, deck, history, collection, settings, rules, admin, auth
│   │   └── ui/                   shell, emoji, password-strength, sound
│   ├── css/, fonts/, icons/, locales/, vendor/
│   └── sw.js                     Service Worker
├── data/
│   ├── cards.en.json             English translations, loaded at first-run seed
│   └── cards.fr.json             French translations, loaded at first-run seed
├── scripts/                      build-time helpers (vendor bundle, SPDX retrofit)
├── deploy/                       reverse proxy presets for Caddy, Traefik and nginx
├── docs/                         you are here
└── docker-compose.yml, Dockerfile
```

## Request flow

### Authenticated page load

```text
Browser → GET /                → static plugin serves index.html
Browser → app.js               → me() calls /api/auth/me
  if 401                         → redirect to /login.html
  if mustChangePassword          → redirect to /login.html?forceChange=1
  if isDemo                      → show the persistent demo banner
Browser → initI18n() and initSync()  (GET /api/cards, GET /api/state)
Browser → router mounts the first route (for example home)
```

### Mutation while online

```text
draw.js → sync.banCard(id)
       → idb.setBanned([...])            optimistic write to IndexedDB
       → idb.enqueue({kind:'ban', id})   push into the outbox
       → POST /api/bans                  (retries automatically through the outbox on failure)
```

### Mutation while offline

```text
sync.banCard(id) → IndexedDB update → outbox enqueue (flush attempt fails)
[online event]   → sync.flushOutbox() drains the outbox to the server
```

## Router

The SPA router lives in `public/js/core/router.js` and is roughly sixty lines of code. A route name maps to a partial HTML file in `public/views/<name>.html` and to a dynamically imported feature module at `public/js/features/<name>/<name>.js`. Each feature module exports a `mount({ params })` function and an optional `unmount()` function.

## State management

- The deck, the banned set and the history all live in IndexedDB.
- The deck is refreshed from `GET /api/cards`, which returns an ETag-style `version` token so the client can skip the download when nothing has changed.
- The banned set and the history are synchronised through `GET /api/state` and their respective mutation endpoints.
- Mutations are queued in an IndexedDB `outbox` store and drained every time the page comes back online.

`public/js/core/sync.js` is the single entry point for state. Feature modules never talk to the API directly. Each card exposes a `translations` object keyed by locale, and the helper `getCardText(card, locale)` picks the right title and description for the current user language with an English fallback.

## Card draw

`drawRandom(pile, recentIds)` in `public/js/core/sync.js` picks the next card for a pile. It first removes the user's banned cards (`availableCards`), then excludes the most recently drawn ids in that pile (`CONFIG.recentExclude`, three by default) so the same card does not come back two draws in a row. From the remaining pool it does a weighted random pick: standard cards weigh `1.0`, foil cards weigh `FOIL_WEIGHT = 0.3`. The constant lives at the top of `sync.js` and exists to keep the appearance rate of foil cards (the rare, explicitly sexual variant) low even when their share of the deck is non-trivial. With the current FR deck (28 foil out of 142), the effective foil draw rate is around 9.7% on the home pile and 4.4% on the outdoor pile, well below what the raw counts would suggest.

## Collection screen

`public/js/features/collection/collection.js` renders the deck as a grid mirrored on the user's history. A card is "discovered" once it appears in the local history (returned or banned). Drawn tiles open the existing draw screen in preview mode (`#/draw?preview=<cardId>`), where Ban or Restore buttons mutate the banned set without leaving the screen. Banned tiles carry a red cross overlay; undiscovered tiles show a "?" silhouette and ignore clicks. Foil cards wear a subtle static rainbow border regardless of state. The screen is fully derived from `getCards()`, `getHistory()` and `isBanned(id)` from `core/sync.js`, so there is no dedicated backend endpoint.

## Internationalisation

The backend has a single source of truth for supported locales in `server/src/lib/locales.js`. The frontend mirrors this list in `SUPPORTED` inside `public/js/core/i18n.js`.

- User-interface strings live in flat key-to-string JSON files under `public/locales/<locale>.json`.
- `public/js/core/i18n.js` provides `t`, `tn`, `fmtDate`, `fmtDateLong`, `fmtNumber` and `applyI18n(root)`.
- Static HTML uses `data-i18n="key"` and `data-i18n-attr="attr:key,attr2:key2"`.
- Dynamic JavaScript calls `t(key, params)`.
- An `i18n:change` event is emitted by `setLocale()`. The i18n module reapplies translations to the DOM on every change, and feature modules listen to it when they cache card text.
- Card content lives in the database table `card_translations(card_id, locale, title, description)` so the same deck serves every supported language. The seed files under `data/cards.<locale>.json` are merged at first-run seed to populate every translation at once.

The procedure to add a third language is documented end-to-end in [i18n.md](./i18n.md).

## Backend routes

Four guard levels are referenced below: **public** (no auth needed), **session** (any signed-in account), **user** (signed-in non-admin account, used for the player-only state and history endpoints) and **admin**.

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/health` | public | Liveness probe |
| `GET` | `/api/auth/csrf` | public | Issues a double-submit token |
| `GET` | `/api/auth/password-policy` | public | Hard rules and zxcvbn thresholds |
| `POST` | `/api/auth/login` | public | Rate-limited to 5 attempts per minute per IP |
| `POST` | `/api/auth/logout` | session | |
| `GET` | `/api/auth/me` | public | Returns 401 when no session |
| `POST` | `/api/auth/change-password` | session | Rotates `session_epoch` |
| `POST` | `/api/auth/preferences` | session | Updates the locale |
| `GET` | `/api/cards` | session | Returns each card with `translations` keyed by locale. ETag-aware, 304 when unchanged |
| `POST`, `PATCH`, `DELETE` | `/api/cards[/:id]` | admin | Per-card CRUD. The body carries a `translations` map of `{ locale: { title, description } }` |
| `GET` | `/api/admin/cards/export` | admin | Downloads a ZIP with one `cards.<locale>.json` per supported locale, pretty-printed |
| `POST` | `/api/admin/cards/sync` | admin | Reads every `cards.<locale>.json` under `data/` and applies them together (mirror or upsert) |
| `POST` | `/api/admin/cards/import` | admin | Applies a deck uploaded in the request body (multilingual shape) |
| `GET` | `/api/state` | user | Returns `{ banned, history }` |
| `POST` | `/api/state/reset` | user | Wipes the caller's bans and history in a single transaction. Rejected with 403 for demo accounts |
| `POST`, `DELETE` | `/api/bans[/:cardId]` | user | Idempotent |
| `POST` | `/api/history` | user | Batch endpoint, idempotent on `clientUuid` |
| `GET`, `POST`, `PATCH`, `DELETE` | `/api/admin/users[/:id]` | admin | Full user CRUD plus unlock and reset-password |
| `GET` | `/manifest.webmanifest` | public | Negotiated on `Accept-Language` |

## Why vanilla JavaScript and no build step for source

A zero client-side toolchain keeps the contribution barrier low. A text editor and a browser are enough to edit any feature. The only build step is the vendor bundle produced by `scripts/build-vendor.mjs`, which currently packages the zxcvbn core and the fflate library used by the admin deck import dialog. Both are invoked automatically during the Docker build.

## Seeding and upgrades

- On first boot, `seed.js` inserts the default admin account and merges every `data/cards.<locale>.json` file into the `cards` and `card_translations` tables.
- Subsequent starts do nothing when the `users` and `cards` tables are already populated. Cards or translations added later to `data/cards.*.json` are not imported automatically. An admin can apply them through the Deck maintenance screen in the admin panel (see [administration.md](./administration.md)).
- Database migrations live in `server/migrations/NNN_*.sql`. The runner applies any missing file in lexical order and tracks applied files in the `_migrations` table.
