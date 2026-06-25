# SawdustAtlas Remediation Tracker

This is the living remediation log for the June 24, 2026 review cycle. It replaces the old point-in-time snapshot `REVIEW-2026-06-24-develop.md` and folds that review together with a fresh full-repo audit and a hand-verification pass.

Keep the status markers current. If this file drifts away from the code, it stops being useful.

## Snapshot

- Opened: 2026-06-24
- Baseline at open: `main` @ `b82d63d`
- Baseline verification: `pnpm lint` clean, `pnpm test` 67/67 green, `pnpm build` OK
- Working branch: `review/full-e2e-audit`
- Review method: five read-only passes across UI/React, domain/math, tests, CI/CD/infra, and docs/hygiene; every Critical item was re-confirmed directly in source

## Status Key

- `☐` Open and not started
- `◐` In progress or partially complete
- `☑` Done and verified
- `⊘` Closed, deferred, or intentionally not fixed

## How To Use This File

1. Start with the lowest-numbered open item in the highest-priority section.
2. For behavior changes, write the failing test first.
3. After the fix lands, update the item with a short verification note or commit SHA.
4. Keep `pnpm lint && pnpm test && pnpm build` green before each commit.

## Executive Summary

### What is already done

- All P0 correctness issues `C1` through `C5`
- Performance items `P1` and `P2`
- CI and infra items `CI1` through `CI4`, plus the `CI6` keep-as-advisory decision
- Security items `SEC1`, `SEC2`, and `SEC5`
- Tooling items `TOOL1` through `TOOL3`
- Hygiene items `HYG1` through `HYG8`, `HYG11`, and `HYG13`
- Accessibility items `A1`, `A3`, and `A6`
- Documentation items `DOC1` through `DOC5`
- Test item `TEST6`
- High-priority UX/correctness items `H1`, `H2`, `H3`, `H4`, `H6`, `H7`, and `H8`

### What is partially done

- `A2`: Escape handling, focus-on-open, focus-restore, and backdrop-close are done; full Tab focus-trap still remains
- `TEST3`: persistence and `C1` coverage are in place; `downloadData`, `validColor`, and bad-JSON cases still remain
- `TEST4`: 3 of the remaining domain export cases are covered

### What is intentionally deferred or closed

- Design-owner decisions: `A7`
- Infra with ripple effects: `SEC3`, `SEC4`, `P4`
- Lower-value cleanup: `P3`, `A4`, `A5`, `HYG9`, `HYG10`, `HYG12`
- Verify during a real publish: `CI5`
- Misdiagnosis closed: `H5`

### Suggested next pass

1. `A2` full Tab focus-trap in the modals
2. Remaining test gaps (`TEST3`, `TEST4`, `TEST7`)
3. Lower-value cleanup (`P3`, `HYG9`, `HYG10`)

## P0 Critical Correctness

### C1 `☑`

- Problem: Negative `trailingAngle` was being floored to `0` on load/export, flattening chevron and herringbone designs.
- Location: `src/storage.ts`
- Resolution: Added sign-preserving `signedFinite()` for angles and offsets while keeping flooring for dimensions.
- Verification: Regression tests cover both signed fields.
- Commit: `9c798de`

### C2 `☑`

- Problem: A spurious "conservation failed" error was being added to strips that already reported `closes or crosses`.
- Location: `src/domain/boardGeometry.ts`
- Resolution: Conservation is now asserted only when the design is otherwise valid.
- Verification: Added a 120-case angled fuzz pass, also tracked as `TEST6`.
- Commit: `6b3df17`

### C3 `☑`

- Problem: Cut plan logic read `project.allowances.*` directly, which could crash or produce `NaN` for partial allowances.
- Location: `src/domain/boardCutPlan.ts`
- Resolution: Threaded `resolveAllowances` through all five reads.
- Verification: Added a test with a board that has no allowances.
- Commit: `2a4f1a9`

### C4 `☑`

