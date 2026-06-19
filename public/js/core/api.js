// SPDX-License-Identifier: MIT
// JSON fetch wrapper: same-origin cookies, CSRF header on mutations,
// automatic redirect to /login on 401, typed errors from backend codes.

import { t } from './i18n.js';

const CSRF_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

let csrfToken = null;
let csrfPromise = null;

export class ApiError extends Error {
  constructor(code, status, details) {
    super(code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function ensureCsrf() {
  if (csrfToken) return csrfToken;
  if (!csrfPromise) {
    csrfPromise = fetch('/api/auth/csrf', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new ApiError('CSRF_UNAVAILABLE', r.status))))
      .then((data) => { csrfToken = data.token; return csrfToken; })
      .catch((err) => { csrfPromise = null; throw err; });
  }
  return csrfPromise;
}

// Drop the cached token so the next mutation re-fetches one (called after
// login and password change, which rotate the session server-side).
export function invalidateCsrf() {
  csrfToken = null;
  csrfPromise = null;
}

export async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  let body = options.body;

  if (body !== undefined && !(body instanceof FormData) && typeof body !== 'string') {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }

  if (CSRF_METHODS.has(method)
    && !path.startsWith('/api/auth/login')
    && !path.startsWith('/api/auth/register')
    && !path.startsWith('/api/auth/csrf')) {
    headers.set('x-csrf-token', await ensureCsrf());
  }

  const resp = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers,
    body,
  });

  if (resp.status === 204) return null;

  let data = null;
  const contentType = resp.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await resp.json().catch(() => null);
  }

  if (!resp.ok) {
    const code = (data && data.error) || `HTTP_${resp.status}`;
    if (resp.status === 401 && !options.allow401) {
      redirectToLogin();
    }
    throw new ApiError(code, resp.status, data?.details);
  }

  if (path.startsWith('/api/auth/login')
    || path.startsWith('/api/auth/register')
    || path.startsWith('/api/auth/change-password')) {
    invalidateCsrf();
  }

  return data;
}

// Localized user-facing message for an ApiError (or any thrown value). Falls
// back to errors.generic when the server code has no matching translation,
// so unknown codes never leak as raw "errors.SOMETHING_WEIRD" strings.
export function errorMessage(err) {
  if (err instanceof ApiError) {
    const key = `errors.${err.code}`;
    const localised = t(key);
    if (localised !== key) return localised;
  }
  return t('errors.generic');
}

function redirectToLogin() {
  if (location.pathname.endsWith('/login.html')) return;
  const target = location.pathname + location.search + location.hash;
  const url = new URL('/login.html', location.origin);
  if (target && target !== '/') url.searchParams.set('next', target);
  location.replace(url.toString());
}
