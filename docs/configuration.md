# Configuration reference

Every value below is read from an environment variable by the server at start time.

| Variable | Default | Description |
| --- | --- | --- |
| `SESSION_SECRET` | **required in production** | Base secret used to sign and encrypt the session cookie. Must be 32 characters or longer. Generate one with `openssl rand -base64 48`. Rotating it invalidates every existing session. |
| `PORT` | `3000` | TCP port the server listens on. Keep the default when running behind a reverse proxy. |
| `HOST` | `0.0.0.0` | Listen address. |
| `NODE_ENV` | `development` locally, `production` inside the Docker image | Controls log verbosity and enforcement of the session secret. |
| `COOKIE_SECURE` | `false` outside Docker, `true` in the HTTPS variants | When set to `true`, the session cookie carries the `Secure` flag. This must be `true` whenever the site is served over HTTPS. Keep it `false` only for local development over plain `http://localhost`. |
| `TRUST_PROXY` | `false` outside Docker, `true` in the HTTPS variants | Tells Fastify to read `X-Forwarded-*` headers. Enable it only when the server sits behind a trusted reverse proxy. |
| `SEED_LOCALE` | auto-detected (falls back to `en` when `LANG` is not French) | Language used for the starter deck on first boot. Accepts `en` or `fr`. |
| `ADMIN_RESET` | `0` | When set to `1`, the next boot resets the admin password to `changeme` and forces a password change on next sign-in. Remove the variable and restart once the recovery is complete. |
| `ENABLE_DEMO_ACCOUNT` | `0` | When set to `1`, the first boot seeds a shared account with `demo` as the username and `demo` as the password. Its bans and history are wiped on every sign-in. Enable only on public demo instances because the credential is well known. |
| `DATA_DIR` | `var/` locally, `/app/var` inside Docker | Directory that holds the SQLite file and runtime state. |
| `DB_PATH` | `$DATA_DIR/couplecards.db` | Absolute path to the SQLite file. Override when you need a different filename. |
| `PUBLIC_DIR` | `../public` | Directory served as static content. Do not change unless you relocate the frontend. |
| `DATA_SEED_DIR` | `../data` | Folder that holds `cards.en.json` and `cards.fr.json` for first-boot seeding. |

## Log redaction

Request bodies that contain password fields (`password`, `newPassword` and `currentPassword`) are redacted automatically before being written to the Fastify logger.

## Rate limits (not configurable through environment variables)

The limits are hard-coded to keep deployment simple:

- `/api/auth/login` accepts 5 requests per minute per IP.
- `/api/auth/change-password` accepts 10 requests per hour per IP.
- Every other route shares a global bucket of 300 requests per minute per IP. `/api/health` is excluded from the limit.

Adjust the values in `server/src/routes/auth.js` and `server/src/plugins/ratelimit.js` if the defaults do not match your usage.
