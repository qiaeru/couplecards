// SPDX-License-Identifier: MIT
// Shared username rules for login, admin creation and public registration, so
// the three paths stay consistent: same pattern, same reserved names, same
// normalization.

export const RESERVED_USERNAMES = new Set([
  'couplecards', 'admin', 'demo', 'root', 'system', 'me', 'anonymous', 'null', 'undefined',
]);

export const usernameSchema = {
  type: 'string',
  minLength: 3,
  maxLength: 32,
  pattern: '^[a-z0-9._-]+$',
};

export function normalizeUsername(raw) {
  return String(raw || '').trim().toLowerCase();
}
