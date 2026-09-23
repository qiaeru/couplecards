// SPDX-License-Identifier: MIT
// Thin wrappers around the auth HTTP endpoints.

import { request, invalidateCsrf } from './api.js';
import { emit } from './events.js';
import { idb } from './idb.js';

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

export async function register(username, password) {
  const data = await request('/api/auth/register', {
    method: 'POST',
    body: { username, password },
    allow401: true,
  });
  cachedUser = data;
  invalidateCsrf();
  emit('auth:changed', data);
  return data;
}

export async function registrationEnabled() {
  try {
    const data = await request('/api/auth/registration');
    return !!data?.enabled;
  } catch {
    return false;
  }
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
    await rememberUser(data);
    emit('auth:changed', data);
    return data;
  } catch (err) {
    if (err?.status === 401) {
      cachedUser = null;
      return null;
    }
    // Server out of reach: open as the last user seen on this device, so the
    // cached shell, deck and state still work offline. The next request that
    // reaches the server checks the session again.
    if (err instanceof TypeError || err?.status >= 500) {
      const last = await idb.getUser().catch(() => null);
      if (last) {
        cachedUser = last;
        return last;
      }
    }
    throw err;
  }
}

// Local data belongs to one account: someone else signing in on this device
// must not inherit the previous user's state or flush their queued changes.
async function rememberUser(user) {
  try {
    const last = await idb.getUser();
    if (last && last.id !== user.id) await idb.clearAll();
    await idb.setUser(user);
  } catch {}
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
