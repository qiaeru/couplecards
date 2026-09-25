// SPDX-License-Identifier: MIT
// Liveness probe. No auth. Safe to expose externally.

import { getDb } from '../db/index.js';

const bodySchema = {
  type: 'object',
  properties: {
    status: { type: 'string' },
    dbOk: { type: 'boolean' },
  },
};

export default async function healthRoutes(app) {
  app.get(
    '/health',
    {
      config: { rateLimit: false },
      schema: {
        response: { 200: bodySchema, 503: bodySchema },
      },
    },
    async (_request, reply) => {
      // Reads a real table rather than `SELECT 1`, which never touches the
      // file and keeps answering on an open handle whose volume went away.
      try {
        getDb().prepare('SELECT 1 FROM _migrations LIMIT 1').get();
      } catch {
        // A 503 is what the Dockerfile HEALTHCHECK and uptime monitors act on.
        return reply.code(503).send({ status: 'error', dbOk: false });
      }
      // No version here on purpose: the endpoint is public and the exact app
      // version is free reconnaissance on internet-exposed deployments.
      return { status: 'ok', dbOk: true };
    },
  );
}