- Problem: `saveData` could throw while the UI still claimed "Saved".
- Location: `src/storage.ts`, `src/App.tsx`
- Resolution: `saveData` now returns a success boolean, and the app shows "Not saved - export a backup" when persistence fails.
- Verification: Tests cover both normal round-trip behavior and quota-error behavior using an in-memory `localStorage` stub.
- Commit: `8bc115f`

### C5 `☑`

- Problem: `applySliceOrder` did not dedupe or backfill malformed orders, so parallel arrays could desync.
- Location: `src/domain/boardSlices.ts`
- Resolution: Reused `normalizeOrder` so the result is always a permutation of `0..count-1`.
- Commit: `ed2cb7a`

## P1 High Priority

### H1 `☑`

- Problem: Destructive arrangement buttons fire immediately.
- Location: `src/components/BoardDesigner.tsx`
- Resolution: Resolved by composition rather than by adding confirms. The pattern recipes (the genuinely rebuilding actions) already route through the before/after `PatternPreviewDialog`; the arrangement buttons (Alternate, Gradient, Randomize, Mirror, Repeat, Reverse) only reorder or append strips and never discard them, and `H4` removed the id churn. With `H2` multi-level undo plus Ctrl/Cmd+Z every action is reversible, so redundant confirms on non-destructive reorders were intentionally not added.

### H2 `☑`

- Problem: Undo is single-level, has no redo, and lives far from the editing actions.
- Location: `src/history.ts`, `src/App.tsx`
- Resolution: Bounded, redo-capable history in a pure, unit-tested `src/history.ts`. App snapshots `{data, activeShop, activeBoard}` so undo restores the selection too. Adds a Redo button and Ctrl/Cmd+Z (Shift to redo), ignored while typing in inputs.
- Commit: `7b52794`

### H3 `☑`

- Problem: Import replaces the workspace and only relies on volatile undo.
- Location: `src/storage.ts`, `src/App.tsx`
- Resolution: The pre-import workspace is written to a separate localStorage key before the replace, so it survives a reload. An "Undo import" action restores it, and the restore is itself undoable.
- Verification: Round-trip and quota-error tests.
- Commit: `60e8af8`

### H4 `☑`

- Problem: Randomization remounted strips by changing ids unnecessarily.
- Location: `src/components/BoardDesigner.tsx`
- Resolution: `randomizeArrangement` now reorders strips in place and preserves ids.
- Notes: `duplicate` and `mirror` were already only minting ids for new appended copies.
- Commit: `d8dc359`

### H5 `⊘`

- Problem statement did not hold up.
- Location: `src/components/*`
- Decision: Closed as a misdiagnosis.
- Notes: Every `Field` uses `Number(event.target.value)`, and `Number('') === 0`, not `NaN`. A cleared input becomes `0`, which is still valid state.

### H6 `☑`

- Problem: `ShopPlanner` could keep a stale selection after the active project changed.
- Location: `src/components/ShopPlanner.tsx`
- Resolution: Selection is now cleared when the active project id changes.
- Commit: `d8dc359`

### H7 `☑`

- Problem: Possible double-counted angle shift in rough-stock volume.
- Location: `src/domain/boardAllowances.ts`, `src/domain/boardCutPlan.ts`
- Resolution: Investigated - not a double count. Both sites compute the same rough-stock width (strip width + rip + angle shift), once each, for two outputs that reconcile. Added a reconciliation test proving the BOM board-feet sum equals `roughBoardFeet` for angled strips, then extracted `roughStripStockWidth()` so the two sites cannot drift.
- Commit: `cb3cbb2`

### H8 `☑`

- Problem: Drag behavior could use stale zoom and missed `pointercancel` cleanup.
- Location: `src/components/ShopPlanner.tsx`
- Resolution: Drag logic now reads live zoom from an effect-synced ref and tears down on `pointercancel`.
- Notes: Full element-scoped pointer capture is still a larger refactor.
- Commit: `d8dc359`

## P1 Performance

### P1 `☑`

