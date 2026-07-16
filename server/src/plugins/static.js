// SPDX-License-Identifier: MIT
// Serves the frontend from public/. Same Fastify instance answers /api/* too.

import fp from 'fastify-plugin';
import fastifyStatic from '@fastify/static';
import { config } from '../config.js';

export default fp(async function staticPlugin(app) {
  await app.register(fastifyStatic, {
    root: config.publicDir,
    prefix: '/',
    // Default wildcard:true is required: with wildcard:false, @fastify/static
    // indexes files at boot and newly added files 404 until a full restart.
    index: ['index.html'],
    setHeaders(reply, path) {
      if (path.endsWith('.html')) {
        reply.header('Cache-Control', 'no-cache');
      } else if (path.includes('/vendor/') || path.includes('/fonts/')) {
        reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        reply.header('Cache-Control', 'public, max-age=3600');
      }
    },
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      reply.code(404).send({ error: 'NOT_FOUND' });
      return;
    }
    reply.code(404).type('text/html').sendFile('404.html');
  });
});
