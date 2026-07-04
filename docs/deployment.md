# Deployment

Audience: self-hosters running Couplecards on their own server.

## Prerequisites

- A Linux host with Docker 24 or later and the Docker Compose plugin.
- Optional: a domain name and ports 80 and 443 open for HTTPS.

## Local HTTP

Runs on port 3000 over plain HTTP. Use this mode only for development or on a trusted LAN.

```bash
cp .env.example .env
# Generate a secret:
openssl rand -base64 48
# Paste the result as SESSION_SECRET in .env
docker compose up -d --build
```

Open <http://localhost:3000>.

## HTTPS with a reverse proxy

Three variants live in [`deploy/`](../deploy/). Each one ships its own `docker-compose.*.yml` file and a README with step-by-step instructions:

- [Caddy](../deploy/caddy/README.md) is the recommended option for newcomers to reverse proxies. Caddy handles the ACME challenge on its own.
- [Traefik](../deploy/traefik/README.md) is a good fit when you already host other services behind Traefik labels.
- [nginx](../deploy/nginx/README.md) targets hosts that already run nginx and prefer managing certificates with `certbot`.

In every variant, `COOKIE_SECURE=true` and `TRUST_PROXY=1` are set so the session cookie carries the `Secure` flag and Fastify honors `X-Forwarded-*` headers.

## Environment variables

See [configuration.md](./configuration.md) for the full reference. The only mandatory variable is `SESSION_SECRET`. Every other variable has a sensible default.

## Volumes and backups

The SQLite database lives at `/app/var/couplecards.db` inside the container and is bind-mounted to `./var/couplecards.db` on the host, relative to the Compose file you run.

The container runs as a non-root user with **UID 999, GID 999**. The host directory you bind-mount to `/app/var` must be owned by that UID/GID, otherwise the server cannot open the database file and will crash at startup with `SQLITE_ERROR: unable to open database file`. Create the directory before the first `docker compose up` and `chown` it:

```bash
mkdir -p ./var
sudo chown -R 999:999 ./var
```

Docker creates missing bind-mount directories as root by default, which is why this step is required. Named Docker volumes do not need this step.

### Manual backup

The database runs in WAL mode: the most recent committed writes live in `couplecards.db-wal` next to the main file until SQLite folds them in. A copy of `couplecards.db` alone can therefore miss recent data, or even be unreadable if the copy races a checkpoint. The reliable method is to stop the container first (the server folds the WAL into the main file on graceful shutdown):

```bash
docker compose down
cp ./var/couplecards.db ./backup-$(date +%F).db
docker compose up -d
```

To back up without downtime, copy the database together with its companion files and keep the whole set:

```bash
mkdir -p ./backups
cp ./var/couplecards.db* ./backups/
```

### Restore

Stop the container, replace `./var/couplecards.db` with the backup, and delete any leftover `couplecards.db-wal` and `couplecards.db-shm` files (or restore them alongside if your backup includes them). Then start the container again. Existing sessions remain valid as long as `SESSION_SECRET` has not changed.

## Emergency admin reset

If you lose the admin password:

1. Stop the container.
2. Edit `.env` and set `ADMIN_RESET=1`.
3. Start the container again. It resets the admin password to `changeme` and forces a password change on the next login. A warning line is printed to the logs.
4. Remove `ADMIN_RESET` from `.env` and restart. Leaving it enabled on every boot would reset the password every time.

## Using the prebuilt image from GHCR

The image is published automatically on every version tag by the `release` workflow.

```bash
docker run -d --name couplecards -p 3000:3000 \
  -e SESSION_SECRET="$(openssl rand -base64 48)" \
  -v $PWD/var:/app/var \
  ghcr.io/qiaeru/couplecards:latest
```

Multi-architecture images are pushed for `linux/amd64` and `linux/arm64`.

## Upgrades

```bash
git pull
docker compose up -d --build
```

Database migrations run automatically on boot. To pull the latest image from GHCR without rebuilding:

```bash
docker compose pull
docker compose up -d
```
