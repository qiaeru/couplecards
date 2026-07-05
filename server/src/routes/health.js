// SPDX-License-Identifier: MIT
// Liveness probe. No auth. Safe to expose externally.

import { getDb } from '../db/index.js';

export default async function healthRoutes(app) {
  app.get('/health', {
    config: { rateLimit: false },
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            dbOk: { type: 'boolean' },
          },
        },
      },
    },
  }, async () => {
    let dbOk = false;
    try {
      getDb().prepare('SELECT 1').get();
      dbOk = true;
    } catch {
      dbOk = false;
    }
    // No version here on purpose: the endpoint is public and the exact app
    // version is free reconnaissance on internet-exposed deployments.
    return { status: 'ok', dbOk };
  });
}
