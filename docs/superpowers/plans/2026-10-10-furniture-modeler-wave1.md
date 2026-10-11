# Furniture Modeler: Wave 1 Implementation Plan

**Spec:** [2026-10-10-furniture-modeler-design.md](../specs/2026-10-10-furniture-modeler-design.md)
**Date:** 2026-10-10

Furniture wave 1 ships as small PRs stacked on the tip of instruction platform wave 1 (`feature/ip-steps-preview`, which carries the contracts, graph, validator, part marking, board generators, and steps preview). The furniture PRs form one linear stack so that every PR has exactly one parent and the merge order is the stack order. Tracks develop in parallel against the shared contracts and fixtures; an integration pass then linearizes them in the order below before PRs open.

## Pull Requests

| # | Branch | Parent | Track | Scope |
| --- | --- | --- | --- | --- |
| 1 | `docs/furniture-spec` | `docs/instruction-platform-spec` | — | This plan and the spec |
| 2 | `feature/furn-contracts` | `feature/ip-steps-preview` | — | Furniture contracts, schema v3, instruction-contract additions, fixtures |
| 3 | `feature/furn-expressions` | #2 | GEO | `expressions.ts` |
| 4 | `feature/furn-geometry` | #3 | GEO | `geometry.ts`, `resolveFurniture` |
| 5 | `feature/furn-relationships` | #4 | GEO | `relationships.ts` |
| 6 | `feature/furn-joinery` | #5 | JNT-A | `joinery.ts` |
| 7 | `feature/furn-validation` | #6 | JNT-A | `validation.ts`, furniture warnings in the warning center |
| 8 | `feature/furn-templates-tables` | #7 | TPL | Template registry; table, workbench, desk |
| 9 | `feature/furn-templates-casework` | #8 | TPL | Bookcase, base cabinet, wall cabinet |
| 10 | `feature/furn-parts-list` | #9 | JNT-B | `partsList.ts` |
| 11 | `feature/furn-instructions` | #10 | JNT-B | `furnitureInstructions.ts`, two golden plans |
| 12 | `feature/furn-projection` | #11 | VIEW | `projection.ts` |
| 13 | `feature/furn-drawing` | #12 | VIEW | `FurnitureDrawing.tsx` |
| 14 | `feature/furn-viewport-3d` | #13 | VIEW | three.js dependencies, lazy viewport, WebGL fallback |
| 15 | `feature/furn-gallery` | #14 | UI-A | Furniture navigation, gallery, new-from-template dialog |
| 16 | `feature/furn-designer-editing` | #15 | UI-A | Designer shell, parts panel, inspector, parameters, `DimInput` |
| 17 | `feature/furn-designer-views` | #16 | UI-B | View switcher, 3D selection and drag with snapping, arranging actions, thumbnails |
| 18 | `feature/furn-designer-joinery` | #17 | UI-B | Joints, assemblies, and issues panels; warning-center focus |
| 19 | `feature/furn-designer-outputs` | #18 | UI-C | Cut list, build steps, print |
| 20 | `feature/furn-e2e` | #19 | FINAL | Furniture critical-path e2e (chromium and tablet), 3D smoke and fallback |
| 21 | `feature/sw-precache-all-assets` | `test/e2e-offline-prod` | VIEW | Precache every build asset so lazy chunks work offline |

## Dependency Graph

```text
docs/instruction-platform-spec ── #1 docs

feature/ip-steps-preview (wave 1 tip)
└── #2 contracts ── #3 ── #4 ── #5 ── #6 ── #7 ── #8 ── #9 ── #10 ── #11
    ── #12 ── #13 ── #14 ── #15 ── #16 ── #17 ── #18 ── #19 ── #20

test/e2e-offline-prod (wave 1 e2e) ── #21 service worker precache
```

Development order (tracks run in parallel where the arrows allow):

```text
#2 ─┬─ GEO (#3–#5) ── JNT-A (#6–#7) ─┬─ TPL (#8–#9) ── UI-A (#15–#16) ─┐
    │                                └─ JNT-B (#10–#11) ─────────────┤
    └─ VIEW (#12–#14, #21) ──────────────────────────────────────────┴─ integrate ─┬─ UI-B (#17–#18) ─┐
                                                                                   └─ UI-C (#19) ─────┴─ FINAL (#20)
```

## Merge Order

1. Wave 1 merges first, in its own plan's order, through `feature/ip-steps-preview` (#116). Then merge #1 and #2 to #20 in stack order. #21 merges after the offline smoke PR (#119).
2. Use merge commits, not squash, so each child keeps its ancestry and GitHub retargets it cleanly when its parent's branch is deleted.
3. **Known merge-time touch points with wave 1:**
   - `src/domain/workspaceWarnings.ts`: #7 and wave 1's composite warnings (#103) both add to `collectWorkspaceWarnings`. Keep both.
   - `src/App.tsx`: #15 to #18 add furniture navigation; wave 1's #103, #105, #109, and #117 also touch App. Expect small textual conflicts.
   - `src/styles.css`: furniture PRs append blocks; keep every appended block.
   - `package.json` and `pnpm-lock.yaml`: #14 adds three.js, wave 1's #106 adds `@fontsource`. Resolve `package.json` by hand and regenerate the lockfile with `pnpm install`.
   - `tsconfig.test.json`: union the include lists if both sides add entries.

## Implementer Rules

- Node 24 and pnpm 11 (`export PATH=~/.local/node24/bin:$PATH`).
- **Gates before every commit you hand over:** `pnpm typecheck`, `pnpm lint`, and `pnpm test:coverage`. UI PRs also run their e2e specs with a unique `E2E_PORT`; #14 onward also runs `pnpm build`.
- One PR is one concern. Code, tests, and doc updates for it travel together.
- Domain code follows `CLAUDE.md` and the spec's contract rules: millimeters, full precision, no React or DOM in `src/domain`, `import type` for types, a sibling test in `tests/`, no clock or random ids.
- Build against `tests/fixtures/furniture.ts`. Do not edit the contracts (`src/domain/furniture/types.ts`) without saying why in the PR; additive changes only.
- **No attribution lines** in commits or PR descriptions: no `Co-Authored-By`, no generated-with notes.
- PR descriptions state the spec section, what the PR adds, test evidence, and the PR it is stacked on.
- Repository Markdown is one line per paragraph.

## Exit Criteria for Furniture Wave 1

- Every PR above is open with green local gates; the full stack passes typecheck, lint, coverage, build, and the whole e2e suite in both projects.
- Both golden plans validate with zero errors and match their snapshots; every template validates clean across its parameter grid.
- A table and a bookcase can be created from templates, resized, edited, jointed, and printed with a reconciled cut list and build steps, with no spreadsheet.
- **Owed by Alex:** a hand-check of the table and bookcase golden plans and cut lists against a real build.
