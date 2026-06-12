// SPDX-License-Identifier: MIT
// PWA manifest, content-negotiated by Accept-Language (English by default).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../config.js';
import { SUPPORTED_LOCALES, FALLBACK_LOCALE } from '../lib/locales.js';

function pickLocale(acceptLanguage) {
  if (!acceptLanguage) return FALLBACK_LOCALE;
  const tags = acceptLanguage.split(',').map((entry) => {
    const [tag, ...params] = entry.trim().split(';');
    let q = 1;
    for (const p of params) {
      const m = p.trim().match(/^q=(\d+(?:\.\d+)?)$/i);
      if (m) q = Number(m[1]);
    }
    return { tag: tag.toLowerCase(), q };
  }).filter((entry) => entry.tag && entry.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of tags) {
    const primary = tag.split('-')[0];
    if (SUPPORTED_LOCALES.includes(primary)) return primary;
  }
  return FALLBACK_LOCALE;
}

// Read every supported manifest once at module load. Files ship with the
// image and never change at runtime, so the per-request readFileSync was pure
// disk I/O for no benefit.
const manifests = new Map();
for (const locale of SUPPORTED_LOCALES) {
  manifests.set(locale, readFileSync(resolve(config.publicDir, `manifest.${locale}.webmanifest`), 'utf8'));
}

export default async function manifestRoutes(app) {
  app.get('/manifest.webmanifest', { config: { rateLimit: false } }, async (request, reply) => {
    const locale = pickLocale(request.headers['accept-language']);
    reply.type('application/manifest+json');
    reply.header('Cache-Control', 'public, max-age=3600');
    // The body depends on Accept-Language; without Vary a shared cache could
    // serve one locale's manifest to every visitor.
    reply.header('Vary', 'Accept-Language');
    return manifests.get(locale) ?? manifests.get(FALLBACK_LOCALE);
  });
}