- Problem: The full derived domain pipeline recomputed on every render, including every `pointermove` during slice drag.
- Location: `src/components/BoardDesigner.tsx`
- Resolution: Memoized `calculateEndGrainMetrics`, `readSliceStates`, `calculateBuildDimensions`, `buildEndGrainTemplate`, `generateCuttingBoardPlan`, `calculateWoodUsage`, and `new Map(woods)` off `project` and `woods`.
- Commit: `13b583b`

### P2 `☑`

- Problem: `generateCuttingBoardPlan` recomputed `calculateBuildDimensions` and `calculateEndGrainMetrics` four to five times per call.
- Location: `src/domain/boardCutPlan.ts:84`, `src/domain/boardCutPlan.ts:118`, `src/domain/boardCutPlan.ts:157`
- Resolution: Passed already-computed `build` and `metrics` into helpers.
- Commit: `ec699e5`

### P3 `⊘`

- Problem: `previewPattern` regenerates fresh ids every render while the preview dialog is open.
- Location: `src/components/BoardDesigner.tsx`
- Decision: Deferred as marginal.
- Notes: A clean memo is awkward because the preview depends on `sliceCount` after an early return, and hooks must stay above that return. The gain is limited because this is a transient modal.

### P4 `⊘`

- Problem: Service worker uses a network-first strategy with an unbounded, manually versioned cache.
- Location: `public/sw.js`
- Decision: Deferred as its own offline-behavior change.
- Notes: Moving to cache-first for `/assets/` affects update and eviction semantics and needs manual offline verification.

## P2 Accessibility

### A1 `☑`

- Problem: Top-view shop objects were pointer-only.
- Location: `src/components/ShopPlanner.tsx`
- Resolution: They are now focusable `role="button"` elements with `aria-label`, `aria-pressed`, Enter/Space activation, and arrow-key nudge support; `Shift` applies a coarse movement and motion is clamped to the room.
- Commit: `8b0537a`

### A2 `◐`

- Problem: Dialog keyboard behavior was incomplete.
- Location: `src/components/BoardDesigner.tsx`
- Done so far: `PatternPreviewDialog` handles Escape; both modals focus the dialog on open, restore focus to the trigger on close, and close on direct backdrop click.
- Remaining: Full Tab focus-trap that cycles within the dialog.
- Commit: `8b0537a`

### A3 `☑`

- Problem: No automated accessibility linting.
- Location: `eslint.config.js`
- Resolution: Added `eslint-plugin-jsx-a11y` in recommended mode as errors and cleared all eight flagged issues.
- Commit: `8b0537a`

### A4 `⊘`

- Problem: `DraggableAssembledBoard` still has no keyboard reorder or rotate support.
- Location: `src/components/BoardDesigner.tsx`
- Decision: Deferred.
- Notes: This is a larger interaction change involving drag math, a rotate key contract, and focus behavior on an SVG `<g>` grid. `StripList` already supports arrow-key reorder.

### A5 `⊘`

- Problem: `studio-tap` nests interactive controls.
- Location: `src/components/BoardDesigner.tsx`
- Decision: Deferred.
- Notes: `jsx-a11y` did not flag it, and changing the tap-to-enlarge affordance is more of a UX decision than a remediation fix.

### A6 `☑`

- Problem: Motion preferences were not respected.
- Location: `src/styles.css`
- Resolution: Added a `prefers-reduced-motion: reduce` media query that neutralizes animations and transitions.
- Commit: `8b0537a`

### A7 `⊘`

- Problem: Some small-text colors sit near the AA contrast threshold.
- Location: `src/styles.css`
- Decision: Deferred for a design-owner pass.
- Notes: Darkening brand colors without a measured contrast review would be arbitrary.

## P1 and P2 CI, Build, and Infra Security

### CI1 `☑`

- Problem: No dedicated typecheck script or CI step.
- Location: `package.json`, `ci.yml`
- Resolution: Added `"typecheck": "tsc -b"` and a CI typecheck step.
- Commit: `60abe3b`

