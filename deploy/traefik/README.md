# Couplecards behind Traefik (HTTPS)

This variant uses Traefik v3 with the Let's Encrypt HTTP-01 challenge and an automatic redirect from HTTP to HTTPS.

## Prerequisites

- A domain name whose DNS record points to your server.
- Ports 80 and 443 open.
- The Docker daemon socket accessible, because Traefik reads its configuration from Docker labels.

## Steps

1. At the project root, copy `.env.example` to `.env` and set `SESSION_SECRET`.
2. On Linux, create the data directory and hand it to the container user (UID 999), or the server cannot open its database: `mkdir -p var && sudo chown 999:999 var`.
3. From the project root, export the domain name and the ACME contact email, then start the stack. `--env-file .env` is required: without it, Compose looks for `.env` next to the Compose file, in `deploy/traefik/`.

   ```bash
   export COUPLECARDS_DOMAIN=couplecards.example.com
   export LETSENCRYPT_EMAIL=admin@example.com
   docker compose --env-file .env -f deploy/traefik/docker-compose.traefik.yml up -d
   ```

4. On first boot, visit `https://couplecards.example.com`, sign in with `couplecards` and the password `changeme`, then pick a strong new password when prompted.

## Notes

- Traefik listens on ports 80 and 443 and routes traffic by hostname label. The `couplecards` container is not exposed directly.
- To add another service behind the same Traefik instance, apply the matching labels on the new service block.
- To update the stack: `git pull && docker compose --env-file .env -f deploy/traefik/docker-compose.traefik.yml up -d --build`.
- `COOKIE_SECURE=true` and `TRUST_PROXY=1` are set, so the session cookie carries the `Secure` flag and Fastify honors `X-Forwarded-*` headers.
