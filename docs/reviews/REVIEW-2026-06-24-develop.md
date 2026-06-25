# Full code & usage review — `develop` @ 9c778e1

Date: 2026-06-24. Method: five parallel read-only reviewers (domain correctness, React layer, UX/usage, security/data-integrity, tests/tooling/CI), each verified against the code; the two critical bugs were re-confirmed by hand. Scope: the whole app as it stands on `develop`.

## Overall health

Genuinely solid for its size. The domain layer is well-factored and unusually well-tested (numeric invariants, a 250-iteration volume-conservation property loop, mutation-safety checks). The React layer has a clean single-source-of-truth in `App` with an explicit commit/undo flow, correct hook ordering, and disciplined SVG-in-millimetres scaling. TypeScript strictness is stricter than most production codebases. The real risks are concentrated and fixable: a couple of confirmed correctness bugs around angled strips and persistence, an un-memoized render pipeline that re-runs during drags, weak/volatile undo against destructive buttons, and reproducibility/hygiene gaps in tooling.

Note: a pending branch (`fix/wafer-rotation-and-strip-reverse`, not yet merged) already addresses wafer-rotation tap reliability, the strip-list "vanish on stale drag order" guard, a setState-during-render fix, and adds a Playwright smoke suite. Items below exclude those.

## P0 — confirmed correctness bugs

### C1. Negative `trailingAngle` is silently zeroed on every load/export (data loss)
`src/storage.ts:50` applies `finiteNumber` to `trailingAngle`, and `finiteNumber` (`:122-123`) does `Math.max(0, value)`. The geometry clamps angle to `[-89, 89]` and the UI input allows `min="-89"`, so negative angles are valid and load-bearing for chevron/herringbone. Because `normalizeData` also runs inside `downloadData`, exports lose them too. A user's angled design is quietly flattened on the next reload. Fix: normalize `trailingAngle` with a signed coercion (finite-but-not-floored), then clamp to `[-89, 89]`.

### C2. Volume-conservation error fires on legitimately angled strips
`buildEndGrainTemplate` (`src/domain/boardGeometry.ts:72`) does **not** clamp a strip's `rightWidth` to ≥0, so the cumulative `right` edge can go negative; but `calculateStripVolumes` (`:194`) clamps `rightWidth = Math.max(0, …)`. The two diverge, `faceShift`/`finishedWidth` stop matching the volume terms, and `calculateEndGrainMetrics` pushes "Material-volume conservation failed" on geometry the user can legitimately create (a strip whose angled face closes). Fix: clamp the running edges in `buildEndGrainTemplate` the same way as `calculateStripVolumes`, or skip the conservation assertion when `template.errors` is non-empty (a strip already closed).

### C3. `applySliceOrder` doesn't validate the order → duplicate/missing slice identities
`src/domain/boardSlices.ts:56-62` does `order.map(i => states[i]).filter(Boolean)` with no dedupe and no length guarantee, unlike the careful `normalizeOrder` on the read path. An order like `[0,0,1]` yields a duplicated slice and drops others, desyncing the parallel `rowOrder/rowFlips/rowRotations/rowOffsets` arrays from the slice count. The UI currently feeds valid permutations, so it's latent — but it's the kind of corruption that's hard to trace later. Fix: run the result through the same dedupe-and-backfill as `normalizeOrder`, or assert the input is a permutation of `0..count-1`.

### C4. `saveData` has no error handling → silent data loss while the UI says "Saved"
`src/App.tsx:23-26` writes the whole dataset to `localStorage` on every change via an effect; `src/storage.ts:128-130` calls `setItem` with no try/catch. A `QuotaExceededError` (large workspace, or Safari private mode) throws in the effect, yet the topbar unconditionally shows "Saved in this browser". Work is lost on reload with no warning. Fix: wrap `saveData` in try/catch; on failure show a real "couldn't save — storage full" state and stop claiming saved.

## P1 — correctness/UX risks worth fixing soon

### H1. Cut plan reads raw `project.allowances.*` instead of `resolveAllowances`
`src/domain/boardCutPlan.ts` (`:77, 133-134, 165, 171, 174`) reads `project.allowances.jointing/.widthTrim/…` directly, while `calculateBuildDimensions` uses `resolveAllowances(project)` (which defaults a partial allowances object). A board with partial allowances yields "NaN mm" in cut-list notes and pass counts while the dimensions are computed from the defaults — the cut list and the dimensions disagree. Fix: compute `const allow = resolveAllowances(project)` once and read from it everywhere in this file.

