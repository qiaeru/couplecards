# Contributing to Couplecards

Thank you for considering a contribution. The project is intentionally small and must stay approachable to non-technical maintainers who run their own instance. Changes that keep it simple are the ones most likely to land.

## Ground rules

- **English everywhere in the source tree.** This applies to comments, commit messages, pull request descriptions, documentation, identifiers (variables, functions, route paths, SQL columns), and anything else a reviewer reads. The only French strings allowed in the codebase live in `public/locales/fr.json`.
- **No external network calls at runtime.** The app is self-contained and a fresh install must work offline after the initial boot.
- **No tooling a maintainer has to run.** The repo ships ESLint, Prettier, a set of consistency checks, and a test suite, but running an instance never touches any of them: `docker compose up` builds and boots without them, and CI enforces them on every pull request. Build-time tools like esbuild stay invisible inside the Docker build.
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

## Checks

Install the root dependencies once (`npm install`), then run everything with `npm run check`. CI runs the same four commands on every pull request, so a green local run means a green pull request.

| Command | What it covers |
| --- | --- |
| `npm run format:check` | Prettier over JS, CSS, JSON, and YAML. `npm run format` rewrites in place. HTML and Markdown are excluded on purpose: Prettier explodes inline SVGs and pads Markdown tables. |
| `npm run lint` | ESLint over the browser modules, the service worker, and the server. `npm run lint:fix` applies what it can. |
| `npm run check:repo` | The invariants no linter knows about, described below. |
| `npm test` | The server suite, on Node's built-in test runner. No framework to install. |

`npm run check:repo` runs five checks, and you can run one alone by naming it, for example `node scripts/check.mjs i18n`:

- `locales` compares the supported-locale list the server holds against the copy in `public/js/core/i18n.js`, and confirms each locale ships its catalogue, its web manifest, and its card file.
- `i18n` confirms every locale carries the same keys as English with none left empty, that every key the source tree asks for exists, and that no key sits unused.
- `sw-shell` confirms the service worker precaches every file under `public/js`, `public/css`, `public/views`, and `public/locales`, and that it lists nothing that no longer exists.
- `cards` reads `data/cards.<locale>.json` through the server's own deck reader, so a deck that passes here is a deck the server accepts at boot. It also confirms every emoji slug has its SVG.
- `references` resolves every relative and root-absolute import, plus the `src` and `href` attributes of the HTML pages. The comparison is case-sensitive, since Windows and macOS serve `core/API.js` for `core/api.js` and the Linux container does not.

One check needs a diff base and therefore runs only in CI, or by hand against a base branch:

```bash
node scripts/check-sw-version.mjs origin/main
```

It fails when a change touches a precached asset without moving the `VERSION` constant in `public/sw.js`. Browsers keep serving the old cached shell until that string changes, so the fix ships and nobody sees it. Deck emoji under `public/icons/emoji/` are exempt, because the service worker caches them at runtime on first fetch.

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
- Every new source file must carry an SPDX header on its first line (`// SPDX-License-Identifier: MIT`).

## Security

Private reports go through the GitHub security advisory link published in [`public/.well-known/security.txt`](./public/.well-known/security.txt). Please do not open a public issue for a vulnerability.
