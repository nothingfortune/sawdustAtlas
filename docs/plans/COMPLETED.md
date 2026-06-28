# SawdustAtlas — Completed Work

Companion to [PRODUCT_PLAN.md](PRODUCT_PLAN.md). Features verified complete (🟢) for
their current scope are recorded here so the plan itself can focus on what's left.

Split out of the product plan: 2026-06-28.

## Platform Foundation

| ID | Feature | Delivered |
| --- | --- | --- |
| PLAT-001 | Strict TypeScript policy | All TypeScript projects inherit `tsconfig.base.json`; build passes with unchecked-index and exact-optional checks. |
| PLAT-002 | Local autosave | Changes persist across reloads in the same browser. |
| PLAT-003 | JSON backup and restore | Full project data exports and imports; legacy board records are normalized. |

## Shop Layout Planner

| ID | Feature | Delivered |
| --- | --- | --- |
| SHOP-001 | Rectangular room with real dimensions | Width and depth are stored in millimeters and rendered to scale. |
| SHOP-002 | Place and drag shop objects | Machines, benches, storage, and doors can be added and moved within room bounds. |
| SHOP-003 | Edit object dimensions and rotation | Width, depth, name, duplicate, delete, and 0/90/180/270-degree rotation are supported. |
| SHOP-016 | Angled shop view | Project exact millimeter footprints, rotations, object heights, and directional feed zones into a selectable isometric review view. |

## Cutting Board Designer

| ID | Feature | Delivered |
| --- | --- | --- |
| BOARD-001 | Edge-grain strip designer | Species and strip widths produce a live, dimensioned preview and material estimate. |
| BOARD-002 | Pattern helpers | Mirror, repeat, and reverse operate on strip sequences. |
| BOARD-003 | End-grain staged workflow | Show first glue-up, kerf-aware crosscut plan, and board after the 90-degree turn. |
| BOARD-004 | Per-slice rotate and flip | Normal, rotate, flip, and combined transformations remain distinct and persist. |
| BOARD-005 | Angled strip geometry | Trailing angles affect cross-sections, stock requirements, final squaring, and visible patterns. |
| BOARD-006 | Material and waste conservation | Rip wedges, end trim, kerf, offcut, and side squaring reconcile to source volume. |
| BOARD-007 | Invalid-geometry reporting | Self-crossing strips and invalid dimensions produce visible errors rather than trusted output. |
| BOARD-009 | Drag-to-reorder slices | Final slices reorder via pointer drag, arrow keys, and tap-to-cycle, each carrying its rotate/flip/offset (its identity in the single-panel model). Pure `boardSlices` domain layer with boundary tests. |
| BOARD-012 | Build allowances | Separate rough and finished dimensions for jointing, planing, router-table surfacing, and final trimming; rough-stock board feet and cost reflect purchased stock. Allowances are a shop-wide module shared by every board. |
| BOARD-013 | Cut list and bill of materials | Generate rough stock, rip widths, crosscut and saw-pass counts, sequence, warnings, and per-species totals from one typed domain plan. |
| BOARD-014 | Printable build sheet | Browser print path renders previews, finished/rough dimensions, numbered build steps, cut list, BOM, warnings, and an assumptions block; app chrome is stripped via `@media print`. |

## Data, Tablet, and Deployment

| ID | Feature | Delivered |
| --- | --- | --- |
| DATA-001 | Same-device browser persistence | Local storage remains the fallback when no server is configured. |
| DATA-002 | LAN-accessible development server | `pnpm dev:lan` binds to the private network and documents firewall constraints. |
| DATA-003 | Docker appliance configuration | Public Docker Hub image, compose build, health check, restart policy, local and LAN responses, PWA endpoints, updates, and recovery are verified and documented. |

## Recently shipped (post-2026-06-25, not yet folded into feature IDs)

Work merged to `develop` after the last plan revision. These should be reconciled into
the feature inventory / milestones on the next plan pass.

| Area | What shipped | PR(s) |
| --- | --- | --- |
| Cutting board geometry | End-grain pattern fixes: chevron/zig-zag adaptive trailing angle so wafers stop going pointed; thin/pointed-face warnings; running-bond offsets resolved at render so they track edited strip widths; recipe re-skins existing strips instead of discarding them. | #29, plus follow-ups |
| Units / scaling | Imperial preview scaling under "Preston's button": board rulers + scale bar step in imperial; true-to-scale fit snaps to ½″; workshop floor grid snaps to whole feet for any spacing. | #30, #31 |
| Build provenance | In-app build badge (branch · build N · short SHA · env), git-stamped through Docker via compose/CI build args; `pnpm container` local preview. | #27, #32 |
| Quality / CI | Playwright e2e gated in CI on every PR (addresses the "E2E testing" review follow-up); range/invariant unit tests for scale + offset math. | #31 |
| Dev experience | Committed, auto-installed git hooks (`.githooks/` + `prepare`) that rebuild the local `:8080` preview on a `develop` merge. | #33 |
| Persistence | Schema bumped to v2 with a v1→v2 migration (running-bond offsets stored as cell fractions). Note: a structured/named migration framework is still pending — see `PLAT-004`. | #31 |
