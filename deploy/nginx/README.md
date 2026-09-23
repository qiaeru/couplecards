# Couplecards behind nginx (HTTPS)

This variant targets hosts that already run nginx and prefer to manage their Let's Encrypt certificates with `certbot`.

## Prerequisites

- Familiarity with nginx.
- A domain name whose DNS record points to your server.
- `certbot` installed on the host.
- Docker and the Docker Compose plugin installed.

## Steps

1. Edit `deploy/nginx/nginx.conf` and replace `couplecards.example.com` with your real hostname. Adjust the certificate paths if your layout differs from the default.
2. Get the first certificate before starting the stack. nginx cannot start without it, so certbot answers the challenge itself on port 80:

   ```bash
   sudo certbot certonly --standalone -d couplecards.example.com
   ```

3. Copy `.env.example` at the project root to `.env` and fill `SESSION_SECRET`.
4. On Linux, create the data directory and hand it to the container user (UID 999), or the server cannot open its database: `mkdir -p var && sudo chown 999:999 var`.
5. From the project root, launch the stack. `--env-file .env` is required: without it, Compose looks for `.env` next to the Compose file, in `deploy/nginx/`.

   ```bash
   sudo mkdir -p /var/www/certbot
   docker compose --env-file .env -f deploy/nginx/docker-compose.nginx.yml up -d
   ```

## Renewals

Run this from the project root on a schedule. Weekly is a good default. Once the stack runs, nginx holds port 80, so renewals go through the `/var/www/certbot` directory it serves:

```bash
sudo certbot renew --quiet --webroot -w /var/www/certbot \
  --deploy-hook "docker compose --env-file .env -f deploy/nginx/docker-compose.nginx.yml exec nginx nginx -s reload"
```

## Notes

- The nginx container mounts `/etc/letsencrypt` as read-only, so renewed certificates are picked up without a container restart. Only the `nginx -s reload` command is needed after a renewal, and the deploy hook runs it only when a certificate actually changed.
- The `X-Forwarded-*` headers are forwarded to the app, which reads them because `TRUST_PROXY=1` is set.
- To update the stack: `git pull && docker compose --env-file .env -f deploy/nginx/docker-compose.nginx.yml up -d --build`.
