# SPDX-License-Identifier: MIT
# Multi-stage build. No native-addon compilation: the backend runs on
# node:sqlite (built-in) and hash-wasm (pure WebAssembly), so the runtime
# image needs nothing beyond Node itself.

ARG VERSION=0.0.0
ARG REVISION=unknown

# ---- Stage 1: Backend deps (pure JS only) ----
FROM node:25-alpine AS backend-deps
WORKDIR /build
COPY server/package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# ---- Stage 2: Browser vendor bundle (zxcvbn-ts) ----
FROM node:25-alpine AS vendor
WORKDIR /build
COPY package.json ./
COPY scripts ./scripts
RUN npm install --no-audit --no-fund
COPY public ./public
RUN node scripts/build-vendor.mjs

# ---- Stage 3: Runtime ----
FROM node:25-alpine
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

RUN apk add --no-cache tini wget \
  && addgroup -S app && adduser -S app -G app
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
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/src/index.js"]
