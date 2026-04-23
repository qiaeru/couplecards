// SPDX-License-Identifier: MIT
// Thin wrappers around the auth HTTP endpoints.

import { request, invalidateCsrf } from './api.js';
import { emit } from './events.js';

let cachedUser = null;

export async function login(username, password) {
  const data = await request('/api/auth/login', {
    method: 'POST',
    body: { username, password },
    allow401: true,
  });
  cachedUser = data;
  invalidateCsrf();
  emit('auth:changed', data);
  return data;
}

export async function logout() {
  try {
    await request('/api/auth/logout', { method: 'POST' });
  } finally {
    cachedUser = null;
    invalidateCsrf();
    emit('auth:changed', null);
  }
}

export async function me({ allow401 = true } = {}) {
  try {
    const data = await request('/api/auth/me', { allow401 });
    cachedUser = data;
    emit('auth:changed', data);
    return data;
  } catch (err) {
    if (err?.status === 401) {
      cachedUser = null;
      return null;
    }
    throw err;
  }
}

export function getCachedUser() {
  return cachedUser;
}

export async function changePassword(currentPassword, newPassword) {
  const data = await request('/api/auth/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
  invalidateCsrf();
  // Session epoch is rotated server-side; reload /me to pick up the new flags.
  await me();
  return data;
}

export async function getPasswordPolicy() {
  return request('/api/auth/password-policy');
}

export async function setPreferences(prefs) {
  return request('/api/auth/preferences', { method: 'POST', body: prefs });
}
