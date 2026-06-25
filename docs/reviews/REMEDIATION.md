# SawdustAtlas — Remediation Tracker

> **Living document.** This is the single source of truth for review findings and their
> remediation status. It supersedes the point-in-time snapshot `REVIEW-2026-06-24-develop.md`
> (now removed), folding that review together with a fresh full-repo audit and a
> hand-verification pass. Update the **Status** column as work lands — do not let it drift.

- **Opened:** 2026-06-24
- **Baseline at open:** `main` @ `b82d63d` — `pnpm lint` clean, `pnpm test` 67/67 green, `pnpm build` OK.
- **Working branch:** `review/full-e2e-audit` (intended to merge into `develop`).
- **Method:** five read-only review passes (UI/React, domain/math, tests, CI/CD/infra, docs/hygiene),
  with every Critical re-confirmed by reading the cited source directly.

## Status legend

| Mark | Meaning |
|------|---------|
| ☐ | Open — not started |
| ◐ | In progress / partially done |
| ☑ | Done — landed with verification (test and/or build) |
| ⊘ | Won't fix / deferred — see note |

## How to use this doc

1. Pick the lowest-numbered open item in the highest-priority open section.
2. For code/behaviour changes, **write the failing test first** (TDD), then fix, then verify.
3. Flip the Status mark and add a one-line note (commit SHA or rationale) in the item.
4. Keep `pnpm lint && pnpm test && pnpm build` green before each commit.

---

## P0 — Critical correctness (data loss / crashes) — all hand-verified

| ID | Status | Item | Location | Fix approach |
|----|:--:|------|----------|--------------|
| **C1** | ☐ | Negative `trailingAngle` is floored to `0` on every load **and** export (`finiteNumber` does `Math.max(0, value)`), silently flattening chevron/herringbone/mirrored-bevel designs. `normalizeData` runs inside `downloadData` too, so backups are corrupted. | `src/storage.ts:50,122-123`, `:133` | Add a sign-preserving `signedFinite()` coercion; use it for angles/offsets, keep `Math.max(0, …)` only for true dimensions. Regression test: negative angle survives a normalize round-trip. |
| **C2** | ☐ | Volume-conservation check fails on legitimately angled strips: `buildEndGrainTemplate` computes `rightWidth` **unclamped** while `calculateStripVolumes` clamps `Math.max(0, …)`, so the two diverge when an angled face closes and `calculateEndGrainMetrics` reports "conservation failed" on valid geometry. | `src/domain/boardGeometry.ts:72` vs `:194` | Align the clamp (or suppress the conservation assertion when `template.errors` is non-empty). Extend the conservation fuzz loop to include angled strips. |
| **C3** | ☐ | Cut plan reads `project.allowances.*` raw, bypassing `resolveAllowances`; on a partial/missing `allowances` it throws `TypeError` or emits `NaN mm` notes while dimensions use defaults — cut list and dimensions silently disagree. | `src/domain/boardCutPlan.ts:77,133,134,165,171` | Compute `resolveAllowances(project)` once, thread it through the file. Test: partial-allowances project produces a finite, defaulted plan. |
| **C4** | ☐ | `saveData` has no error handling; autosave effect can throw `QuotaExceededError`/`SecurityError` while the UI unconditionally shows "Saved in this browser" → silent data loss. | `src/storage.ts:128-130`, `src/App.tsx` save indicator | Wrap in try/catch returning a success boolean; surface an honest "couldn't save — storage full" state. Test under jsdom with a throwing storage stub. |
| **C5** | ☐ | `applySliceOrder` does `order.map(i => states[i]).filter(Boolean)` with no dedupe/length guarantee, so a bad order (`[0,0,1]`) duplicates one slice and drops others, desyncing the parallel `rowOrder/rowFlips/rowRotations/rowOffsets` arrays. Latent today; corruption trap. | `src/domain/boardSlices.ts:56-62` | Run the result through the same dedupe-and-backfill as `normalizeOrder` (or assert a permutation of `0..n-1`). Test with malformed orders. |

---

## P1 — High (correctness / UX risk)

