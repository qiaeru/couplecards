# Security model

Audience: admins who self-host the app and want a clear picture of the measures in place.

## Authentication

- Passwords are hashed with Argon2id (`t=3`, `m=19 MiB`, `p=1`), one iteration above the OWASP 2024 minimum.
- The password policy is enforced on the server, with the client mirroring it for live feedback. The hard rules are a minimum length of 12 characters, at least one uppercase letter, one lowercase letter, one digit and one special character, no whitespace, and no inclusion of the username. Each password must also reach a zxcvbn score of 4 for the admin account and 3 for a regular user, with one dictionary loaded per supported locale (English, French, German, Italian, Spanish).
- Initial user passwords are generated with `crypto.randomBytes` and enforced character classes. The admin sees the value once; only the hash is stored.
- A user account with a pending password change cannot reach any protected endpoint until the password has been updated.
- Role separation is enforced at the API layer, not just in the UI. The admin account always lands on `/admin.html` and never plays cards, so the player-only endpoints (`/api/state`, `/api/state/reset`, `/api/bans*`, `/api/history`) reject any cookie carrying the `admin` role with `403 FORBIDDEN`. Conversely, every `/api/cards` mutation and every `/api/admin/*` route requires the admin role.

## Session management

- Session cookies are issued by `@fastify/secure-session`. Each cookie is signed and AES-encrypted with the `SESSION_SECRET`. It carries the `HttpOnly` flag, the `SameSite=Strict` attribute, the `Secure` flag over HTTPS, and a maximum age of 30 days.
- Every user row carries a session counter. Changing the password increments the counter, which invalidates every existing session for that user.
- The `ADMIN_RESET` recovery flow also bumps the admin session counter so any previously issued admin cookie stops working.

## CSRF and input validation

- Every mutating request under `/api/*` requires a CSRF token bound to the session cookie (`@fastify/csrf-protection`). The check is wired as a global hook so all mutating routes are covered by default. The login endpoint is exempt because it has no session cookie yet; it relies on `SameSite=Strict` and its own rate limit instead.
- Every request body, query and params object is validated against a JSON schema with `additionalProperties: false`. Unknown fields produce a `400 VALIDATION_ERROR` rather than being silently ignored.
- The server does not accept cross-origin requests.

## Rate limiting and lockout

- The global bucket allows 300 requests per minute per IP, counting only `/api/*` endpoints. Static assets (HTML, CSS, JS, fonts, images, the service worker, view partials) are exempt so normal browsing never burns the quota.
- `POST /api/auth/login` is limited to 5 requests per minute per IP.
- `POST /api/auth/change-password` is limited to 10 requests per hour per IP.
- After 10 consecutive failed login attempts an account is locked for 15 minutes. The admin can unlock it earlier from the admin panel.
- The per-IP counters read the client IP through Fastify. Enable `TRUST_PROXY=1` only behind a reverse proxy that you control and that strips inbound `X-Forwarded-*` headers, otherwise a remote caller can spoof the header and bypass these limits. All variants under [`deploy/`](../deploy/) are safe in this respect.

## Transport and headers

When running behind any HTTPS variant in `deploy/`, the server emits the following headers:

- `Strict-Transport-Security: max-age=63072000; includeSubDomains`.
- `Content-Security-Policy: default-src 'self'; ...; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`. The policy uses neither `unsafe-inline` nor `unsafe-eval`. The `upgrade-insecure-requests` directive is appended only when the server is configured for HTTPS (`COOKIE_SECURE=1` or one of the HTTPS deploy variants); a plain-HTTP LAN deployment omits it so assets are not rewritten to a scheme the server cannot serve.
- `Permissions-Policy` denies camera, microphone, geolocation, USB, payment, magnetometer, accelerometer and the interest cohort signal. Gyroscope is allowed on the same origin so the card tilt on the draw screen works.
- `Referrer-Policy: same-origin`.
- `X-Content-Type-Options: nosniff`.
- `X-Robots-Tag: noindex, nofollow` on every response.

## Data at rest

- A single SQLite file with WAL journaling.
- `foreign_keys = ON` is set on every connection. Every query is a prepared statement through `node:sqlite`.
- Per-user history is capped at 500 entries, with the oldest entries pruned automatically.

## Operator responsibilities

The host and its operator remain in the trust boundary:

- Keep the host itself up to date and restrict SSH and shell access. Anyone with filesystem access to the data directory can read and copy the SQLite file.
- Protect the value of `SESSION_SECRET`. If it ever leaks, rotate it: restarting with a fresh secret invalidates every existing session. Never commit it to a repository.
- Back up the `var/` directory regularly if the instance is used actively. See [deployment.md](./deployment.md).
- Run the app behind one of the HTTPS reverse proxies in [`deploy/`](../deploy/) in production. The local `docker-compose.yml` only ships plain HTTP, suitable for a trusted LAN.

Authentication relies on a single factor (password). For a two-person self-hosted instance this is an acceptable trade-off; anyone who believes their threat model requires more should consider fronting the app with an authenticating reverse proxy.

## The shared demo account

The optional `demo` account, enabled with `ENABLE_DEMO_ACCOUNT=1`, is a deliberate opt-in credential:

- Anyone who knows the URL can sign in, because the credential is well known by design.
- The account is restricted to the `user` role, cannot change its password, cannot be renamed, cannot be deleted from the admin UI, and the admin cannot reset its password through the UI. Rate limiting and lockout apply as they do to any other account.
- `ENABLE_DEMO_ACCOUNT` is the single source of truth for the demo row. Setting it to `1` seeds the account at the next boot; unsetting it (or setting it to `0`) removes the row at the next boot. That is the only way to disable the demo account on an existing deployment.
- The `bans` and `history` rows of the demo user are wiped on every sign-in, so nothing a previous visitor did persists across sessions.
- Safe to expose on a public demo instance. Never enable it on a private deployment.

## Logging

- Fastify's Pino logger runs at `info` in production and emits only error and per-route lines. The per-request access log line is disabled in production (a PWA cold start pulls ~30 static assets and the log encoding cost dominated the serve cost for the deployment's single-instance profile).
- Password fields (`req.body.password`, `req.body.newPassword`, `req.body.currentPassword`) and the generated initial password are redacted from every log line.
- The login route increments a per-user `failed_attempts` counter (used for lockout) but does not write a historical journal of authentication attempts. After a successful sign-in the counter is reset, so a compromised account leaves no in-app trace of when or from where the attacker connected. This is an explicit trade-off for the small-scale, two-person threat model the app targets. Operators who want an audit trail should front the app with a reverse proxy that records its own access log (every variant under [`deploy/`](../deploy/) does).

## Vulnerability disclosure

See [`public/.well-known/security.txt`](../public/.well-known/security.txt) (RFC 9116). Private reports should go through the GitHub security advisory link referenced in that file.
