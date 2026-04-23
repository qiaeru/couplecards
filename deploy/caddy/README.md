# CoupleCards behind Caddy (HTTPS)

This is the simplest way to expose CoupleCards over HTTPS. Caddy negotiates a Let's Encrypt certificate automatically on first start, with no extra tooling.

## Prerequisites

- A domain name whose DNS record points to your server's public IP.
- Ports 80 and 443 open in your firewall.
- Docker and the Docker Compose plugin installed.

## Steps

1. Copy `.env.example` at the project root to `.env`, then set `SESSION_SECRET`. Generate one with `openssl rand -base64 48`.
2. Export your domain name and start the stack:

   ```bash
   export CADDY_DOMAIN=couplecards.example.com
   docker compose -f deploy/caddy/docker-compose.caddy.yml up -d
   ```

3. On first boot, open `https://couplecards.example.com` and sign in with `couplecards` and the password `changeme`. You are forced to pick a strong new password before reaching the admin panel.

## Notes

- `COOKIE_SECURE=true` and `TRUST_PROXY=1` are set automatically, so the session cookie carries the `Secure` flag and Fastify honours `X-Forwarded-*` headers.
- Caddy stores its generated certificate in the `caddy_data` Docker volume. Do not delete the volume, because the next start would then trigger a new ACME challenge.
- To update the stack: `docker compose -f deploy/caddy/docker-compose.caddy.yml pull && docker compose -f deploy/caddy/docker-compose.caddy.yml up -d`.
