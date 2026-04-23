// SPDX-License-Identifier: MIT
// Build-time bundles for browser vendor scripts. Outputs land in public/vendor/
// and are served by the static plugin with an immutable cache.

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = fileURLToPath(import.meta.url);
const root = resolve(here, '../..');
const outDir = resolve(root, 'public/vendor');
mkdirSync(outDir, { recursive: true });

const bundles = [
  {
    name: 'zxcvbn',
    entry: resolve(root, 'scripts/vendor-entry-zxcvbn.js'),
    outfile: resolve(outDir, 'zxcvbn.js'),
  },
  {
    name: 'jszip',
    entry: resolve(root, 'scripts/vendor-entry-jszip.js'),
    outfile: resolve(outDir, 'jszip.js'),
  },
];

for (const { name, entry, outfile } of bundles) {
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'esm',
    target: ['es2022'],
    minify: true,
    sourcemap: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'info',
  });
  console.log(`vendor bundle written to public/vendor/${name}.js`);
}
