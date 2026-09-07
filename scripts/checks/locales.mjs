// SPDX-License-Identifier: MIT
// The supported-locale list exists twice by necessity: the server reads
// SUPPORTED_LOCALES from server/src/lib/locales.js, and the browser module has
// its own copy in public/js/core/i18n.js because a page cannot import server
// code without a build step this project deliberately does not run. Drift
// between the two is silent, so compare them here, and make sure every locale
// actually ships the four files it needs.

import { repoPath, read, existsExact } from './lib.mjs';

function serverLocales() {
  const text = read(repoPath('server', 'src', 'lib', 'locales.js'));
  const match = text.match(/SUPPORTED_LOCALES\s*=\s*Object\.freeze\(\[([^\]]*)\]/);
  if (!match) return null;
  return [...match[1].matchAll(/'([a-z]{2})'/g)].map((m) => m[1]);
}

function clientLocales() {
  const text = read(repoPath('public', 'js', 'core', 'i18n.js'));
  const match = text.match(/SUPPORTED\s*=\s*new Set\(\[([^\]]*)\]/);
  if (!match) return null;
  return [...match[1].matchAll(/'([a-z]{2})'/g)].map((m) => m[1]);
}

export function run() {
  const errors = [];
  const notes = [];
  const server = serverLocales();
  const client = clientLocales();
  if (!server || !client) {
    errors.push('could not read the supported-locale list from the server or the client module');
    return { name: 'locales', errors, notes };
  }
  if (server.join(',') !== client.join(',')) {
    errors.push(
      `supported locales differ: server/src/lib/locales.js has [${server.join(', ')}], ` +
        `public/js/core/i18n.js has [${client.join(', ')}]`,
    );
  }

  for (const locale of server) {
    const required = [
      ['public', 'locales', `${locale}.json`],
      ['public', `manifest.${locale}.webmanifest`],
      ['data', `cards.${locale}.json`],
    ];
    for (const parts of required) {
      if (!existsExact(repoPath(...parts))) {
        errors.push(`locale '${locale}' is declared but ${parts.join('/')} is missing`);
      }
    }
  }

  notes.push(`locales: ${server.join(', ')}`);
  return { name: 'locales', errors, notes };
}
