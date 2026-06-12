# SPDX-License-Identifier: MIT
# Multi-stage build on Debian slim (glibc). sodium-native (pulled in by
# @fastify/secure-session) ships reliable glibc prebuilds; musl prebuilds
# on Alpine are flaky, so we stay on glibc.

ARG VERSION=0.0.0
ARG REVISION=unknown

# ---- Stage 1: Backend deps ----
FROM node:24-slim AS backend-deps
WORKDIR /build
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---- Stage 2: Browser vendor bundle (zxcvbn-ts) ----
FROM node:24-slim AS vendor
WORKDIR /build
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci --no-audit --no-fund
COPY public ./public
RUN node scripts/build-vendor.mjs

# ---- Stage 3: Runtime ----
FROM node:24-slim
ARG VERSION
ARG REVISION
LABEL org.opencontainers.image.title="couplecards" \
      org.opencontainers.image.description="A self-hosted web app that lets couples draw activity cards to break the routine and spice up their daily lives." \
      org.opencontainers.image.source="https://github.com/qiaeru/couplecards" \
      org.opencontainers.image.url="https://github.com/qiaeru/couplecards" \
      org.opencontainers.image.documentation="https://github.com/qiaeru/couplecards#readme" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="$VERSION" \
      org.opencontainers.image.revision="$REVISION"

RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 999 app \
  && useradd --system --uid 999 --gid 999 --home-dir /app --shell /usr/sbin/nologin app
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/var \
    PUBLIC_DIR=/app/public \
    DATA_SEED_DIR=/app/data

COPY --from=backend-deps /build/node_modules ./server/node_modules
COPY server ./server
COPY --from=vendor /build/public ./public
COPY data ./data

RUN mkdir -p /app/var && chown -R app:app /app
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server/src/index.js"]
