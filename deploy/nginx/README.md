# Couplecards behind nginx (HTTPS)

This variant targets hosts that already run nginx and prefer to manage their Let's Encrypt certificates with `certbot`.

## Prerequisites

- Familiarity with nginx.
- A domain name whose DNS record points to your server.
- An existing or new Let's Encrypt certificate in `/etc/letsencrypt/live/<your-domain>/`.
- Docker and the Docker Compose plugin installed.

## Steps

1. Edit `deploy/nginx/nginx.conf` and replace `couplecards.example.com` with your real hostname. Adjust the certificate paths if your layout differs from the default.
2. Generate the certificate once, outside of Docker, for example:

   ```bash
   certbot certonly --webroot -w /var/www/certbot -d couplecards.example.com
   ```

3. Copy `.env.example` at the project root to `.env` and fill `SESSION_SECRET`.
4. Launch the stack:

   ```bash
   docker compose -f deploy/nginx/docker-compose.nginx.yml up -d
   ```

## Renewals

Run `certbot renew --quiet && docker compose -f deploy/nginx/docker-compose.nginx.yml exec nginx nginx -s reload` on a schedule. Weekly is a good default.

## Notes

- The nginx container mounts `/etc/letsencrypt` as read-only, so renewed certificates are picked up without a container restart. Only the `nginx -s reload` command is needed after a renewal.
- The `X-Forwarded-*` headers are forwarded to the app, which reads them because `TRUST_PROXY=1` is set.
