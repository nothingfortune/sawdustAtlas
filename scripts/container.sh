#!/usr/bin/env sh
# Rebuild and (re)start the local preview container at http://localhost:8080,
# stamping the in-app build badge with the host's git info. .dockerignore strips
# .git from the image build, so we read git here and pass it through compose as
# build args (see compose.yaml). BUILD_ENV defaults to "container" via compose.
set -e

BUILD_NUMBER="$(git rev-list --count HEAD)"
BUILD_SHA="$(git rev-parse --short HEAD)"
BUILD_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
export BUILD_NUMBER BUILD_SHA BUILD_BRANCH

echo "[container] building badge: ${BUILD_BRANCH} · build ${BUILD_NUMBER} · ${BUILD_SHA} · ${BUILD_ENV:-container}"
exec docker compose up -d --build "$@"
