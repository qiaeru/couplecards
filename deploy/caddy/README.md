# Couplecards behind Caddy (HTTPS)

This is the simplest way to expose Couplecards over HTTPS. Caddy negotiates a Let's Encrypt certificate automatically on first start, with no extra tooling.

## Prerequisites

- A domain name whose DNS record points to your server's public IP.
- Ports 80 and 443 open in your firewall.
- Docker and the Docker Compose plugin installed.

## Steps

1. Copy `.env.example` at the project root to `.env`, then set `SESSION_SECRET`. Generate one with `openssl rand -base64 48`.
2. On Linux, create the data directory and hand it to the container user (UID 999), or the server cannot open its database: `mkdir -p var && sudo chown 999:999 var`.
3. From the project root, export your domain name and start the stack. `--env-file .env` is required: without it, Compose looks for `.env` next to the Compose file, in `deploy/caddy/`.

   ```bash
   export CADDY_DOMAIN=couplecards.example.com
   docker compose --env-file .env -f deploy/caddy/docker-compose.caddy.yml up -d
   ```

4. On first boot, open `https://couplecards.example.com` and sign in with `couplecards` and the password `changeme`. You are forced to pick a strong new password before reaching the admin panel.

## Notes

- `COOKIE_SECURE=true` and `TRUST_PROXY=1` are set automatically, so the session cookie carries the `Secure` flag and Fastify honors `X-Forwarded-*` headers.
- Caddy stores its generated certificate in the `caddy_data` Docker volume. Do not delete the volume, because the next start would then trigger a new ACME challenge.
- To update the stack: `git pull && docker compose --env-file .env -f deploy/caddy/docker-compose.caddy.yml up -d --build`.
