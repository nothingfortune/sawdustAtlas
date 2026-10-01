# TODO — holistic review findings (2026-07-12)

Prioritized from a four-track review (domain, UI/state, infra/CI, docs/DX).
Severity: **P0** fix now · **P1** soon · **P2** when convenient.

## P0 — security & CI enforcement

- [x] **Fix Docker Scout on PRs/develop** — DONE by replacement: both Scout steps removed;
      a gating Trivy scan (fails on fixable CRITICAL/HIGH) now runs in `docker-verify` AND
      `docker-publish`, with SARIF uploaded to code scanning. No `continue-on-error` masking.
- [x] **Patch the published image** — image now runs `apk upgrade` at build time on a
      digest-pinned unprivileged base and is Trivy-gated (verified locally: 0 fixable
      CRITICAL/HIGH). The republish itself happens automatically on the next `develop` → `main`
      release.
- [ ] **Add required status checks** — `e2e` is now in both docker jobs' `needs:` (done).
      The ruleset itself (require `Validate`, `E2E`, `Docker verify` on `develop`/`main`) is a
      repo-admin change awaiting owner approval — see the PR description for the exact command.
- [x] **Coerce numbers in `normalizeAllowances`** (`src/storage.ts:309`) — currently spreads raw
      JSON; a string/`Infinity` allowance writes through to every board, renders NaN, and
      round-trips through export forever. Apply `finiteNumber` per field. (Found independently by
      two reviewers.)
- [x] **Stop the service worker caching non-OK responses** (`public/sw.js:16-32`) — `/assets/` is
      cache-first, so one transient 404 for a hashed chunk is served forever. Guard with
      `if (!response.ok) return response` in both handlers.

## P1 — correctness

- [x] **Imperial parsing drops negative signs** (`src/domain/lengthUnits.ts:109`) —
      `.replace(/-/g, ' ')` runs before matching, so `"-3"` parses as +3 (76.2 mm). Strip `-`
      only between digit groups / capture sign first. Add table-driven parse/format round-trip
      tests (module is at 51% branch coverage and feeds every imperial input).
- [x] **Legacy end-grain rip-panel migration loses thickness** (`src/storage.ts:206`) — a
      `{kind:'rip', construction:'end', thicknessMm:30}` panel migrates with default
      `sliceThickness: 45`, inflating volume/cost ~1.5×. Seed `sliceThickness: thickness`.
- [x] **Composite assembled thickness uses max, not min** (`src/domain/compositeBoard.ts:155`) —
      cropping treats overhang as waste in X/Y but `thicknessMm = Math.max(...)`; mixed-thickness
      composites report an impossible thickness and over-count finished volume.
- [x] **Shop-planner drags commit per pointermove** (`src/components/ShopPlanner.tsx:136-159`) —
      floods the 25-entry undo stack (undo-after-drag moves pixels at a time) and does a full
      localStorage serialize per move. Preview locally, commit once on pointer-up (see StripList).
- [x] **Coerce `ShopItem` fields in `normalizeShopItem`** (`src/domain/shopObjects.ts:74`) —
      `x/y/width/depth/rotation/id/...` pass through raw; hostile import breaks geometry and keys.
- [x] **Preserve corrupt saves before overwriting** (`src/storage.ts:14-23`) — unparseable
      localStorage is replaced by starter data, then the first autosave destroys the blob. Copy it
      to a recovery key (e.g. `sawdust-atlas:corrupt`) first.
- [x] **`brickAssembly` `halfCourseEdge` geometry mismatch** (`src/domain/brickAssembly.ts:126-145`)
      — summary length/volume ignore the halved edge courses; `conservationOk` is tautological.
      Not UI-wired yet; fix before wiring. Add tests for the `halfCourseEdge: true` path.

## P1 — infra & release hygiene

- [x] **Align Node majors** — CI/`.nvmrc` = 24, Dockerfile builds with `node:26-alpine`; the
      shipped bundle is produced by a Node CI never tests. Pick one (bump `.nvmrc` to 26 or pin
      Dockerfile to 24).
- [x] **Smoke-test the published image** — `docker-verify` never runs on main pushes; publish
      pushes an unverified multi-arch build to `latest`. Run the smoke test in the publish job
      (or gate publish on it).