### H2. Destructive arrangement buttons wipe the user's strips with no preview, against weak undo
`Randomize` (`BoardDesigner.tsx:78`) and every end-grain pattern recipe (`boardPatterns.ts` `stripes()`) discard the user's strips and rebuild a fresh A/B stack at width 40 with new ids — losing custom widths, species, and angles. The pattern recipes have a before/after dialog, but the in-panel `Randomize`/`Mirror`/`Repeat` fire instantly. The only recovery is the single-level, in-memory, reload-volatile undo (`App.tsx:28-41`) sitting far away in the topbar. Fix: route `Randomize` and regenerating actions through the existing confirm dialog; visually separate non-destructive arrangements (Alternate/Gradient/Reverse) from destructive ones; surface an inline undo near the panel.

### H3. Undo is single-level, no redo, and invisible at the moment of risk
`App.tsx` stores exactly one prior state, doesn't snapshot active-project selection (so undoing a delete leaves the active id pointing elsewhere), and the control lives only in the topbar (which can crowd/wrap at tablet-landscape widths). Fix: a small undo stack (~10) + `Cmd/Ctrl+Z`, snapshot active ids alongside data, and move/echo Undo near the editing actions.

### H4. Import replaces the entire workspace with only volatile undo
`App.tsx:95-107` replaces all projects via `commitData`; the pre-import state survives only in single-level in-memory undo and is lost on reload. The confirm dialog advises exporting first (the main mitigation). Fix: auto-snapshot the pre-import state to a separate localStorage key so it survives reload.

## P1 — performance

### P-1. The full domain pipeline recomputes every render, including every pointermove during a slice drag
`BoardDesigner.tsx:42-67` runs `calculateEndGrainMetrics`, `readSliceStates`, `calculateBuildDimensions`, `buildEndGrainTemplate`, `generateCuttingBoardPlan`, `calculateWoodUsage`, and rebuilds a `woods` Map unconditionally in the render body. `DraggableAssembledBoard` calls `setDrag` on every pointermove, so the whole pipeline re-executes per move event — the main jank risk on the tablet target. Fix: wrap the derived values in `useMemo` keyed on `project`/`woods`.

## P2 — accessibility

- `PreviewPopout` and `PatternPreviewDialog` set `aria-modal` but don't trap focus or move focus into the dialog; `PatternPreviewDialog` has **no** Escape handler (`BoardDesigner.tsx:302`). Add focus-on-open + focus trap, and an Escape handler to the pattern dialog.
- The interactive board (`DraggableAssembledBoard`) has no keyboard path to reorder/rotate, unlike `StripList` (arrow keys). Add keyboard reorder + a documented rotate key.
- `studio-tap` is a `role="button"` wrapping interactive slice `<g role="button">` elements (nested interactive controls) — invalid semantics and click ambiguity. Make "Tap to enlarge" a discrete corner affordance instead of wrapping the whole stage.
- No `prefers-reduced-motion` handling for the drawer/card transitions; slice `aria-label`s use terse `R/F/N` without expansion.

## P2 — code health / smaller correctness

- **Dead file:** `src/components/SliceOrderList.tsx` (~111 lines) is exported but imported nowhere — leftover from the drag refactor (the live logic lives in `DraggableAssembledBoard`). Delete it. (Note: a reviewer suggested unit-testing its drag math; instead test the *live* `DraggableAssembledBoard` math — see tests below.)
- **Dead prop:** `WoodLibraryEditor.onUse` is never passed by its only caller; the add-as-strip branch is unreachable. Remove or wire it.
- **Id churn:** `randomizeArrangement`/`duplicatePattern`/`mirrorPattern` mint new ids for *every* strip, so `StripList` keys all change and the list remounts (lost focus). Preserve ids for reorder/randomize; only mint for genuinely new strips.
- **NaN on cleared inputs:** numeric fields store `Number('')` → `NaN` into live state (`BoardDesigner` Field, `ShopPlanner:186`, `MillingAllowances:23`) until a reload rescues it. Guard with `Number(v) || 0`.
- **`ShopPlanner` selection** isn't reset when switching projects, so the inspector silently empties. Reset on `project.id` change.
- **`crosscutWastePercent`** (`boardGeometry.ts:153`) is a length ratio, not a volume percent like its siblings — misleading name/unit.
- **Double-counted angle shift** inflates `removedBoardFeet`/`plannedWaste` for angled designs (`boardAllowances.ts:83` + `boardCutPlan.ts:92` both add the angle shift on already-padded widths). Share one helper.

