// SPDX-License-Identifier: MIT
// Flat ESLint config. Three environments share one rule set: the browser SPA
// under public/js, the service worker, and the Node code (server, scripts,
// tests). Formatting rules are left to Prettier via eslint-config-prettier.

import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

const rules = {
  // Unused function arguments named `_something` are intentional placeholders
  // (Fastify handlers, event listeners) and must not fail the lint.
  'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  // `try { ... } catch {}` is the codebase's deliberate idiom for optional
  // browser APIs (localStorage in private mode, vibrate, wake lock).
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-var': 'error',
  'prefer-const': 'error',
  'no-throw-literal': 'error',
  // Awaiting inside a loop is often deliberate here (sequential migrations,
  // ordered seeds); flag only the genuinely accidental patterns instead.
  'require-atomic-updates': 'off',
};

export default [
  {
    ignores: ['node_modules/', 'server/node_modules/', 'public/vendor/', 'server/var/', 'var/'],
  },
  js.configs.recommended,
  {
    files: ['public/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
    },
    rules,
  },
  {
    files: ['public/sw.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: globals.serviceworker,
    },
    rules,
  },
  {
    files: ['server/**/*.js', 'scripts/**/*.{js,mjs}', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.nodeBuiltin,
    },
    rules,
  },
  prettier,
];
