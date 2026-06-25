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
| **C1** | ☑ | Negative `trailingAngle` floored to `0` on every load/export, flattening chevron/herringbone designs. **Fixed:** added sign-preserving `signedFinite()` for angles/offsets, kept flooring for dimensions; regression tests cover both signed fields. `9c798de` | `src/storage.ts` | Done. |
| **C2** | ☑ | Spurious "conservation failed" piled onto strips that already report `closes or crosses`. **Fixed:** only assert conservation when the design is otherwise valid; added a 120-case angled fuzz (also TEST6) proving valid angled designs conserve. `6b3df17` | `src/domain/boardGeometry.ts` | Done. |
| **C3** | ☑ | Cut plan read `project.allowances.*` raw → crash/`NaN` on partial allowances. **Fixed:** threaded `resolveAllowances` through all five reads; test with a board that has no allowances. `2a4f1a9` | `src/domain/boardCutPlan.ts` | Done. |
| **C4** | ☑ | `saveData` could throw while the UI claimed "Saved". **Fixed:** `saveData` returns a success boolean; App shows an honest "Not saved — export a backup" warning; tests use an in-memory `localStorage` stub for the round-trip and quota-error paths. `8bc115f` | `src/storage.ts`, `src/App.tsx` | Done. |
| **C5** | ☑ | `applySliceOrder` didn't dedupe/backfill, so a malformed order desynced the parallel arrays. **Fixed:** reuse `normalizeOrder` so the result is always a permutation of `0..count-1`. `ed2cb7a` | `src/domain/boardSlices.ts` | Done. |

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
| **P1** | ☑ | (`13b583b`) The whole derived domain pipeline (`calculateEndGrainMetrics`, `readSliceStates`, `calculateBuildDimensions`, `buildEndGrainTemplate`, `generateCuttingBoardPlan`, `calculateWoodUsage`, `new Map(woods)`) recomputes on **every render**, including every `pointermove` during a slice drag. | `src/components/BoardDesigner.tsx` | `useMemo` the derived values keyed on `project`/`woods`. |
| **P2** | ☑ | (`ec699e5`) `generateCuttingBoardPlan` recomputes `calculateBuildDimensions`/`calculateEndGrainMetrics` 4–5× internally per call. | `src/domain/boardCutPlan.ts:84,118,157` | Pass already-computed `build`/`metrics` into the helpers. |
| **P3** | ⊘ | `previewPattern` regenerates fresh ids each render while the preview dialog is open. **Deferred:** a clean memo is awkward — the preview depends on the post-early-return `sliceCount` and hooks must precede the early return; gain is marginal (transient modal). Revisit when the dialog becomes its own component. | `src/components/BoardDesigner.tsx` | Deferred. |
| **P4** | ⊘ | Service worker network-first with an unbounded, manually-versioned cache. **Deferred:** cache-first for `/assets/` is sound but changes offline-update + eviction semantics; wants its own change + manual offline test, not this sweep. | `public/sw.js` | Deferred. |

---

## P2 — Accessibility

| ID | Status | Item | Location | Fix approach |
|----|:--:|------|----------|--------------|
| **A1** | ☑ | (`8b0537a`) Top-view shop objects are now focusable `role="button"` elements with `aria-label`/`aria-pressed`, Enter/Space select, and arrow-key nudge (Shift = coarse) clamped to the room. | `src/components/ShopPlanner.tsx` | Done. |
| **A2** | ◐ | (`8b0537a`) `PatternPreviewDialog` now handles Escape; both modals focus the dialog on open, restore focus to the trigger on close, and close on a direct backdrop click. **Remaining:** full Tab focus-trap (cycle within dialog). | `src/components/BoardDesigner.tsx` | Focus-trap still to do. |
| **A3** | ☑ | (`8b0537a`) Added `eslint-plugin-jsx-a11y` (recommended, as **errors**); cleared all 8 flagged issues. Guards regressions in CI going forward. | `eslint.config.js` | Done. |
| **A4** | ⊘ | `DraggableAssembledBoard` has no keyboard reorder/rotate. **Deferred:** involved (drag math + a documented rotate key + focus handling on an SVG `<g>` grid); wants its own change. `StripList` already has arrow-key reorder. | `src/components/BoardDesigner.tsx` | Deferred. |
| **A5** | ⊘ | `studio-tap` nests interactive controls. **Deferred:** jsx-a11y did not flag it and restructuring the tap-to-enlarge affordance is a UX change better made with the designer. | `src/components/BoardDesigner.tsx` | Deferred. |
| **A6** | ☑ | (`8b0537a`) Added a `prefers-reduced-motion: reduce` media query that neutralizes animations/transitions. (aria-label expansion folded into A1/A2 where relevant.) | `src/styles.css` | Done. |
| **A7** | ⊘ | Small-text colors near the AA threshold. **Deferred:** darkening brand colors is a design decision for the owner (a designer); flagged for a measured contrast pass rather than an arbitrary change. | `src/styles.css` | Deferred (design decision). |

