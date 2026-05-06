// SPDX-License-Identifier: MIT
// Strict security headers: CSP, Permissions-Policy, HSTS when secure.

import fp from 'fastify-plugin';
import helmet from '@fastify/helmet';
import { config } from '../config.js';

export default fp(async function helmetPlugin(app) {
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'"],
        'img-src': ["'self'", 'data:'],
        'font-src': ["'self'"],
        'connect-src': ["'self'"],
        'worker-src': ["'self'"],
        'manifest-src': ["'self'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'object-src': ["'none'"],
        // Helmet ships `upgrade-insecure-requests` by default. On a plain-HTTP
        // LAN deployment this rewrites every asset URL to https:// and breaks
        // the page. Keep it only when we know we are served over HTTPS.
        'upgrade-insecure-requests': config.cookieSecure ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'same-origin' },
    strictTransportSecurity: config.cookieSecure
      ? { maxAge: 63072000, includeSubDomains: true }
      : false,
  });

  // Deny browser APIs the app does not need.
  app.addHook('onSend', async (_req, reply) => {
    reply.header(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), usb=(), payment=(), magnetometer=(), accelerometer=(self), gyroscope=(self)',
    );
    reply.header('X-Robots-Tag', 'noindex, nofollow');
  });
});