### CI2 `☑`

- Problem: No coverage gate around the core domain and storage layer.
- Location: `package.json`, `vite.config.ts`, `ci.yml`
- Resolution: Added `test:coverage` and a v8 coverage gate.
- Notes: Current floors are just below present coverage: lines 88, statements 85, functions 82, branches 70.
- Commit: `60abe3b`

### CI3 `☑`

- Problem: No smoke verification that the built container actually serves the app and headers.
- Location: `ci.yml`
- Resolution: `docker-verify` now boots the image, curls `/` and a deep link for SPA fallback, and asserts the security headers.
- Notes: This could not be run locally because the sandbox blocks base-image pulls, so validation is by review plus GitHub Actions execution.
- Commit: `60abe3b`

### CI4 `☑`

- Problem: CI redundantly ran `corepack enable` twice.
- Location: `ci.yml`
- Resolution: Removed the duplicate step.
- Commit: `60abe3b`

### CI5 `⊘`

- Problem: `docker-publish` requests `id-token: write`.
- Location: `ci.yml`
- Decision: Deferred until a live publish confirms whether provenance or SBOM attestation needs it.

### CI6 `☑`

- Problem: Whether Docker Scout should block release flow.
- Location: `ci.yml`
- Decision: Keep it advisory-only.
- Notes: This is a hobby/noncommercial project, so informative output is useful without making releases brittle.

### SEC1 `☑`