| ID | Status | Item | Location | Fix approach |
|----|:--:|------|----------|--------------|
| **H1** | ☐ | Destructive arrangement buttons (`Randomize`/`Mirror`/`Repeat`) discard the user's strips instantly with no preview, recoverable only via weak undo. | `src/components/BoardDesigner.tsx`, `src/domain/boardPatterns.ts` | Route destructive actions through the existing before/after confirm; visually separate destructive vs non-destructive arrangements. |
| **H2** | ☐ | Undo is single-level, no redo, doesn't snapshot active-project selection, and lives far from the editing actions. | `src/App.tsx` (`undoData`, `commitData`) | Bounded undo stack (~10) + `Cmd/Ctrl+Z`; snapshot active ids alongside data. |
| **H3** | ☐ | Import replaces the entire workspace; pre-import state survives only in volatile in-memory undo (lost on reload). | `src/App.tsx` import path | Auto-snapshot pre-import state to a separate `localStorage` key. |
| **H4** | ☐ | `randomize`/`duplicate`/`mirror` mint new ids for **every** strip, so `StripList` keys all change and the list remounts (lost focus). | `src/components/BoardDesigner.tsx`, `src/domain/boardPatterns.ts` | Preserve ids for reorder/randomize; only mint ids for genuinely new strips. |
| **H5** | ☐ | Cleared numeric inputs store `Number('')` → `NaN` into live state until a reload rescues it. | `BoardDesigner` Field, `ShopPlanner.tsx:186`, `MillingAllowances.tsx:23` | Guard with `Number(v) || 0` (or validate on change). |
| **H6** | ☐ | `ShopPlanner` selection isn't reset when switching projects → inspector silently empties / points at a stale item. | `src/components/ShopPlanner.tsx` | Reset selection on `project.id` change. |
| **H7** | ☐ | Angle shift is double-counted, inflating `removedBoardFeet`/`plannedWaste` for angled designs (added on already-padded widths in two places). | `src/domain/boardAllowances.ts:83`, `src/domain/boardCutPlan.ts:92` | Share one helper so the shift is applied once. |
| **H8** | ☐ | `ShopPlanner.beginDrag` attaches `window` pointer listeners in a closure capturing `zoom`/`project` (stale after zoom/project change mid-drag); no `pointercancel`, leaks if unmounted mid-drag. | `src/components/ShopPlanner.tsx:40-46` | Read live values via ref; add `pointercancel`; prefer element-scoped pointer capture. |

---

## P1 — Performance

| ID | Status | Item | Location | Fix approach |
|----|:--:|------|----------|--------------|
| **P1** | ☐ | The whole derived domain pipeline (`calculateEndGrainMetrics`, `readSliceStates`, `calculateBuildDimensions`, `buildEndGrainTemplate`, `generateCuttingBoardPlan`, `calculateWoodUsage`, `new Map(woods)`) recomputes on **every render**, including every `pointermove` during a slice drag. | `src/components/BoardDesigner.tsx` | `useMemo` the derived values keyed on `project`/`woods`. |
| **P2** | ☐ | `generateCuttingBoardPlan` recomputes `calculateBuildDimensions`/`calculateEndGrainMetrics` 4–5× internally per call. | `src/domain/boardCutPlan.ts:84,118,157` | Pass already-computed `build`/`metrics` into the helpers. |
| **P3** | ☐ | `previewPattern` regenerates fresh ids each render while the preview dialog is open, forcing full preview re-render. | `src/components/BoardDesigner.tsx` | Memoize keyed on `[pendingPattern, project, woods]`. |
| **P4** | ☐ | Service worker is network-first with an unbounded, manually-versioned cache; re-fetches even content-hashed assets and never prunes. | `public/sw.js` | Cache-first for `/assets/` (already `immutable` via nginx); keep network-first for navigations. |

---

## P2 — Accessibility

| ID | Status | Item | Location | Fix approach |
|----|:--:|------|----------|--------------|
| **A1** | ☐ | Top-view shop objects are non-semantic `div`s (`onPointerDown` only, no `role`/`tabIndex`/`aria-label`/keyboard) — inaccessible to keyboard/AT. | `src/components/ShopPlanner.tsx:95,97` | Make them focusable buttons; add keyboard select/nudge. |
| **A2** | ☐ | Modals set `aria-modal` but don't trap/move/restore focus; `PatternPreviewDialog` has **no** Escape handler. | `src/components/BoardDesigner.tsx` (PreviewPopout, PatternPreviewDialog `:302`) | Focus-on-open + focus trap + restore; add Escape to the pattern dialog. |
| **A3** | ☐ | No automated a11y linting. | `eslint.config.js` | Add `eslint-plugin-jsx-a11y` (catches most of A1/A2 regressions). |
| **A4** | ☐ | `DraggableAssembledBoard` has no keyboard path to reorder/rotate (unlike `StripList`). | `src/components/BoardDesigner.tsx` | Add keyboard reorder + documented rotate key. |
| **A5** | ☐ | `studio-tap` `role="button"` wraps interactive slice `<g role="button">` (nested interactive controls). | `src/components/BoardDesigner.tsx` | Make "tap to enlarge" a discrete corner affordance. |
| **A6** | ☐ | No `prefers-reduced-motion`; terse `R/F/N` `aria-label`s. | `src/styles.css`, slice labels | Add reduced-motion media query; expand aria-labels. |
| **A7** | ☐ | Small-text colors (`.studio-note` `#7a8079`, `.eyebrow` `#a15f35`) near AA threshold. | `src/styles.css` | Audit against WCAG AA; darken if needed. |