---

## P1/P2 — CI/CD, build & infra security

| ID | Status | Item | Location | Fix approach |
|----|:--:|------|----------|--------------|
| **CI1** | ☑ | (`60abe3b`) Added `"typecheck": "tsc -b"` script + a CI Type-check step for fast feedback. | `package.json`, `ci.yml` | Done. |
| **CI2** | ☑ | (`60abe3b`) Added `test:coverage` + a v8 coverage gate on the domain/storage layer (lines 88 / stmts 85 / fns 82 / branches 70 — floors just below current); CI runs it. | `package.json`, `vite.config.ts`, `ci.yml` | Done. |
| **CI3** | ☑ | (`60abe3b`) `docker-verify` now starts the image and curls `/` + a deep link (SPA fallback) and asserts the security headers ship. **Note:** could not run locally — the sandbox blocks base-image pulls; validated by review + runs on GitHub runners. | `ci.yml` | Done (verified on CI). |
| **CI4** | ☑ | (`60abe3b`) Dropped the redundant second `corepack enable`. | `ci.yml` | Done. |
| **CI5** | ⊘ | `docker-publish` requests `id-token: write`. **Deferred:** `provenance`/`sbom` attestation may legitimately need it; can't confirm without a real publish run (publish only fires on push to `main`). Left as-is; verify against an actual publish, then drop if unused. | `ci.yml` | Needs a live publish run to confirm. |
| **CI6** | ☑ | Docker Scout advisory-only. **Decision:** keep advisory for this hobby/noncommercial project — Scout output informs without blocking releases. Documented here rather than changed. | `ci.yml` | Decided: keep advisory. |
| **SEC1** | ☑ | (`c21604a`) Added X-Content-Type-Options, X-Frame-Options, Referrer-Policy, and a CSP (allowlisting the Google Fonts the app @imports). | `nginx.conf` | Done. |
| **SEC2** | ☑ | (`c21604a`) Enabled gzip for text/JS/CSS/SVG/manifest. | `nginx.conf` | Done. |
| **SEC3** | ⊘ | Container runs as root. **Deferred:** `nginx-unprivileged` listens on 8080, rippling to `nginx.conf` listen, Dockerfile `EXPOSE`/healthcheck, `compose.yaml`, and the install docs' `-p` mapping; wants its own change so the port story stays consistent. | `Dockerfile` | Deferred (port ripple). |
| **SEC4** | ⊘ | Base images pinned by tag, not digest. **Deferred:** low value here — Dependabot's docker ecosystem already bumps tags weekly; digest pinning adds churn without a clear threat-model win for this project. | `Dockerfile` | Deferred. |
| **SEC5** | ☑ | (`551dbce`) `normalizeData` now returns only the known `AtlasData` keys (no `...data` spread), and `loadData` falls back to starter data when the stored JSON is not an object. Junk keys can no longer survive a load/import. Test asserts the exact key set. | `src/storage.ts` | Done. |

---

## P2 — Tooling / build config

