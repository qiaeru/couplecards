// SPDX-License-Identifier: MIT
// Global rate limiting for /api/* only; static assets stay unlimited so a
// page refresh doesn't burn the budget. Per-route stricter limits live where
// the routes are declared (5/min on login, 10/hour on change-password).

import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';

export default fp(async function rateLimitPlugin(app) {
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    allowList: (req) => !req.url.startsWith('/api/') || req.url === '/api/health',
    // Must return a real Error with statusCode so setErrorHandler maps it to
    // a 429; a plain POJO would fall through to the 500 branch.
    errorResponseBuilder: () => {
      const err = new Error('Too many requests');
      err.statusCode = 429;
      err.code = 'RATE_LIMITED';
      return err;
    },
  });
});