---

## P1/P2 — CI/CD, build & infra security

| ID | Status | Item | Location | Fix approach |
|----|:--:|------|----------|--------------|
| **CI1** | ☐ | No standalone type-check; types only checked inside `pnpm build`. | `package.json`, `.github/workflows/ci.yml` | Add `"typecheck": "tsc -b"` script + a CI step. |
| **CI2** | ☐ | No coverage gate (`vitest run` has no `--coverage`/threshold). | `package.json`, `vite.config.ts`, ci | Add coverage config + a `test:coverage` script; surface in CI. |
| **CI3** | ☐ | `docker-verify` builds + CVE-scans the image but never **runs** it to confirm nginx serves `/` and a deep link. | `.github/workflows/ci.yml` | Add a step: run the image, `curl` `/` and a deep route (SPA fallback). |
| **CI4** | ☐ | Redundant `corepack enable` inside the "Activate pnpm" step (already enabled before `setup-node`). | `.github/workflows/ci.yml:43-46` | Drop the duplicate. |
| **CI5** | ☐ | `docker-publish` requests `id-token: write` but auths to Docker Hub with username/password. | `.github/workflows/ci.yml:104` | Confirm attestation need; drop if unused (least privilege). |
| **CI6** | ☐ | Docker Scout scans are advisory (`continue-on-error`, no comment, no gate). | `.github/workflows/ci.yml` | Decide consciously: keep advisory or gate criticals. (Doc the decision.) |
| **SEC1** | ☐ | nginx serves no security headers. | `nginx.conf` | Add `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, a basic CSP. |
| **SEC2** | ☐ | No `gzip` — JS/CSS ship uncompressed. | `nginx.conf` | Enable `gzip` for text/JS/CSS/SVG/manifest. |
| **SEC3** | ☐ | Container runs as root. | `Dockerfile` | Consider `nginxinc/nginx-unprivileged`. |
| **SEC4** | ☐ | Base images pinned by tag, not digest. | `Dockerfile` | Pin `node`/`nginx` by digest (Dependabot can bump). |
| **SEC5** | ☐ | Import path under-validates: `JSON.parse(...) as AtlasData` + `normalizeData` spreads `...data`, preserving arbitrary keys from untrusted localStorage/import. | `src/App.tsx`, `src/storage.ts:19,32` | Return an explicit known-key object; guard `isRecord(parsed)` before normalizing. |

---

## P2 — Tooling / build config

| ID | Status | Item | Location | Fix approach |
|----|:--:|------|----------|--------------|
| **TOOL1** | ☐ | Every dependency pinned to `"latest"` — manifest carries zero version intent; grouped-`*` Dependabot can float majors. | `package.json` | Pin to the lockfile-resolved versions (React 19, TS 6.0.3, Vite 8.0.16, ESLint 10.5.0, Vitest 4.1.9, …). |
| **TOOL2** | ☐ | Node version stated three ways: `.nvmrc`=24, `engines.node`=">=20.19", `Dockerfile`=`node:22-alpine`. | `.nvmrc`, `package.json`, `Dockerfile` | Standardize on Node 24. |
| **TOOL3** | ☐ | Vitest has no `jsdom` environment, so `loadData`/`saveData`/`downloadData` are untestable. | `vite.config.ts` | Add `environment: 'jsdom'` (or per-file `// @vitest-environment jsdom`). |
| **TOOL4** | ☐ | `tsconfig.app.json` lacks `composite: true` though referenced as a project. | `tsconfig.app.json` | Add `composite: true`. |
| **TOOL5** | ☐ | No formatter config despite multi-file TS/MD and a contributor workflow. | repo root | Add `.editorconfig` (+ optional Prettier). |

---

## P2 — Repo hygiene & dead code

