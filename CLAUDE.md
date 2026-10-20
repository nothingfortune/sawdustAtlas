# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SawdustAtlas is a local-first, offline-capable PWA for woodworking design. Three tools: a scaled
**workshop floor planner**, an **edge/end-grain cutting board designer** (with multi-panel
**composite** boards), and a parametric **furniture modeler**. Boards, composites, and furniture all
emit one shared **instruction plan** (ordered build steps). React 19 + TypeScript + Vite SPA; all data lives in the browser's
localStorage. No backend.

## Commands

Requires Node >= 24 (`.nvmrc`) and pnpm 11.5.3 (via Corepack: `corepack enable`). On Node >= 25,
Corepack is no longer bundled — run `npm install -g corepack` first. The repo standard is Node 24
(`.nvmrc`), where `corepack enable` just works with no extra step.

```bash
pnpm install
pnpm dev                 # Vite dev server on :5173
pnpm dev:lan             # dev server bound to 0.0.0.0 for tablet/LAN access
pnpm build               # tsc -b (typecheck all 3 projects) THEN vite build
pnpm typecheck           # tsc -b only
pnpm lint                # eslint .
pnpm test                # vitest run (unit tests in tests/)
pnpm test:coverage       # vitest run --coverage (CI gate; thresholds below)
pnpm exec playwright install --with-deps chromium  # one-time prerequisite for test:e2e
pnpm test:e2e            # playwright smoke tests in e2e/ (boots its own dev server)
pnpm test:e2e:prod       # offline/service-worker smoke in e2e/prod/ (builds, then serves via vite preview)
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

CI (`.github/workflows/ci.yml`) has four jobs. `Validate` runs typecheck → lint → `test:coverage` →
build. `E2E` runs the Playwright suite (desktop `chromium` project plus a touch-capable `tablet`
project) against a dev server it boots itself, then the production-build offline smoke
(`test:e2e:prod`). Coverage is gated only on the pure logic layer
(`src/domain/**`, `storage.ts`, `src/packages/**`, `data.ts`, `id.ts`) at lines 90 / functions 85 / branches 75 /
statements 88 — keep these green when touching domain code. `Docker verify` (PRs and pushes to
`develop`) needs `Validate` and `E2E`, builds the image, smoke-tests it, and runs a gating Trivy
scan (fails the build on fixable CRITICAL/HIGH vulnerabilities, uploads SARIF to code scanning).
`Docker publish` (pushes to `main` only) does the same build/smoke-test/Trivy gate for an amd64
image before pushing the multi-arch image to Docker Hub.

## Architecture

**Strict separation of domain from UI.** This is the central design principle.

- `src/domain/**` — pure, framework-free calculation engine. No React, no DOM. This is where all
  geometry, material estimates, cut plans, and assembly logic live, and it is the only thoroughly
  unit-tested layer. Each domain module has a sibling in `tests/`.
- `src/components/**` — React UI. Components consume domain functions and render; they should not
  re-implement geometry or measurement math.
- `src/types.ts` — the entire data model (`AtlasData` is the root: `shops`, `boards`, `woods`,
  `composites`, `furniture`, shop-wide `allowances`). Furniture project types live in
  `src/domain/furniture/types.ts`.

**State and persistence flow.** `App.tsx` holds one `AtlasData` object in state and is the single
source of truth. All mutations go through `commitData(updater)`, which records the previous state
onto a pure undo/redo stack (`src/history.ts`) before applying the change. An effect autosaves the
whole object to localStorage on every change and surfaces whether the write succeeded (storage can
be full or blocked in privacy modes). `src/storage.ts` owns load/save/import/export.

**`normalizeData` is the one validation + migration funnel.** Every path that brings data in —
initial load, JSON import, and even export — runs through `normalizeData` in `storage.ts`. It
coerces untrusted/legacy shapes into valid current-schema objects and performs migrations (e.g.
`drumSanding` allowance → `routerTable`; legacy composite `{rows, cols, cells}` grid → `rows[]`;
legacy inline-strip composite panels → real `BoardProject`s appended to the boards list). Schema
migrations are named, ordered steps in `src/domain/migrations.ts` (`LATEST_SCHEMA_VERSION`, re-exported
as `CURRENT_SCHEMA_VERSION`); `normalizeData` runs them first, then coerces to the typed model. When you
add or rename a field, update `normalizeData` and, if the shape changes, add a new migration step
(never edit old ones).

`src/packages/` exports and imports a single board, composite, or furniture project as a package file, through a `PACKAGE_KINDS` registry (one module per design type). Reads run `migrate` and the per-domain normalizers, and merges go through `commitData` so Undo removes an import.

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
- `pricing.ts` — material cost, complexity classification, price-breakdown math (markup applies
  to material only; the per-construction price floor applies last).
- `geometry2d.ts` — pure 2D primitives for the standalone geometry calculator (math coordinates,
  y up; the UI flips y for SVG).
- `compoundAngle.ts` — `solveCompoundAngle`: two perpendicular-view tilts → resultant tilt plus
  miter/bevel saw settings.
- `boardStock.ts`, `boardAngle.ts`, `boardBench.ts` — rip and stock list, angle and setup numbers, and the
  bench-setup card, all reusing the board-generation math.
- `shopGeometry.ts`, `shopObjects.ts` — workshop layout geometry and item normalization.
- `migrations.ts` — named schema migration registry (see above).
- `workspaceWarnings.ts` — the app-wide warning center's collector; every domain's issues (shop, board,
  composite, furniture) funnel through it, each carrying a location that links to the fixing input.
- `benchCapabilities.ts` — what the browser offers at the bench (HTTPS, service worker, wake lock) and a
  plain-language description of what is missing.
- `instructions/` — the shared `InstructionPlan` contract (`types.ts`), validation, dependency graph,
  revision hash, readiness, lifecycle, default tolerances, and one generator per domain
  (`boardInstructions.ts`, `compositeInstructions.ts`, `furnitureInstructions.ts`). Generators label any
  value not derived from the design as an assumption. Golden plans live in `tests/__golden__/`.
- `buildRuns/` — pure build-run state over a frozen plan: progress, resume, and recorded actuals with
  verify-first flags. Not yet wired to a UI (the tablet step runner is instruction platform wave 2).
- `lengthUnits.ts` — metric/imperial conversion (the UI "Preston's Button" toggles display units;
  storage stays metric).
- `furniture/` — furniture modeler domain: `types.ts` (contracts), `project.ts` (defaults and the
  normalizer storage runs), `expressions.ts` (parameters), `geometry.ts`, `relationships.ts`, `joinery.ts`,
  `validation.ts`, `partsList.ts`, `projection.ts` (drawings), and `templates/` (six starting points). World axes are x left→right, y front→back, z up; a part's position is
  its min corner. Relationships move parts and never resize them; joinery adds reported cut
  allowances and never rewrites the modeled size. See the furniture spec in `docs/superpowers/specs`.

## Testing layers

- **Unit (`tests/`, Vitest):** the domain layer plus `storage`, `history`, and a couple of pure
  hooks (`usePinchPan`, `sliceDrag`). Vitest config lives in `vite.config.ts` and **excludes
  `e2e/`**.
- **E2E (`e2e/`, Playwright):** smoke tests for interaction bugs unit tests can't reach (pointer
  drag vs tap, SVG layout). Drives a real Chromium against a dev server it starts itself. A second
  `tablet` project (`playwright.config.ts`) re-runs the touch/pointer-sensitive specs in a
  touch-capable, iPad-landscape-shaped context — both projects force `browserName: 'chromium'`
  since CI only installs that browser. `e2e/prod/` (`playwright.prod.config.ts`) builds, serves via
  `vite preview`, and checks the service worker keeps the app working offline.

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
