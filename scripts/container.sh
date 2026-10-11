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

# Under WSL without Docker's WSL integration, "docker" is a stub that only prints advice,
# and Docker Desktop is reachable as docker.exe: a Windows process that sees WSL
# variables only when WSLENV lists them (without this the badge reads "unknown ·
# build 0"). Probe for a CLI that actually reaches a daemon.
if docker version >/dev/null 2>&1; then
  DOCKER=docker
elif docker.exe version >/dev/null 2>&1; then
  DOCKER=docker.exe
  WSLENV="${WSLENV:+$WSLENV:}BUILD_NUMBER:BUILD_SHA:BUILD_BRANCH:BUILD_ENV"
  export WSLENV
else
  echo "[container] no working docker CLI (tried docker and docker.exe); is Docker running?" >&2
  exit 1
fi

# compose.yaml pins the project name, so every checkout and worktree manages the same
# container. One left over from before that (named after its checkout directory) holds
# the container name and would block the start, so replace it.
owner="$($DOCKER inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' sawdust-atlas 2>/dev/null | tr -d '\r' || true)"
if [ -n "$owner" ] && [ "$owner" != "sawdust-atlas" ]; then
  echo "[container] replacing the preview container left by compose project '${owner}'"
  $DOCKER rm -f sawdust-atlas >/dev/null
fi

echo "[container] building badge: ${BUILD_BRANCH} · build ${BUILD_NUMBER} · ${BUILD_SHA} · ${BUILD_ENV:-container}"
exec $DOCKER compose up -d --build "$@"
