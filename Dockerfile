# Pin the build stage to the builder's native arch: the output (dist/) is static,
# architecture-independent JS/CSS, so we build it once natively instead of
# re-running pnpm install + vite build under slow QEMU emulation for each target
# platform. Only the nginx runtime stage below is built per target arch.
# Pinned to the same major as CI/.nvmrc (Node 24) so the shipped bundle is built
# by the exact toolchain CI tests.
FROM --platform=$BUILDPLATFORM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS build

WORKDIR /app
# node:24-alpine still bundles Corepack, just disabled by default.
RUN corepack enable && corepack prepare pnpm@11.5.3 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Build provenance for the in-app badge: .dockerignore strips .git, so the build
# can't read git here. Default the env label to "production"; CI can pass exact
# commit info with --build-arg BUILD_NUMBER=… BUILD_SHA=… BUILD_BRANCH=…
ARG BUILD_ENV=production
ARG BUILD_NUMBER
ARG BUILD_SHA
ARG BUILD_BRANCH
ENV BUILD_ENV=$BUILD_ENV BUILD_NUMBER=$BUILD_NUMBER BUILD_SHA=$BUILD_SHA BUILD_BRANCH=$BUILD_BRANCH

RUN pnpm build

# Unprivileged variant: runs as UID 101 (nginx), listens on 8080 instead of 80.
FROM nginxinc/nginx-unprivileged:1.31-alpine@sha256:592b23aa79a6e6c08ba4b20f1fff700e1328895705966722608e115d62e52d39

# The base image already switches to USER 101; apk needs root to write the
# package db, so switch back, patch, then drop privileges again below.
USER root
# Pull patched packages even when the base tag lags a CVE fix (own layer for cache hits).
RUN apk upgrade --no-cache

LABEL org.opencontainers.image.source="https://github.com/nothingfortune/sawdustAtlas" \
      org.opencontainers.image.licenses="PolyForm-Noncommercial-1.0.0"

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY LICENSE /usr/share/licenses/sawdust-atlas/LICENSE

USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
