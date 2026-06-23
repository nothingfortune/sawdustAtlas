# Build from source

The [Docker Hub image](install.md) is the easiest path for everyday use. This guide is for developers who want to build SawdustAtlas from the files in this repository.

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

This builds the image from your local source and serves it at **http://localhost:8080** (the `compose.yaml` maps `8080:80` for you). Use this instead of the published image when you want to run your own changes.

## LAN and tablet access during development

See [Use SawdustAtlas on a tablet](use-on-a-tablet.md#for-developers--direct-development-server) for `pnpm dev:lan` and `pnpm serve:lan`.

## Type safety

Every TypeScript target extends `tsconfig.base.json`. The shared policy enables strict mode plus unchecked-index, exact-optional-property, implicit-return, fallthrough, override, unused-code, and index-signature checks. `pnpm build` type-checks both the application and the Vite configuration before producing assets.