- Problem: Missing basic browser hardening headers.
- Location: `nginx.conf`
- Resolution: Added `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and a CSP that allowlists the Google Fonts used by the app.
- Commit: `c21604a`

### SEC2 `☑`

- Problem: Static text assets were not compressed.
- Location: `nginx.conf`
- Resolution: Enabled gzip for text, JS, CSS, SVG, and the manifest.
- Commit: `c21604a`

### SEC3 `⊘`

- Problem: The container still runs as root.
- Location: `Dockerfile`
- Decision: Deferred because switching to `nginx-unprivileged` ripples through ports, health checks, compose config, and install docs.

### SEC4 `⊘`

- Problem: Base images are pinned by tag rather than digest.
- Location: `Dockerfile`
- Decision: Deferred.
- Notes: Dependabot already tracks Docker tags weekly, and digest pinning would add churn without a strong threat-model benefit here.

### SEC5 `☑`

- Problem: `normalizeData` allowed unknown keys through and `loadData` trusted bad JSON shapes too far.
- Location: `src/storage.ts`
- Resolution: `normalizeData` now returns only known `AtlasData` keys, and `loadData` falls back to starter data when stored JSON is not an object.
- Verification: Tests now assert the exact key set.
- Commit: `551dbce`

## P2 Tooling and Build Config

### TOOL1 `☑`

- Problem: Every dependency was pinned to `"latest"`, so the manifest carried no explicit version intent.
- Location: `package.json`
- Resolution: Pinned dependencies to the versions already resolved in the lockfile, including React 19, TypeScript 6.0.3, Vite 8.0.16, ESLint 10.5.0, and Vitest 4.1.9.

### TOOL2 `☑`

- Problem: Node version was declared three different ways.
- Location: `.nvmrc`, `package.json`, `Dockerfile`
- Resolution: Standardized on Node 24.

### TOOL3 `☑`

- Problem: `loadData` and `saveData` were hard to test without a DOM environment.
- Location: `tests/storage.test.ts`
- Resolution: Added an in-memory `localStorage` stub via `vi.stubGlobal`.
- Notes: This is more deterministic than jsdom and avoids an extra dependency. `downloadData` still needs coverage and is tracked under `TEST3`.
- Commit: `8bc115f`

### TOOL4 `☐`

- Problem: `tsconfig.app.json` is referenced as a project but does not set `composite: true`.
- Location: `tsconfig.app.json`
- Proposed fix: Add `composite: true`.

### TOOL5 `☐`

- Problem: There is no formatter config for a multi-file TypeScript and Markdown repo.
- Location: repo root
- Proposed fix: Add `.editorconfig` and optionally Prettier.

## P2 Repo Hygiene and Dead Code

### HYG1 `☑`

- Problem: `SliceOrderList` was dead code.
- Location: `src/components/SliceOrderList.tsx`
- Resolution: Deleted the file.

### HYG2 `☑`

- Problem: `WoodLibraryEditor.onUse` and its related branch were unused.
- Location: `src/components/WoodLibraryEditor.tsx`
- Resolution: Removed the prop, button branch, and dead CSS.

### HYG3 `☑`

- Problem: `selectedSlice` state was vestigial and only ever `0`.
- Location: `src/components/BoardDesigner.tsx`
- Resolution: Removed the state, clamp, and prop threading.

### HYG4 `☑`

- Problem: `CutStage` still declared `'stock-prep'` and `'surface'` members that were never produced.
- Location: `src/domain/boardCutPlan.ts:5`
- Resolution: Removed the unused union members.

### HYG5 `☑`

- Problem: `test-results/.last-run.json` was tracked and churned every run.
- Location: `test-results/`, `.gitignore`
- Resolution: Untracked it and added `test-results/` to `.gitignore`.

### HYG6 `☑`

- Problem: `.gitignore` had dead or incorrect patterns for `claude/*` and `agents/*`.
- Location: `.gitignore`
- Resolution: Fixed the tracked-local rule to `.claude/settings.local.json` and dropped the dead pattern.

### HYG7 `☑`

- Problem: `.dockerignore` listed both `.ds_store` and `.DS_Store`.
- Location: `.dockerignore`
- Resolution: Removed the lowercase duplicate.

### HYG8 `☑`

- Problem: Common unit helpers were duplicated across modules.
- Location: `src/domain/units.ts`
- Resolution: Extracted `toBoardFeet`, `nonNegative`, `sum`, `clampAngle`, and the generic angle-only `clamp`, then updated three modules to import them.
- Commit: `f9aa322`

### HYG9 `⊘`

- Problem: Several UI `Field` and `format` helpers are near-duplicates.
- Location: `src/components/*`
- Decision: Deferred.
- Notes: The three `Field` implementations differ in meaningful ways, and a shared version is better verified in the running UI than by static checks alone.

### HYG10 `⊘`

- Problem: `useContainerWidth` and `useElementSize` are near-duplicate hooks.
- Location: `src/components/*`
- Decision: Deferred as low-value cleanup.

### HYG11 `☑`

- Problem: A stale dated review document was still tracked.
- Location: `docs/reviews/REVIEW-2026-06-24-develop.md`
- Resolution: Replaced it with this living tracker.

### HYG12 `☐`

- Problem: Some files still have self-evident, generated-code-style comments.
- Location: `src/components/BoardDesigner.tsx`, `src/components/board/*`
- Proposed fix: Trim them opportunistically while touching nearby code.

### HYG13 `☑`

- Problem: `.claude/settings.local.json` was tracked even though it is per-developer state.
- Location: `.claude/`
- Resolution: Untracked it and added an ignore rule.

## P2 Documentation Drift

### DOC1 `☑`

- Problem: `PRODUCT_PLAN` lagged shipped preset work.
- Location: `docs/plans/PRODUCT_PLAN.md`
- Resolution: `BOARD-015` now lists the seven shipped presets; only seeded-mosaic remains future work.
- Commit: `233923b`

### DOC2 `☑`

- Problem: Brick-pattern offset documentation had drifted from implementation.
- Location: `src/domain/boardPatterns.ts`, `docs/plans/BRICK_PATTERN_CORRECTION.md`
- Resolution: Offsets now derive from `PRESET_STRIP_WIDTH` rather than hard-coded `20` and `40`.
- Notes: True brick-and-mortar still needs composite panels under `BOARD-008`.
- Commit: `b5debab`

### DOC3 `☑`

- Problem: README did not mention the installable, offline-capable PWA state clearly enough.
- Location: `README.md`
- Resolution: Updated the current-features section.
- Commit: `233923b`

### DOC4 `☑`

- Problem: The `howTo` index file had an awkward name.
- Location: `docs/howTo/`
- Resolution: Renamed `howToREADME.md` to `README.md`.
- Commit: `b5debab`

### DOC5 `☑`

- Problem: README feature and accuracy statements needed a pass against the shipped product.
- Location: `README.md`
- Resolution: Reviewed and cleared remaining false claims.

## Test Coverage Gaps

### TEST1 `☐`

- Gap: Live slice drag-reorder math in `DraggableAssembledBoard` is still untested.
- Why it matters: This is the largest remaining pocket of untested logic.
- Proposed fix: Extract `targetFromX`, `orderWithKeyAt`, and tap-vs-drag threshold logic into pure helpers and unit-test them.

### TEST2 `☐`

- Gap: `usePinchPan` transform math is untested.
- Proposed fix: Extract and test scale clamp, pan offset, and single-pointer pass-through behavior.

### TEST3 `◐`

- Gap: `storage.ts` still lacks coverage for `downloadData`, `validColor` rejection, and bad-JSON to `starterData` fallback.
- Already done: `C1` regression coverage, `saveData`/`loadData` round-trip coverage, and the quota-error path.
- Commits: `8bc115f`, `9c798de`

### TEST4 `◐`

- Gap: Remaining domain export coverage is still incomplete.
- Already done: `pickSpeciesPair`, `evenStripCount`, and `fitPxPerMm` are now covered, including fallback and clamp branches.
- Remaining: `calculateWoodUsage` per-species internals plus `projectPolygon` and `pointsAttribute`.
- Commit: `b110241`

### TEST5 `☐`

- Gap: No CI container smoke test.
- Status note: Covered by `CI3`.

### TEST6 `☑`

- Gap: The conservation fuzz loop used to cover only `trailingAngle: 0`.
- Resolution: Added a 120-case angled fuzz pass alongside `C2`.
- Commit: `6b3df17`

### TEST7 `☐`

- Gap: Some assertions are weak or tautological.
- Examples: `tests/storage.test.ts:62` uses `toBeDefined`; `tests/boardGeometry.test.ts:47-48` compares literals to literals.

## Changelog

- 2026-06-24: Tracker opened; folded in `REVIEW-2026-06-24-develop.md` plus fresh audit; baseline green at 67 tests.
- 2026-06-24: Fixed `C1` through `C5` test-first in `9c798de`, `6b3df17`, `2a4f1a9`, `8bc115f`, and `ed2cb7a`; added `TEST6` plus storage persistence coverage; suite moved from 67 to 76 tests, green.
- 2026-06-24: Removed dead code in `555eadc`; cleaned hygiene and ignore rules in `8ffeb4a`; reconciled Node 24 in `fa7fe7c`; pinned dependencies from `"latest"` in `5d56f68`.
- 2026-06-24: Landed performance work in `13b583b` and `ec699e5`; deferred `P3` and `P4` with rationale.
- 2026-06-24: Added nginx headers and gzip in `c21604a`; added CI typecheck, coverage gate, container smoke test, and corepack cleanup in `60abe3b`; deferred or decided `CI5`, `CI6`, `SEC3`, and `SEC4`.
- 2026-06-24: Landed accessibility work in `8b0537a`; `A2` remains partial and `A4`, `A5`, `A7` remain deferred.
- 2026-06-24: Hardened storage in `551dbce`; extracted domain helpers to `units.ts` in `f9aa322`; added domain tests and raised branch coverage from about 72 percent to about 78 percent in `b110241`; deferred `HYG9` and `HYG10`.
- 2026-06-24: Synced docs in `b5debab` and `233923b`; fixed `H4`, `H6`, and `H8` in `d8dc359`; closed `H5` as a misdiagnosis; deferred `H1`, `H2`, `H3`, and `H7`.
