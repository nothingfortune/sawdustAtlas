# Pin the build stage to the builder's native arch: the output (dist/) is static,
# architecture-independent JS/CSS, so we build it once natively instead of
# re-running pnpm install + vite build under slow QEMU emulation for each target
# platform. Only the nginx runtime stage below is built per target arch.
FROM --platform=$BUILDPLATFORM node:26-alpine AS build

WORKDIR /app
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

FROM nginx:1.31-alpine

LABEL org.opencontainers.image.source="https://github.com/nothingfortune/sawdustAtlas" \
      org.opencontainers.image.licenses="PolyForm-Noncommercial-1.0.0"

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY LICENSE /usr/share/licenses/sawdust-atlas/LICENSE

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
