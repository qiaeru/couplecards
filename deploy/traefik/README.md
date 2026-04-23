# CoupleCards behind Traefik (HTTPS)

This variant uses Traefik v3 with the Let's Encrypt HTTP-01 challenge and an automatic redirect from HTTP to HTTPS.

## Prerequisites

- A domain name whose DNS record points to your server.
- Ports 80 and 443 open.
- The Docker daemon socket accessible, because Traefik reads its configuration from Docker labels.

## Steps

1. At the project root, copy `.env.example` to `.env` and set `SESSION_SECRET`.
2. Export the domain name and the ACME contact email, then start the stack:

   ```bash
   export COUPLECARDS_DOMAIN=couplecards.example.com
   export LETSENCRYPT_EMAIL=admin@example.com
   docker compose -f deploy/traefik/docker-compose.traefik.yml up -d
   ```

3. On first boot, visit `https://couplecards.example.com`, sign in with `couplecards` and the password `changeme`, then pick a strong new password when prompted.

## Notes

- Traefik listens on ports 80 and 443 and routes traffic by hostname label. The `couplecards` container is not exposed directly.
- To add another service behind the same Traefik instance, apply the matching labels on the new service block.
- `COOKIE_SECURE=true` and `TRUST_PROXY=1` are set, so the session cookie carries the `Secure` flag and Fastify honours `X-Forwarded-*` headers.