| ID | Status | Item | Location | Fix approach |
|----|:--:|------|----------|--------------|
| **HYG1** | ☐ | Dead file — `SliceOrderList` imported nowhere (~111 lines). | `src/components/SliceOrderList.tsx` | Delete. |
| **HYG2** | ☐ | Dead prop/branch — `WoodLibraryEditor.onUse` never passed by its only caller. | `src/components/WoodLibraryEditor.tsx` | Remove `onUse` + its button branch + dead CSS. |
| **HYG3** | ☐ | Vestigial `selectedSlice` state (only ever `0`). | `src/components/BoardDesigner.tsx` | Remove state + clamp + prop threading. |
| **HYG4** | ☐ | `CutStage` declares `'stock-prep'`/`'surface'` members never produced. | `src/domain/boardCutPlan.ts:5` | Remove unused union members. |
| **HYG5** | ☐ | `test-results/.last-run.json` tracked + not gitignored (churns every run; committed "passed" artifact). | `test-results/`, `.gitignore` | `git rm --cached`; add `test-results/` to `.gitignore`. |
| **HYG6** | ☐ | `.gitignore` `claude/*` matches nothing (dir is `.claude/`); dead `agents/*`. | `.gitignore` | Fix to `.claude/settings.local.json`; drop dead pattern. |
| **HYG7** | ☐ | `.dockerignore` lists both `.ds_store` and `.DS_Store`. | `.dockerignore` | Drop the lowercase dup. |
| **HYG8** | ☐ | Duplicated domain helpers (`toBoardFeet`, `clampAngle`, `nonNegative`, `sum`) across three files. | `src/domain/*` | Extract `src/domain/units.ts`. |
| **HYG9** | ☐ | Duplicated UI `Field`/`format` helpers across three components. | `src/components/*` | Extract a shared `ui` module. |
| **HYG10** | ☐ | Near-duplicate hooks `useContainerWidth`/`useElementSize` with divergent deps. | `src/components/*` | Unify. |
| **HYG11** | ☑ | Stale dated review committed as a tracked doc. | `docs/reviews/REVIEW-2026-06-24-develop.md` | Replaced by this living tracker. |
| **HYG12** | ☐ | Pervasive over-commenting (generated-code tell). | `src/components/BoardDesigner.tsx`, `src/components/board/*` | Trim self-evident comments opportunistically. |
| **HYG13** | ☐ | `.claude/settings.local.json` tracked (per-developer local file). | `.claude/` | Untrack + gitignore. |

---

## P2 — Documentation drift

| ID | Status | Item | Location | Fix approach |
|----|:--:|------|----------|--------------|
| **DOC1** | ☐ | PRODUCT_PLAN BOARD-015 says third-bond/zig-zag/stepped-wave are "next" but all seven presets already ship. | `docs/plans/PRODUCT_PLAN.md:105` | Update status to reflect shipped presets. |
| **DOC2** | ☐ | BRICK_PATTERN_CORRECTION's offset fix is unshipped (still hard-coded `20`/`40`) but the doc reads as an open plan with the rename done. | `docs/plans/BRICK_PATTERN_CORRECTION.md`, `src/domain/boardPatterns.ts:31,34` | Either derive offsets from course pitch (preferred) or mark the doc accurately. |
| **DOC3** | ☐ | README "Current features" omits the PWA/offline install path. | `README.md` | Add a one-line installable-PWA note. |
| **DOC4** | ☐ | `docs/howTo/howToREADME.md` won't auto-render as a directory index. | `docs/howTo/` | Rename to `README.md`. |
| **DOC5** | ☐ | Keep README features/accuracy claims in sync as fixes land. | `README.md` | Review at the end. |

---

## Test coverage gaps (highest value first)

| ID | Status | Item | Fix approach |
|----|:--:|------|--------------|
| **TEST1** | ☐ | Live slice drag-reorder math (`DraggableAssembledBoard`: `targetFromX`/`orderWithKeyAt`/tap-vs-drag threshold) untested — largest untested logic. | Extract the pure math and unit-test it. |
| **TEST2** | ☐ | `usePinchPan` transform math untested. | Extract + test scale clamp / pan offset / single-pointer pass-through. |
| **TEST3** | ☐ | `storage.ts` branches untested (migration, malformed input, bad-JSON fallback, `validColor`) incl. **C1 regression**. | Add under jsdom env. |
| **TEST4** | ☐ | `calculateWoodUsage` internals, `pickSpeciesPair`, `evenStripCount`, `fitPxPerMm`, `projectPolygon` uncovered. | Add targeted tests. |
| **TEST5** | ☐ | No CI container smoke test. | Covered by CI3. |
| **TEST6** | ☐ | Conservation fuzz loop only covers `trailingAngle: 0`. | Extend to angled strips (covers C2). |
| **TEST7** | ☐ | Weak/tautological assertions. | `tests/storage.test.ts:62` (`toBeDefined`), `tests/boardGeometry.test.ts:47-48` (literal-vs-literal). |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-24 | Tracker opened; folded in `REVIEW-2026-06-24-develop.md` + fresh audit; baseline green (67 tests). |
