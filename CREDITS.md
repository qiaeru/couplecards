# Credits

Couplecards is released under the [MIT License](./LICENSE). Every third-party asset and library it ships is distributed under an OSI-approved or FSF-approved open source license. No CDN is contacted at runtime.

## Fonts

- **Inter.** Copyright © The Inter Project Authors, licensed under the [SIL Open Font License 1.1](https://openfontlicense.org/). Source: <https://github.com/rsms/inter>. Covers Latin Extended, Cyrillic, Greek, and Vietnamese.
- **Fraunces.** Copyright © The Fraunces Project Authors, licensed under the [SIL Open Font License 1.1](https://openfontlicense.org/). Source: <https://github.com/undercasetype/Fraunces>. Shipped as unicode-range WOFF2 subsets taken from Google Fonts v38, with one variable file per style (the upright file ships the wght / opsz / SOFT / WONK axes, the italic file ships wght / opsz). Covers Latin, Latin Extended, and Vietnamese; Fraunces upstream does not include Greek or Cyrillic glyphs, so locales using those scripts fall back to Georgia / system serif.

The full OFL text ships with the repository at `public/fonts/OFL.txt`.

## Icons

- **Fluent UI Emoji (Color 3D SVG).** Copyright © Microsoft Corporation, licensed under the [MIT License](https://github.com/microsoft/fluentui-emoji/blob/main/LICENSE). Source: <https://github.com/microsoft/fluentui-emoji>.

## Backend runtime

- [Fastify](https://fastify.dev/). MIT license.
- [@fastify/secure-session](https://github.com/fastify/fastify-secure-session). MIT license.
- [@fastify/csrf-protection](https://github.com/fastify/csrf-protection). MIT license.
- [@fastify/rate-limit](https://github.com/fastify/fastify-rate-limit). MIT license.
- [@fastify/helmet](https://github.com/fastify/fastify-helmet). MIT license.
- [@fastify/static](https://github.com/fastify/fastify-static). MIT license.
- [hash-wasm](https://github.com/Daninet/hash-wasm). MIT license. Provides Argon2id through a pure WebAssembly implementation, so the backend needs no native compilation.
- [@zxcvbn-ts/core and its dictionaries](https://github.com/zxcvbn-ts/zxcvbn) (`language-common`, `language-en`, `language-fr`, `language-de`, `language-it`, `language-es-es`). MIT license.
- [fflate](https://github.com/101arrowz/fflate). MIT license. Used to build and parse the deck export ZIP on the backend, and bundled into `public/vendor/fflate.js` for the admin import dialog.

The SQLite engine is the one bundled with Node.js itself, exposed as the `node:sqlite` module, and covered by the [Node.js MIT license](https://github.com/nodejs/node/blob/main/LICENSE).

## Frontend runtime

- [@zxcvbn-ts/core and its dictionaries](https://github.com/zxcvbn-ts/zxcvbn). MIT license. Bundled into `public/vendor/zxcvbn.js` during the Docker build.

## Build tooling

- [esbuild](https://esbuild.github.io/). MIT license.

## License policy

Before adding a new dependency, run the license check from the project root and inside `server/`:

```bash
npx license-checker --production --onlyAllow 'MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;OFL-1.1;CC0-1.0;Unlicense;0BSD;BlueOak-1.0.0'
```

The GitHub Actions workflow runs this check automatically on every pull request.