## P1/P2 — tooling, build, CI

- **HIGH — every dependency pinned to `"latest"`** (`package.json`). Reproducible today only because `--frozen-lockfile` honours the committed lockfile, but the manifest carries zero version intent and your grouped-`*` Dependabot config can float majors of React/Vite/TS freely. Pin to caret ranges on current versions.
- **Node version stated three ways:** `.nvmrc` = 24, `engines.node` = ">=20.19", `Dockerfile` = `node:22-alpine`. CI verifies on 24, the published image builds on 22. Align (ideally Dockerfile → `node:24-alpine`).
- **`test-results/.last-run.json` is tracked** and not gitignored — run-state that churns every test run. `git rm --cached` it and add `test-results/` to `.gitignore`.
- **nginx** has correct SPA fallback + asset caching but **no `gzip`** (JS/CSS ship uncompressed) and **no security headers** (`X-Content-Type-Options`, `Referrer-Policy`, a basic CSP, `X-Frame-Options: DENY`). Cheap defense-in-depth; nginx also runs as root (consider `nginx-unprivileged`).
- **CI gaps:** no coverage gate (`vitest run` has no `--coverage`/threshold); type-check only runs inside `build` (no standalone `typecheck`); `docker-verify` builds + CVE-scans the image but never *starts* it to confirm nginx serves `/` and a deep link (SPA fallback). Add these. (Good: actions pinned to SHAs, provenance + SBOM on publish, sensible branch flow.)
- **`tsconfig.app.json`** lacks `composite: true` though it's a referenced project (builds today, but incorrect for incremental builds).

## Test coverage gaps (highest value first)

1. Extract and unit-test the **live** slice drag-reorder math from `DraggableAssembledBoard` (`targetFromX` / `orderWithKeyAt` / the tap-vs-drag threshold) — currently the largest untested logic and directly maps to the physical glue-up.
2. Extract and test `usePinchPan` transform math (scale clamp, pan offset, single-pointer pass-through).
3. Fill `storage.ts` migration branches: multi-board global-allowance unification, malformed `endGrain`, bad-JSON → `starterData`, `validColor` rejection, **and a regression test for C1** (negative `trailingAngle` survives a normalize round-trip).
4. Extend the volume-conservation property loop to include angled strips (it currently only covers `trailingAngle: 0` plus one hand-built ±12° case) — this would have caught C2.
5. Add a CI container smoke test (run the image, curl `/` and a deep link).

## UX — biggest wins (top 5)

1. Protect against strip wipe-out: route `Randomize`/pattern recipes through the before/after confirm; separate destructive vs non-destructive arrangements (H2).
2. Make undo trustworthy and discoverable: multi-level + `Cmd/Z`, placed near the editing actions, not the crowded topbar (H3).
3. Cut the rotate/reorder round-trip: allow per-slice rotate/reorder on the docked finished view with a visible grip, instead of forcing a pop-out modal trip; disambiguate tap-rotate from drag-reorder.
4. Reconnect Wood library & Milling allowances to the board: turn the "find them in the sidebar" text hint into real navigation (the sidebar is icon-only/collapsed on a tablet).
5. Tablet-landscape polish: wrap/collapse the topbar below ~1100px, unify terminology (strip vs slice/wafer vs row/slot), de-duplicate arrangement-button icons.

## Suggested order of work

- **Now (P0):** C1 trailing-angle normalize + regression test; C2 conservation clamp; C4 save try/catch + honest save indicator; C3 applySliceOrder validation.
- **Next (P1):** H1 cut-plan resolveAllowances; H2/H3 destructive-action guard + multi-level undo; P-1 memoize the domain pipeline; pin dependencies; untrack `test-results/`.
- **Then (P2):** accessibility (focus trap, pattern-dialog Escape, keyboard reorder); delete dead `SliceOrderList`/`onUse`; nginx gzip+headers; CI coverage + container smoke test; node-version alignment; the test-coverage additions above.
