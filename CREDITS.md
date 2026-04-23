# Credits

CoupleCards is released under the [MIT License](./LICENSE). Every third-party asset and library it ships is distributed under an OSI-approved or FSF-approved open source licence. No CDN is contacted at runtime.

## Fonts

- **Inter.** Copyright © The Inter Project Authors, licensed under the [SIL Open Font License 1.1](https://openfontlicense.org/). Source: <https://github.com/rsms/inter>. Covers Latin extended, Cyrillic, Greek and Vietnamese.
- **Literata.** Copyright © The Literata Project Authors, licensed under the [SIL Open Font License 1.1](https://openfontlicense.org/). Source: <https://github.com/googlefonts/literata>. Shipped as unicode-range WOFF2 subsets taken from Google Fonts v40, with seven subsets per style (so browsers only download the scripts they actually render). Covers Latin extended, Cyrillic, Greek and Vietnamese.

The full OFL text ships with the repository at `public/fonts/OFL.txt`.

## Icons

- **Fluent UI Emoji (flat SVG).** Copyright © Microsoft Corporation, licensed under the [MIT License](https://github.com/microsoft/fluentui-emoji/blob/main/LICENSE). Source: <https://github.com/microsoft/fluentui-emoji>.

## Backend runtime

- [Fastify](https://fastify.dev/). MIT licence.
- [@fastify/secure-session](https://github.com/fastify/fastify-secure-session). MIT licence.
- [@fastify/csrf-protection](https://github.com/fastify/csrf-protection). MIT licence.
- [@fastify/rate-limit](https://github.com/fastify/fastify-rate-limit). MIT licence.
- [@fastify/helmet](https://github.com/fastify/fastify-helmet). MIT licence.
- [@fastify/static](https://github.com/fastify/fastify-static). MIT licence.
- [hash-wasm](https://github.com/Daninet/hash-wasm). MIT licence. Provides Argon2id through a pure WebAssembly implementation, so the backend needs no native compilation.
- [@zxcvbn-ts/core and its dictionaries](https://github.com/zxcvbn-ts/zxcvbn) (`language-common`, `language-en`, `language-fr`). MIT licence.

The SQLite engine is the one bundled with Node.js itself, exposed as the `node:sqlite` module, and covered by the [Node.js MIT licence](https://github.com/nodejs/node/blob/main/LICENSE).

## Frontend runtime

- [@zxcvbn-ts/core and its dictionaries](https://github.com/zxcvbn-ts/zxcvbn). MIT licence. Bundled into `public/vendor/zxcvbn.js` during the Docker build.

## Build tooling

- [esbuild](https://esbuild.github.io/). MIT licence.

## Licence policy

Before adding a new dependency, run the licence check from the project root and inside `server/`:

```bash
npx license-checker --production --onlyAllow 'MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;OFL-1.1;CC0-1.0;Unlicense;0BSD'
```

The GitHub Actions workflow runs this check automatically on every pull request.
