# Build from source

The [Docker Hub image](install.md) is the easiest path for everyday use. This guide is for developers who want to build SawdustAtlas from the files in this repository.

## Prerequisites

- **Node 24**, matching `.nvmrc` — use `nvm use` (or your Node version manager of choice) from the repository root.
- **Corepack**, to get the pinned pnpm: run `corepack enable`. On Node 24 this just works. On Node >= 25, Corepack is no longer bundled — run `npm install -g corepack` first, then `corepack enable`.
- **pnpm 11.5.3**, activated automatically by Corepack from the `packageManager` field in `package.json` — no separate pnpm install needed.

## Run the dev server

```bash
pnpm install
pnpm dev
```

Create a production build with `pnpm build`, which type-checks both the application and the Vite configuration before producing assets.

## Build and run the container locally

From the repository root:

```bash
docker compose up -d --build
```

This builds the image from your local source and serves it at **http://localhost:8080** (the `compose.yaml` maps `8080:8080` for you). Use this instead of the published image when you want to run your own changes.

## LAN and tablet access during development

See [Use SawdustAtlas on a tablet](use-on-a-tablet.md#for-developers--direct-development-server) for `pnpm dev:lan` and `pnpm serve:lan`.

## Type safety

Every TypeScript target extends `tsconfig.base.json`. The shared policy enables strict mode plus unchecked-index, exact-optional-property, implicit-return, fallthrough, override, unused-code, and index-signature checks. `pnpm build` type-checks both the application and the Vite configuration before producing assets.

## Testing

```bash
pnpm typecheck   # tsc -b only, no build output
pnpm lint        # eslint .
pnpm test        # vitest run — unit tests in tests/
```

End-to-end tests use Playwright and boot their own dev server. The first time, install the browser it drives:

```bash
pnpm exec playwright install --with-deps chromium
```

Then run the suite:

```bash
pnpm test:e2e
```

This runs both a desktop `chromium` project and a touch-capable `tablet` project (see `playwright.config.ts`).
