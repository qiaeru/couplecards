# Contributing to Couplecards

Thank you for considering a contribution. The project is intentionally small and must stay approachable to non-technical maintainers who run their own instance. Changes that keep it simple are the ones most likely to land.

## Ground rules

- **English everywhere in the source tree.** This applies to comments, commit messages, pull request descriptions, documentation, identifiers (variables, functions, route paths, SQL columns), and anything else a reviewer reads. The only French strings allowed in the codebase live in `public/locales/fr.json`.
- **No external network calls at runtime.** The app is self-contained and a fresh install must work offline after the initial boot.
- **No new mandatory tooling** such as linters, formatters, or test frameworks that a non-technical maintainer would have to run locally. Build-time tools like esbuild are fine as long as they remain invisible inside the Docker build.
- **No telemetry, no analytics, no third-party trackers.** Ever.

## Development setup

Prerequisites:

- Node.js 24 or later (the `.nvmrc` file pins `24` for tools such as `nvm`, `fnm`, or `volta`).
- Docker with the Compose plugin, optional for frontend-only work.
- A modern browser.

The backend has zero native dependencies. It runs on `node:sqlite` (built into Node since version 24) and on `hash-wasm` (Argon2id compiled to WebAssembly). There is nothing to compile, no prebuilt binary to chase, and no toolchain to install beyond Node itself.

```bash
# Clone
git clone https://github.com/qiaeru/couplecards.git
cd couplecards

# Install backend dependencies (only needed to run the server outside Docker)
cd server && npm install && cd ..

# Install the root devDependencies (esbuild and the zxcvbn packages used by the vendor bundle)
npm install

# Build the zxcvbn vendor bundle (outputs public/vendor/zxcvbn.js)
npm run build:vendor

# Option A. Run the backend directly on the host
cd server
SESSION_SECRET="$(openssl rand -base64 48)" node src/index.js

# Option B. Run the full Docker stack
cp .env.example .env
# paste a SESSION_SECRET into .env
docker compose up -d --build
```

Open <http://localhost:3000>, then sign in with `couplecards` and the password `changeme`.

## Project layout

See [docs/architecture.md](./docs/architecture.md) for the full breakdown.

## Licenses and dependencies

Only bring in dependencies that ship under a permissive license. The allowed list is:

```text
MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, OFL-1.1, CC0-1.0, Unlicense, 0BSD, BlueOak-1.0.0
```

Before adding a new package, run the license check from the project root and inside `server/`:

```bash
npx license-checker --production --onlyAllow 'MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;OFL-1.1;CC0-1.0;Unlicense;0BSD;BlueOak-1.0.0'
```

The GitHub Actions workflow enforces this check automatically on every pull request.

## Internationalization

The full workflow lives in [docs/i18n.md](./docs/i18n.md). The short version:

- Never hardcode a natural-language string inside code or HTML. Always go through a key from `public/locales/en.json`.
- Any pull request that adds a string must add it to every locale file under `public/locales/` (currently `fr`, `en`, `de`, `it`, `es`). The files share the same key set in the same canonical order.

## Fonts and non-Latin scripts

The bundled fonts are Inter for the sans-serif stack and Fraunces for the serif and display stack. Inter covers Latin Extended, Cyrillic, Greek, and Vietnamese. Fraunces covers Latin Extended and Vietnamese; Greek and Cyrillic are not part of the Fraunces upstream, so locales using those scripts will fall back to Georgia / system serif on the wordmark, headings, and card text. Scripts outside the Latin and Vietnamese range (CJK, Arabic, Hebrew, Thai, the Indic family) require an additional font. Add a new `@font-face` entry in `public/css/fonts.css` along with the matching WOFF2 file in `public/fonts/`.

## Commit and pull request style

- Keep commits small and focused. One concern per pull request.
- Write the commit subject in imperative English, for example `Add sync outbox`.
- Reference related issues by number in the commit body when relevant.
- Every new source file must carry an SPDX header on its first line. The `scripts/add-spdx.mjs` helper can retrofit existing files.

## Security

Private reports go through the GitHub security advisory link published in [`public/.well-known/security.txt`](./public/.well-known/security.txt). Please do not open a public issue for a vulnerability.