| ID | Status | Item | Location | Fix approach |
|----|:--:|------|----------|--------------|
| **TOOL1** | ☑ | Every dependency pinned to `"latest"` — manifest carries zero version intent; grouped-`*` Dependabot can float majors. | `package.json` | Pin to the lockfile-resolved versions (React 19, TS 6.0.3, Vite 8.0.16, ESLint 10.5.0, Vitest 4.1.9, …). |
| **TOOL2** | ☑ | Node version stated three ways: `.nvmrc`=24, `engines.node`=">=20.19", `Dockerfile`=`node:22-alpine`. | `.nvmrc`, `package.json`, `Dockerfile` | Standardize on Node 24. |
| **TOOL3** | ☑ | `loadData`/`saveData` were untestable without a DOM env. **Resolved** with an in-memory `localStorage` stub (`vi.stubGlobal`) — more deterministic than jsdom and adds no dependency (jsdom 29 + vitest 4 didn't wire a working `localStorage`). `8bc115f` | `tests/storage.test.ts` | Done. `downloadData` (document/Blob/URL) still needs coverage → TEST3. |
| **TOOL4** | ☐ | `tsconfig.app.json` lacks `composite: true` though referenced as a project. | `tsconfig.app.json` | Add `composite: true`. |
| **TOOL5** | ☐ | No formatter config despite multi-file TS/MD and a contributor workflow. | repo root | Add `.editorconfig` (+ optional Prettier). |

---

## P2 — Repo hygiene & dead code

| ID | Status | Item | Location | Fix approach |
|----|:--:|------|----------|--------------|
| **HYG1** | ☑ | Dead file — `SliceOrderList` imported nowhere (~111 lines). | `src/components/SliceOrderList.tsx` | Delete. |
| **HYG2** | ☑ | Dead prop/branch — `WoodLibraryEditor.onUse` never passed by its only caller. | `src/components/WoodLibraryEditor.tsx` | Remove `onUse` + its button branch + dead CSS. |
| **HYG3** | ☑ | Vestigial `selectedSlice` state (only ever `0`). | `src/components/BoardDesigner.tsx` | Remove state + clamp + prop threading. |
| **HYG4** | ☑ | `CutStage` declares `'stock-prep'`/`'surface'` members never produced. | `src/domain/boardCutPlan.ts:5` | Remove unused union members. |
| **HYG5** | ☑ | `test-results/.last-run.json` tracked + not gitignored (churns every run; committed "passed" artifact). | `test-results/`, `.gitignore` | `git rm --cached`; add `test-results/` to `.gitignore`. |
| **HYG6** | ☑ | `.gitignore` `claude/*` matches nothing (dir is `.claude/`); dead `agents/*`. | `.gitignore` | Fix to `.claude/settings.local.json`; drop dead pattern. |
| **HYG7** | ☑ | `.dockerignore` lists both `.ds_store` and `.DS_Store`. | `.dockerignore` | Drop the lowercase dup. |
| **HYG8** | ☑ | (`f9aa322`) Extracted `toBoardFeet`/`nonNegative`/`sum`/`clampAngle` (+ the angle-only generic `clamp`) into `src/domain/units.ts`; three modules now import them. | `src/domain/units.ts` | Done. |
| **HYG9** | ⊘ | Duplicated UI `Field`/`format` helpers. **Deferred:** the three `Field`s have subtly different props (number vs text, min handling); a shared component is a UI refactor better verified in the running app than by build alone. Lower value than the domain dedup. | `src/components/*` | Deferred. |
| **HYG10** | ⊘ | Near-duplicate `useContainerWidth`/`useElementSize` hooks. **Deferred:** small polish; both work, and unifying touches live ResizeObserver wiring best checked at runtime. | `src/components/*` | Deferred. |
| **HYG11** | ☑ | Stale dated review committed as a tracked doc. | `docs/reviews/REVIEW-2026-06-24-develop.md` | Replaced by this living tracker. |
| **HYG12** | ☐ | Pervasive over-commenting (generated-code tell). | `src/components/BoardDesigner.tsx`, `src/components/board/*` | Trim self-evident comments opportunistically. |
| **HYG13** | ☑ | `.claude/settings.local.json` tracked (per-developer local file). | `.claude/` | Untrack + gitignore. |

---

## P2 — Documentation drift

| ID | Status | Item | Location | Fix approach |
|----|:--:|------|----------|--------------|
| **DOC1** | ☑ | (`233923b`) PRODUCT_PLAN BOARD-015 now lists the seven shipped presets; only seeded-mosaic remains "next". | `docs/plans/PRODUCT_PLAN.md` | Done. |
| **DOC2** | ☑ | (`b5debab`) Offsets now derive from `PRESET_STRIP_WIDTH` (no hard-coded `20`/`40`); doc marked resolved. True brick-and-mortar still needs composite panels (BOARD-008). | `src/domain/boardPatterns.ts`, `docs/plans/BRICK_PATTERN_CORRECTION.md` | Done. |
| **DOC3** | ☑ | (`233923b`) README "Current features" notes the installable, offline-capable PWA. | `README.md` | Done. |
| **DOC4** | ☑ | (`b5debab`) Renamed `docs/howTo/howToREADME.md` → `README.md`. | `docs/howTo/` | Done. |
| **DOC5** | ☑ | README features/accuracy reviewed against the shipped state; no remaining false claims. | `README.md` | Done. |

---

## Test coverage gaps (highest value first)

| ID | Status | Item | Fix approach |
|----|:--:|------|--------------|
| **TEST1** | ☐ | Live slice drag-reorder math (`DraggableAssembledBoard`: `targetFromX`/`orderWithKeyAt`/tap-vs-drag threshold) untested — largest untested logic. | Extract the pure math and unit-test it. |
| **TEST2** | ☐ | `usePinchPan` transform math untested. | Extract + test scale clamp / pan offset / single-pointer pass-through. |
| **TEST3** | ◐ | `storage.ts` branches: C1 regression + `saveData`/`loadData` round-trip + quota-error path now covered (`8bc115f`, `9c798de`). Still open: `downloadData`, `validColor` rejection, bad-JSON → `starterData` fallback. | Add remaining cases. |
| **TEST4** | ◐ | (`b110241`) `pickSpeciesPair`, `evenStripCount`, `fitPxPerMm` now covered (incl. fallback/clamp branches); domain branch coverage ~72%→~78%. Remaining: `calculateWoodUsage` per-species internals, `projectPolygon`/`pointsAttribute`. | Add the rest. |
| **TEST5** | ☐ | No CI container smoke test. | Covered by CI3. |
| **TEST6** | ☑ | Conservation fuzz loop only covered `trailingAngle: 0`. **Fixed:** added a 120-case angled fuzz alongside C2. `6b3df17` | Done. |
| **TEST7** | ☐ | Weak/tautological assertions. | `tests/storage.test.ts:62` (`toBeDefined`), `tests/boardGeometry.test.ts:47-48` (literal-vs-literal). |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-24 | Tracker opened; folded in `REVIEW-2026-06-24-develop.md` + fresh audit; baseline green (67 tests). |
| 2026-06-24 | P0 C1–C5 fixed test-first (`9c798de`,`6b3df17`,`2a4f1a9`,`8bc115f`,`ed2cb7a`); TEST6 + storage persistence coverage added; suite 67→76 green. |
| 2026-06-24 | Dead code removed (`555eadc`); repo hygiene + ignore rules (`8ffeb4a`); Node 24 reconcile (`fa7fe7c`); deps pinned off "latest" (`5d56f68`). |
| 2026-06-24 | Perf: memoized BoardDesigner pipeline (`13b583b`) and de-duped cut-plan recomputation (`ec699e5`); P3/P4 deferred with rationale. |
| 2026-06-24 | nginx security headers + gzip (`c21604a`); CI type-check, coverage gate, container smoke test, corepack cleanup (`60abe3b`); CI5/CI6/SEC3/SEC4 deferred/decided. |
| 2026-06-24 | a11y: jsx-a11y enforced + dialog focus/Escape + keyboard shop objects + reduced-motion (`8b0537a`); A2 partial, A4/A5/A7 deferred. |
| 2026-06-24 | Storage sanitize/guard (`551dbce`); domain helpers → units.ts (`f9aa322`); domain tests added, branch coverage ~72%→~78% (`b110241`); HYG9/HYG10 deferred. Suite 76→87 green. |
