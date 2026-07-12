# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SawdustAtlas is a local-first, offline-capable PWA for woodworking design. Two tools: a scaled
**workshop floor planner** and an **edge/end-grain cutting board designer** (with multi-panel
**composite** boards). React 19 + TypeScript + Vite SPA; all data lives in the browser's
localStorage. No backend.

## Commands

Requires Node >= 24 (`.nvmrc`) and pnpm 11.5.3 (via Corepack: `corepack enable`).

```bash
pnpm install
pnpm dev                 # Vite dev server on :5173
pnpm dev:lan             # dev server bound to 0.0.0.0 for tablet/LAN access
pnpm build               # tsc -b (typecheck all 3 projects) THEN vite build
pnpm typecheck           # tsc -b only
pnpm lint                # eslint .
pnpm test                # vitest run (unit tests in tests/)
pnpm test:coverage       # vitest run --coverage (CI gate; thresholds below)
pnpm test:e2e            # playwright smoke tests in e2e/ (boots its own dev server)
```

Run a single unit test file or filter by name:

```bash
pnpm test tests/boardGeometry.test.ts
pnpm test -- -t "volume conservation"
```

Run the app in a local container (serves on http://localhost:8080):

```bash
docker compose up -d --build
```

CI (`.github/workflows/ci.yml`) runs typecheck → lint → `test:coverage` → build on every PR/push
to `develop` and `main`. Coverage is gated only on the pure logic layer
(`src/domain/**`, `storage.ts`, `data.ts`, `id.ts`) at lines 90 / functions 85 / branches 75 /
statements 88 — keep these green when touching domain code. `develop` also builds/scans a Docker
image; `main` publishes to Docker Hub.

## Architecture

**Strict separation of domain from UI.** This is the central design principle.

- `src/domain/**` — pure, framework-free calculation engine. No React, no DOM. This is where all
  geometry, material estimates, cut plans, and assembly logic live, and it is the only thoroughly
  unit-tested layer. Each domain module has a sibling in `tests/`.
- `src/components/**` — React UI. Components consume domain functions and render; they should not
  re-implement geometry or measurement math.
- `src/types.ts` — the entire data model (`AtlasData` is the root: `shops`, `boards`, `woods`,
  `composites`, shop-wide `allowances`).

**State and persistence flow.** `App.tsx` holds one `AtlasData` object in state and is the single
source of truth. All mutations go through `commitData(updater)`, which records the previous state
onto a pure undo/redo stack (`src/history.ts`) before applying the change. An effect autosaves the
whole object to localStorage on every change and surfaces whether the write succeeded (storage can
be full or blocked in privacy modes). `src/storage.ts` owns load/save/import/export.

**`normalizeData` is the one validation + migration funnel.** Every path that brings data in —
initial load, JSON import, and even export — runs through `normalizeData` in `storage.ts`. It
coerces untrusted/legacy shapes into valid current-schema objects and performs migrations (e.g.
`drumSanding` allowance → `routerTable`; legacy composite `{rows, cols, cells}` grid → `rows[]`;
legacy inline-strip composite panels → real `BoardProject`s appended to the boards list). When you
add or rename a field, update `normalizeData` and bump `CURRENT_SCHEMA_VERSION` if the shape changes.

### Domain conventions (important, easy to get wrong)

- **Millimeters everywhere, full float precision.** Geometry is stored and computed in mm at full
  JS float precision; rounding happens only at display. Don't round in the domain layer.
- **Volume conservation.** End-grain calculations conserve material across rip-angle wedges, end
  trim, blade kerf, crosscut offcut, and final squaring. Tests assert this — preserve it.
- **Two number coercers, chosen deliberately** (`storage.ts`): `finiteNumber` clamps to
  non-negative (true dimensions); `signedFinite` keeps the sign (trailing angles, row offsets —
  negative values are load-bearing for chevron/herringbone/mirrored bevels). Use the right one.
- **Milling allowances are shop-wide**, not per-board. `updateAllowances` writes the global setup
  through to every board's `allowances` so the domain (which reads `board.allowances`) stays
  consistent. See `src/domain/boardAllowances.ts`.
- **End-grain donor thickness is `endGrain.sliceThickness`, not `project.thickness`** — the latter
  is stale/hidden in the end-grain editor. `boardThickness()` in `compositeBoard.ts` encodes this;
  use it rather than reading `.thickness` directly when working with composites.
- **A composite is one construction throughout** (`'edge'` or `'end'`), never mixed. A panel board
  created inline inherits the composite's grain.
- Invalid self-crossing strip geometry is reported as errors (see `EndGrainTemplate.errors`), not
  silently coerced into a wrong result.

### Domain module map

- `units.ts` — shared numeric helpers (board-foot conversion, `clampAngle` ±89°, `sum`). Keep
  rounding/clamping rules here so other modules can't drift.
- `boardGeometry.ts` — end-grain template polygons + `calculateEndGrainMetrics` (the core engine).
- `boardSlices.ts` — per-slice transform state (rotate/flip/offset/order) as pure data.
- `boardPatterns.ts`, `boardCutPlan.ts`, `boardScale.ts`, `boardAllowances.ts` — patterns, rough
  stock / cut list, scaling, build-allowance math.
- `compositeBoard.ts`, `compositeAssembly.ts`, `brickAssembly.ts` — multi-panel composite pieces,
  immutable row/wafer operations, brick-and-mortar model.
- `shopGeometry.ts`, `shopObjects.ts` — workshop layout geometry and item normalization.
- `lengthUnits.ts` — metric/imperial conversion (the UI "Preston's Button" toggles display units;
  storage stays metric).

## Testing layers

- **Unit (`tests/`, Vitest):** the domain layer plus `storage`, `history`, and a couple of pure
  hooks (`usePinchPan`, `sliceDrag`). Vitest config lives in `vite.config.ts` and **excludes
  `e2e/`**.
- **E2E (`e2e/`, Playwright):** smoke tests for interaction bugs unit tests can't reach (pointer
  drag vs tap, SVG layout). Drives a real Chromium against a dev server it starts itself.

## TypeScript setup

Very strict. All three TS projects extend `tsconfig.base.json`, which enables strict mode plus
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`,
`noFallthroughCasesInSwitch`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, unused
checks, and `verbatimModuleSyntax` (use `import type` for type-only imports). Project references:
`tsconfig.app.json` (src), `tsconfig.node.json` (vite.config.ts), `tsconfig.test.json` (tests +
the domain it covers). `pnpm build` typechecks all of them.

## Conventions

- PRs target `develop`, never `main` (`main` is the release branch that publishes to Docker Hub).
- `vite.config.ts` stamps git provenance (branch/sha/build number) into `__BUILD_INFO__` at build
  time; the Docker image strips `.git` and falls back to `BUILD_*` env vars.
- Service worker (`public/sw.js`) registers in production builds only — never during `pnpm dev`,
  where it would mask whether the dev server is alive.
