// SPDX-License-Identifier: MIT
// PWA manifest, content-negotiated by Accept-Language (English by default).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../config.js';

function pickLocale(acceptLanguage) {
  if (!acceptLanguage) return 'en';
  const normalized = acceptLanguage.toLowerCase();
  if (normalized.startsWith('fr')) return 'fr';
  if (normalized.startsWith('de')) return 'de';
  if (normalized.startsWith('it')) return 'it';
  if (normalized.startsWith('es')) return 'es';
  return 'en';
}

export default async function manifestRoutes(app) {
  app.get('/manifest.webmanifest', { config: { rateLimit: false } }, async (request, reply) => {
    const locale = pickLocale(request.headers['accept-language']);
    const path = resolve(config.publicDir, `manifest.${locale}.webmanifest`);
    const data = readFileSync(path, 'utf8');
    reply.type('application/manifest+json');
    reply.header('Cache-Control', 'public, max-age=3600');
    return data;
  });
}