- [x] **Tighten the security-header smoke test** (`.github/workflows/ci.yml:150`) — one grep
      matches any of three headers; CSP could vanish and CI stays green. Assert each header
      individually.
- [x] **Rotate/prune the SW cache** (`public/sw.js:1`) — static `sawdust-atlas-v1` name means old
      hashed assets accumulate forever. Stamp build hash into the cache name or prune on activate.
- [x] **Run nginx unprivileged** — base on `nginxinc/nginx-unprivileged:1.31-alpine` (UID 101,
      port 8080) and adjust EXPOSE/healthcheck/compose.
- [x] **Remove `claude.md` from `.gitignore:18`** — matches tracked `CLAUDE.md` on
      case-insensitive filesystems; anything that untracks it silently ignores the file.

## P2 — architecture drift & quality

- [x] Move material-cost math out of components into `src/domain/pricing.ts`
      (`BoardDesigner.tsx:81-88`, `composite/CompositeSummary.tsx:24-26`).
- [x] Stop `CrosscutOverlay` re-deriving offcut/trim positions it already receives via `metrics`
      (`BoardDesigner.tsx:507-529`).
- [x] Add `isSquareAngle()` to `units.ts` and use it in `pricing.ts`, `boardCutPlan.ts`,
      `boardBench.ts` (three inconsistent squareness tests today).
- [x] Replace NaN-unsafe `Math.max(0, x)` with `nonNegative` (`boardStock.ts:89-94`,
      `boardAngle.ts:21,45`); dedupe `EPSILON`, deg↔rad helpers, and `formatNumber` into `units.ts`.
- [x] Inject the id factory into `emptyRow()` (`compositeAssembly.ts:23`) — only nondeterminism
      in the domain layer. Delete or reconcile dead export `panelSourceLengthMm`
      (`compositeBoard.ts:254`).
- [x] Memoize heavy SVG consumers (`HowItsBuilt`, `BoardGallery` thumbs, `AssemblyDesk`) and stop
      recomputing `collectWorkspaceWarnings` per keystroke (`App.tsx:240`).
- [x] Wire a keyboard path for slice rotate/flip/reorder — `AssembledBoard.onToggleRow` exists but
      no call site passes it; the pop-out grid is pointer-only.
- [x] Fix `useModalDialog` focus-stealing on parent re-render (`useModalDialog.ts:10-26`) —
      stabilize `onClose` in a ref.
- [x] Debounce/skip per-pointermove saves in the geometry sketch; give "Clear" an undo
      (`GeometryCalculator.tsx:66-71`).
- [x] Split `BoardDesigner.tsx` (698 lines) and `ShopPlanner.tsx` (486) along the natural seams
      (`HowItsBuilt`, `CrosscutOverlay`, print cards).
- [x] Tests: cover `getFeedClearanceZones` rotation math (`shopGeometry.ts:48-58`, 0 tests),
      `workspaceWarnings` severity sort, `boardAllowances` single-strip `widthTrim` branch.
- [x] Add a tablet `hasTouch` Playwright project + a composite-board e2e smoke; today's "tap"
      tests use `page.mouse` on a desktop profile.
- [x] `.dockerignore`: add `tests/ e2e/ docs/ coverage/ test-results/ .github/ .githooks/` to keep
      the build context/layer cache stable. Digest-pin base images. Lint `public/sw.js` (currently
      outside eslint's `**/*.{ts,tsx}` glob).

## P2 — docs

- [x] Refresh README/START_HERE feature lists — composites, geometry + compound-angle calculators,
      pricing, imperial toggle are all missing.
- [x] Document `npm install -g corepack` for Node ≥ 25 (CLAUDE.md, build-from-source) and the
      `playwright install` step before `pnpm test:e2e`.
- [x] Add a License section to README (PolyForm Noncommercial) and a CHANGELOG or GitHub Releases;
      consider `v*` Docker tags. Mention that `nothingfortune` (GitHub) and `headlock0253`
      (Docker Hub) are the same publisher.
- [x] Mention the E2E job in CLAUDE.md/README CI descriptions; add typecheck/e2e to the PR
      template checklist; fix START_HERE "Saved locally" → "Saved in this browser".
