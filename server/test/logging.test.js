// SPDX-License-Identifier: MIT
// A PWA cold start pulls around thirty static assets, and encoding one access
// log line per asset costs more than serving it on this deployment's profile,
// so production suppresses those lines while keeping the logs that matter.
// The setting moved from Fastify's top-level `disableRequestLogging`, which
// Fastify 6 removes, onto a LogController instance; this pins the behavior so
// the next major cannot silently turn the noise back on.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { withServer } from './helpers.js';

const lines = [];

let context;
let app;

before(async () => {
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      for (const line of chunk.toString().split('\n')) {
        if (line.trim()) lines.push(line);
      }
      callback();
    },
  });
  context = await withServer({
    production: true,
    logger: { level: 'info', stream },
  });
  app = context.app;
});

after(() => context.cleanup());

test('production emits no per-request access log line', async () => {
  lines.length = 0;
  const response = await app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(response.statusCode, 200);

  const noise = lines.filter((line) => /incoming request|request completed/.test(line));
  assert.deepEqual(noise, [], `production logged ${noise.length} access line(s)`);
});

test('production still logs a request the error handler sees', async () => {
  lines.length = 0;
  // Schema validation runs before the route guards, so an unsupported locale
  // reaches setErrorHandler and is logged as a warning. A guard that answers
  // 401 with reply.send() never throws and is deliberately not logged.
  const response = await app.inject({ method: 'GET', url: '/api/cards?locale=zz' });
  assert.equal(response.statusCode, 400);

  assert.ok(
    lines.some((line) => /"level":(40|50)/.test(line)),
    `no warning or error line reached the log: ${lines.join(' | ')}`,
  );
});
