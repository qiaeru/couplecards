// SPDX-License-Identifier: MIT
// Environment parsing and runtime configuration.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function required(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Environment variable ${name} is required`);
  }
  return value;
}

function bool(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  return raw === '1' || raw.toLowerCase() === 'true';
}

function int(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) throw new Error(`Environment variable ${name} must be an integer`);
  return n;
}

const NODE_ENV = process.env.NODE_ENV || 'development';

// Mandatory in production; a throwaway default in dev so `npm start` just works.
const SESSION_SECRET = NODE_ENV === 'production'
  ? required('SESSION_SECRET')
  : (process.env.SESSION_SECRET || 'dev-secret-change-me-0123456789abcdef0123456789abcdef');

// @fastify/secure-session requires an exactly 32-byte key. Truncate in bytes,
// not characters: a multi-byte (accented) character inside the first 32
// characters would otherwise yield an oversized buffer and crash the boot.
function sessionKey(secret) {
  if (secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters');
  }
  return Buffer.from(secret, 'utf8').subarray(0, 32);
}

const DATA_DIR = process.env.DATA_DIR || resolve(process.cwd(), 'var');

function readPackageVersion() {
  try {
    const pkgPath = new URL('../package.json', import.meta.url);
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const config = {
  env: NODE_ENV,
  isProduction: NODE_ENV === 'production',
  port: int('PORT', 3000),
  host: process.env.HOST || '0.0.0.0',
  dataDir: DATA_DIR,
  dbPath: process.env.DB_PATH || resolve(DATA_DIR, 'couplecards.db'),
  sessionSecret: SESSION_SECRET,
  sessionKey: sessionKey(SESSION_SECRET),
  cookieSecure: bool('COOKIE_SECURE', NODE_ENV === 'production'),
  trustProxy: bool('TRUST_PROXY', false),
  seedLocale: (process.env.SEED_LOCALE || '').slice(0, 2).toLowerCase() || null,
  adminReset: bool('ADMIN_RESET', false),
  enableDemoAccount: bool('ENABLE_DEMO_ACCOUNT', false),
  enableRegistration: bool('ENABLE_REGISTRATION', false),
  version: readPackageVersion(),
  publicDir: process.env.PUBLIC_DIR || resolve(process.cwd(), '../public'),
  dataSeedDir: process.env.DATA_SEED_DIR || resolve(process.cwd(), '../data'),
};
