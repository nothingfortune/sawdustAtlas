# SawdustAtlas Product Plan

Last updated: 2026-06-25

## Purpose

SawdustAtlas is a millimeter-first, local-first workspace for planning a woodworking shop and designing woodworking projects. It should replace generic commercial tools where they fail to represent real machines, working clearances, stock, grain, kerf, process waste, and the sequence used to build an object.

The first two product areas are:

1. Workshop layout planning.
2. Cutting board design, including edge-grain and end-grain construction.

The longer-term product connects designs to stock, cut plans, build sheets, shop assets, project photos, and selected Notion records without making Notion the source of truth for geometry.

## Status Legend

| Status | Meaning |
| --- | --- |
| 🟢 Complete | Implemented and verified for the current scope. |
| 🟡 Partial | Useful implementation exists, but important workflow or validation work remains. |
| ⚪ Planned | Accepted product direction; not implemented. |
| 🔵 Research | Valuable idea that needs validation before committing to an implementation. |

Priorities are `Now`, `Next`, `Later`, and `Research`.

## Current Planning Focus

The immediate goal is a **friend beta**: a small group can install SawdustAtlas from Docker Hub, open the starter projects, make a simple board or shop edit, export a backup, and recover that backup without needing developer help. Larger modeling work remains important, but it should not outrank first-run clarity, data safety, tablet usability, printability, and trustworthy shop math for the next pass. Near-term scope should favor practical woodworking calculations over capture-heavy features such as room scanning or media annotation unless repeated user testing shows those are blocking adoption.

## Product Principles

- **Accuracy before cleverness.** Never present approximate geometry or utilization as exact.
- **Millimeters are canonical.** Store and calculate dimensions in millimeters; round only for display.
- **Model the build process.** Show glue-ups, cuts, turns, trimming, waste, and assembly instead of only a final picture.
- **Local ownership.** Projects must remain usable without a cloud subscription or third-party service.
- **Tablet at the bench.** Core workflows must work on a touch device in landscape orientation.
- **Extensible domains.** Workshop geometry, board geometry, cut planning, persistence, and integrations remain separate modules.
- **Explain assumptions.** Surfacing, defects, wood movement, and machine calibration must be allowances, not hidden guesses.

## Current Architecture

| Area | Current implementation | Direction |
| --- | --- | --- |
| UI | React 19, Vite, TypeScript | Keep components focused on interaction and rendering. |
| Domain logic | `src/domain/boardGeometry.ts`, `src/domain/boardAllowances.ts` | Add independent shop and cut-plan engines. |
| Persistence | Browser local storage plus JSON import/export | Add versioned persistence adapters and shared LAN storage. |
| Deployment | Public Docker Hub image, Docker/Nginx appliance, Vite LAN commands, PWA files, CI publish pipeline | Verify private HTTPS, PWA install behavior, and shared persistence. |
| Quality | Repository-wide strict TypeScript, ESLint, Vitest, GitHub Actions CI, Docker image scans | Add property, golden, migration, interaction, and real-device smoke tests. |

## Feature Inventory

### Platform Foundation

|  | ID | Feature | Status | Priority | Acceptance criteria / TODO |
| --- | --- | --- | --- | --- | --- |
| 🟢 | PLAT-001 | Strict TypeScript policy | Complete | Now | All TypeScript projects inherit `tsconfig.base.json`; build passes with unchecked-index and exact-optional checks. |
| 🟢 | PLAT-002 | Local autosave | Complete | Now | Changes persist across reloads in the same browser. |
| 🟢 | PLAT-003 | JSON backup and restore | Complete | Now | Full project data exports and imports; legacy board records are normalized. |
| 🟡 | PLAT-004 | Schema versioning and migrations | Partial | Now | Exported data includes `schemaVersion`; add named migration steps for future schema changes and never silently discard fields. |
| ⚪ | PLAT-005 | Undo and redo | Planned | Next | Geometry and editor actions can be undone/redone across both designers; autosave stores the resulting state. |
| ⚪ | PLAT-006 | Project duplicate, rename, archive, delete | Planned | Next | Destructive actions require confirmation; archived projects remain recoverable. |
| ⚪ | PLAT-007 | Search, tags, and recent projects | Planned | Later | Projects can be filtered by name, type, wood species, and tags. |
| 🟡 | PLAT-008 | Accessible keyboard operation | Partial | Now | Navigation is labeled; all canvas operations need keyboard equivalents and visible focus states. |
 | General and directional infeed/outfeed/side zones are visible and rotate with equipment; add distinct operator zones and collision warnings. |
| 🟡 | SHOP-005 | Custom object library | Partial | Next | Catalog and arbitrary placed objects support category, dimensions, color, and clearance; add reusable user presets, notes, photos, and directional clearance profiles. |
| ⚪ | SHOP-006 | Snap, guides, and precise placement | Planned | Next | Configurable grid snap, edge/center guides, coordinate entry, nudge controls, and alignment tools. |
| ⚪ | SHOP-007 | Collision and clearance warnings | Planned | Next | Distinguish physical overlap from working-zone conflicts; warnings identify involved objects. |
| ⚪ | SHOP-008 | Irregular rooms and wall segments | Planned | Later | Polygonal rooms, alcoves, columns, and interior walls preserve exact dimensions. |
| ⚪ | SHOP-009 | Doors, windows, and openings | Cancelled | Later | Wall-hosted openings include width, swing, sill height, and obstruction rules. |
| ⚪ | SHOP-010 | Utilities layer | Planned | Later | Electrical circuits, outlets, lighting, compressed air, and dust collection can be mapped independently. |
| ⚪ | SHOP-011 | Workflow zones | Planned | Later | Mark lumber intake, milling, assembly, finishing, storage, and walking paths. |
| ⚪ | SHOP-012 | Measurements and annotations | Planned | Next | Add dimension lines, notes, labels, and printable legends. |
| ⚪ | SHOP-013 | Print and image/PDF export | Planned | Next | Produce a dimensioned floor plan with selectable layers and a scale statement. |
| ⚪ | SHOP-014 | Multiple layout variants | Planned | Later | Compare alternatives without duplicating all room metadata and assets. |
| 🔵 | SHOP-015 | 3D visualization | Research | Research | Consider only after 2D geometry, heights, and collision semantics are trustworthy. |
| 🟢 | SHOP-016 | Angled shop view | Complete | Now | Project exact millimeter footprints, rotations, object heights, and directional feed zones into a selectable isometric review view. |

### Cutting Board Designer

|  | ID | Feature | Status | Priority | Acceptance criteria / TODO |
| --- | --- | --- | --- | --- | --- |
| 🟢 | BOARD-001 | Edge-grain strip designer | Complete | Now | Species and strip widths produce a live, dimensioned preview and material estimate. |
| 🟢 | BOARD-002 | Pattern helpers | Complete | Now | Mirror, repeat, and reverse operate on strip sequences. |
| 🟢 | BOARD-003 | End-grain staged workflow | Complete | Now | Show first glue-up, kerf-aware crosscut plan, and board after the 90-degree turn. |
| 🟢 | BOARD-004 | Per-slice rotate and flip | Complete | Now | Normal, rotate, flip, and combined transformations remain distinct and persist. |
| 🟢 | BOARD-005 | Angled strip geometry | Complete | Now | Trailing angles affect cross-sections, stock requirements, final squaring, and visible patterns. |
| 🟢 | BOARD-006 | Material and waste conservation | Complete | Now | Rip wedges, end trim, kerf, offcut, and side squaring reconcile to source volume. |
| 🟢 | BOARD-007 | Invalid-geometry reporting | Complete | Now | Self-crossing strips and invalid dimensions produce visible errors rather than trusted output. |
| ⚪ | BOARD-008 | Composable board assemblies | In Progress | Next | Create multiple source panel recipes, generate reusable wafers/separators from each, and combine them into a final board assembly. This unlocks true brick-and-mortar, basket weave, borders, and user-built wafer workflows. See `BRICK_PATTERN_CORRECTION.md`. |
| 🟢 | BOARD-009 | Drag-to-reorder slices | Complete | Now | Final slices reorder via pointer drag, arrow keys, and tap-to-cycle, each carrying its rotate/flip/offset (its identity in the single-panel model). Pure `boardSlices` domain layer with boundary tests. Full value lands with composable board assemblies in `BOARD-008`. |
| 🟡 | BOARD-010 | Custom wood library | Partial | Next | Shared wood-library module (own sidebar section) supports add/edit species, base color, grain accent, and price per board foot; texture, density, notes, and inventory references remain. |
| 🟡 | BOARD-011 | Improved wood appearance | Partial | Later | Current procedural textures distinguish species; add user photos, face/end-grain texture pairs, scale, and orientation. |
| 🟢 | BOARD-012 | Build allowances | Complete | Now | Separate rough and finished dimensions for jointing, planing, router-table surfacing, and final trimming; rough-stock board feet and cost reflect purchased stock. Allowances are now a shop-wide module (machine setup) shared by every board. |
| 🟢 | BOARD-013 | Cut list and bill of materials | Complete | Now | Generate rough stock, rip widths, crosscut and saw-pass counts, sequence, warnings, and per-species totals from one typed domain plan. |
| 🟢 | BOARD-014 | Printable build sheet | Complete | Now | Browser print path renders previews, finished/rough dimensions, numbered build steps, cut list, BOM, warnings, and an assumptions block; app chrome is stripped via `@media print`. |
| 🟡 | BOARD-015 | Pattern presets | Partial | Next | Stripe, checkerboard, running-bond approximation, chevron, third-bond, zig-zag, and stepped-wave exist (seven presets). True brick-and-mortar requires BOARD-008 because it combines brick-course wafers with separate mortar strips. Add seeded-mosaic next; presets remain editable and dimensionally validated. Basket weave and 3D blocks require BOARD-008/composite blanks, while herringbone, pinwheel, and spiral require block-level 2D assembly. See `END_GRAIN_PATTERN_RESEARCH.md` and `BRICK_PATTERN_CORRECTION.md`. |
| ⚪ | BOARD-016 | Board features | Planned | Later | Juice grooves, handles, finger slots, feet, chamfers, edge profiles, and corner radii affect dimensions and steps. |
| ⚪ | BOARD-017 | Variant comparison | Planned | Later | Compare pattern, cost, waste, and finished-size alternatives side by side. |
| ⚪ | BOARD-018 | Shareable design links | Planned | Later | Encode or host versioned read-only designs without exposing private project data. |
| 🔵 | BOARD-019 | CNC/toolpath export | Research | Research | Export only after geometry, tool diameter, origin, and safety semantics are defined. |
| 🔵 | BOARD-020 | Reusable wafer workflow | Research | Research | Decide whether user-created wafers/source panels should be independent recipes, references to other board projects, or an alternate direct-slice workflow. This should converge with `BOARD-008`. |
| 🔵 | BOARD-021 | Direct slice creation | Research | Research | Explore an alternate entry point where users create slices directly, including custom cut angles and shapes, then generate the final preview and build plan from those slices. |
| ⚪ | BOARD-022 | Interactive build instructions | Planned | Later | Provide step-by-step instructions derived from the current design, cuts, wood choices, allowances, and warnings; printable output remains covered by `BOARD-014` and bench/tablet execution by `UX-008`. |
| ⚪ | BOARD-023 | Rip and stock requirement calculator | Planned | Next | Given finished size, strip widths or strip count, kerf, allowances, and slice plan, calculate the rough rip widths, required source-panel widths, purchased-stock width, and per-species board-foot requirements with explicit assumptions and units. |
| ⚪ | BOARD-024 | Angle and setup calculator | Planned | Next | Convert between target pattern geometry and shop setup values: trailing angle, effective strip length/width change, angle-induced offset, wedge loss, and related saw-setup numbers. Outputs must stay tied to the same domain assumptions used by board generation. |
| ⚪ | BOARD-025 | Setup cards and reference outputs | Planned | Next | Generate concise bench-side references for rip widths, angle settings, stop-block lengths, crosscut counts, and allowance assumptions for print and tablet viewing. This complements `BOARD-014` build sheets and should remain readable to non-CAD users. |


### Shared Cut Planner and Stock

This engine will serve cutting boards first and later furniture, jigs, cabinetry, and general project designs. It must not copy approximate pixel-grid optimizers.

|  | ID | Feature | Status | Priority | Acceptance criteria / TODO |
| --- | --- | --- | --- | --- | --- |
| ⚪ | CUT-001 | Typed cut-plan domain model | Planned | Next | Represent stock, required parts, quantity, material, grain direction, rotation rules, kerf, trim, defects, and placements. |
| 🟡 | CUT-002 | Cutting-board generated cut plan | Partial | Next | Board-specific cut plans exist; extract the shared contract so board recipes emit rip and crosscut requirements without duplicate math in the UI. |
| ⚪ | CUT-003 | Exact 1D optimizer | Planned | Next | Optimize linear rips/crosscuts with measured kerf, trim, quantities, and reusable offcuts; verify every placement. |
| ⚪ | CUT-004 | 2D sheet-goods optimizer and cutting list | Planned | Next | Generate exact panel layouts and printable cutting lists for plywood and other sheet goods using continuous millimeter geometry. Honor grain, rotation, kerf, trim, sheet sizes, labels, and method constraints; report unusable leftovers and reusable offcuts separately. |
| ⚪ | CUT-005 | Optimizer result validator | Planned | Next | Independently prove bounds, non-overlap, quantities, kerf spacing, and material balance for every result. |
| ⚪ | CUT-006 | Multiple optimization goals | Planned | Later | Choose minimum stock, minimum waste, fewest cuts, preferred offcuts, or lower cost; show tradeoffs. |
| ⚪ | CUT-007 | Cut sequence | Planned | Later | Produce an executable sequence appropriate to rip fence, crosscut sled, track saw, or sheet breakdown. |
| ⚪ | CUT-008 | Stock inventory | Planned | Next | Track species/material, length, width, thickness, quantity, cost, location, moisture, and photos. |
| ⚪ | CUT-009 | Reusable offcuts | Planned | Next | Results create labeled offcuts that can be accepted into inventory or discarded. |
| ⚪ | CUT-010 | Defects and no-cut zones | Planned | Later | Mark knots, checks, live edge, splits, and reserved grain features on individual stock pieces. |
| ⚪ | CUT-011 | Printable labels and cut maps | Planned | Later | Print stock IDs, part labels, dimensions, grain arrows, and placement diagrams. printable via label printer or label sheet |
| 🔵 | CUT-012 | Material-first planning | Research | Research | Explore workflows where the user starts from available stock, offcuts, defects, and shop constraints, then sees feasible board or project options before committing to new material. |
| ⚪ | CUT-013 | Finished-product cost accounting | Planned | Next | Track purchased-stock cost, consumed-stock cost, reusable-offcut value, discarded-waste value, hardware/labor add-ons, and finished-product cost with explicit definitions so users can see what the project actually cost to build and what assumptions were used. |
| ⚪ | CUT-014 | Material and cost reconciliation totals | Planned | Next | Every cut plan must show source total, finished-parts total, kerf/trim/waste total, reusable-offcut total, and reconciliation remainder within tolerance. Cost views must likewise reconcile purchased cost, retained offcut value, waste cost, and finished-product cost so estimates can be sanity-checked. |

### Data, Tablet, and Deployment

|  | ID | Feature | Status | Priority | Acceptance criteria / TODO |
| --- | --- | --- | --- | --- | --- |
| 🟢 | DATA-001 | Same-device browser persistence | Complete | Now | Local storage remains the fallback when no server is configured. |
| 🟢 | DATA-002 | LAN-accessible development server | Complete | Now | `pnpm dev:lan` binds to the private network and documents firewall constraints. |
| 🟢 | DATA-003 | Docker appliance configuration | Complete | Now | Public Docker Hub image, compose build, health check, restart policy, local and LAN responses, PWA endpoints, updates, and recovery are verified and documented. |
| 🟡 | DATA-004 | Installable PWA shell | Partial | Next | Manifest, icon, and cache worker exist; verify installation and offline behavior under trusted HTTPS. |
| ⚪ | DATA-005 | Shared LAN persistence | Planned | Next | Computer and tablet read/write one versioned project store with backups and atomic writes. |
| ⚪ | DATA-006 | Conflict handling | Planned | Next | Detect concurrent edits; never silently overwrite another device's newer project revision. |
| ⚪ | DATA-007 | Private HTTPS | Parking Lot | Next | Support a trusted local certificate or Tailscale Serve without public internet exposure. |
| ⚪ | DATA-008 | Automated backups | Planned | Next | Configurable scheduled snapshots with retention and tested restore. |
| 🔵 | DATA-009 | Optional authentication | Research | Research | Decide whether trusted-LAN access is sufficient before adding account complexity. |

### Notion Integration - Cancelled

|  | ID | Feature | Status | Priority | Acceptance criteria / TODO |
| --- | --- | --- | --- | --- | --- |
| ⚪ | NOTION-001 | Integration mapping design | Cancelled | Later | Define which databases represent projects, stock, tools, photos, and build logs. |
| ⚪ | NOTION-002 | OAuth/server credential flow | Cancelled | Later | Tokens never ship in the browser bundle or exported project files. |
| ⚪ | NOTION-003 | Link project metadata | Cancelled | Later | Sync name, status, tags, notes, dates, costs, and canonical SawdustAtlas project ID. |
| ⚪ | NOTION-004 | Reference Notion photos | Cancelled | Later | Browse or attach selected images while handling expiring Notion asset URLs correctly. |
| 🔵 | NOTION-005 | Stock and tool sync | Cancelled | Research | Validate whether Notion or SawdustAtlas should own each inventory field before implementing bidirectional sync. |
| ⚪ | NOTION-006 | Geometry ownership boundary | Cancelled | Later | Design geometry remains in SawdustAtlas; Notion receives summaries and links, not editable geometry blobs. |

### Tablet, UX, and Accessibility

|  | ID | Feature | Status | Priority | Acceptance criteria / TODO |
| --- | --- | --- | --- | --- | --- |
| 🟡 | UX-001 | Tablet landscape layout | Partial | Now | Core screens fit common 10-inch tablets; complete real-device testing. |
| 🟡 | UX-002 | Touch-first manipulation | Partial | Now | Coarse-pointer hit targets and some drag controls exist; complete pointer capture, long-press alternatives, and no hover-only controls. |
| 🟡 | UX-003 | Portrait fallback | Partial | Later | Panel drawers exist; verify that portrait layouts keep canvas operations accessible. |
| 🟡 | UX-004 | Onboarding and sample projects | Partial | Now | Starter projects are preloaded and linked from Home; add a fuller first-run walkthrough for units, saving, backups, kerf, and allowances. |
| 🟡 | UX-005 | Autosave and sync status | Partial | Now | Browser-local saved state and export affordance exist; add pending, failed, offline, synced, and conflict states. |
| ⚪ | UX-006 | Error and warning center | Planned | Now | Geometry, clearance, stock, migration, and sync issues link directly to corrective inputs. |
| ⚪ | UX-007 | Command history | Planned | Later | Show meaningful actions that support undo/redo and troubleshooting. |
| ⚪ | UX-008 | Tablet build mode | Planned | Later | Provide a bench-friendly, touch-first execution view with step checklist, current cut or setup, large dimensions, warnings, labels, and project progress. |

## Accuracy and Validation Requirements

The following are release requirements for any feature that reports dimensions, stock, waste, utilization, or cost:

1. Inputs and outputs have explicit units.
2. Internal calculations do not round intermediate values.
3. Every optimizer result has an independent validator.
4. Material accounting reconciles source, finished parts, kerf, trim, defects, and reusable offcuts within a documented tolerance.
5. Invalid, impossible, or underspecified designs produce errors or warnings, not fabricated results.
6. Cost estimates identify whether they use purchased stock, consumed stock, or finished-part volume.
7. Machine-specific values such as kerf are user-calibrated profiles, not global magic constants.
8. Tests cover exact boundaries, just-under/just-over boundaries, zero values, large values, decimals, rotations, and invalid geometry.
9. Property tests exercise invariants across broad generated input sets.
10. Golden fixtures compare important real-world plans against hand-verified calculations.

## Milestones

### M0: Usable Prototype - Complete

- Dashboard and local project navigation.
- Basic shop planner.
- Edge-grain and staged end-grain board designer.
- Local save, JSON backup, strict TypeScript, Docker/PWA scaffolding.

### M1: Friend Beta Appliance - Now

- Public Docker Hub install path. _Done._
- Starter workshop and cutting-board projects visible from Home. _Done._
- Browser-local save state and top-level export affordance. _Done._
- Schema version stamped into exports. _Partial: named migration steps still needed._
- Real-device tablet landscape smoke test.
- Backup export/import restore smoke test across two browsers.
- First-run copy for local-only data ownership, backup expectations, units, kerf, and allowances.
- Basic warning hub for import, geometry, and storage problems.

Exit criteria: a non-developer friend can install from Docker Hub, open the app, understand that data is browser-local, edit a starter project, export a backup, restore it, and report issues without losing work.

### M2: Trustworthy Cutting Board Workshop - Next

- Finish composable board assemblies and slice-reordering model (`BOARD-008`, `BOARD-009`). _Slice reorder done; source-panel/wafer assembly pending._
- Add rough/finished allowances (`BOARD-012`). _Done._
- Generate cut list and BOM (`BOARD-013`). _Done._
- Generate a printable build sheet (`BOARD-014`). _Done._
- Add practical shop-math helpers for rip sizing, angle setup, and bench-side reference output (`BOARD-023`, `BOARD-024`, `BOARD-025`).
- Expand golden and property tests for angled and multi-panel designs.
- Complete touch and accessibility pass for board editing.

Exit criteria: a woodworker can design, validate, save, print, and build an edge- or end-grain board without manually reconstructing dimensions or waste outside the app.

### M3: Shared Cut Planner and Stock - Next

- Implement typed cut-plan model, exact 1D optimizer, and independent validator.
- Generate cutting-board operations from the board domain engine.
- Add sheet-goods layout and printable cutting lists (`CUT-004`).
- Add stock inventory and reusable offcuts.
- Add finished-product cost accounting and reconciliation totals (`CUT-013`, `CUT-014`).
- Support measured tool/kerf profiles.

Exit criteria: every generated cut is traceable to a design requirement, fits verified stock, and reconciles material without approximation.

### M4: Serious Workshop Planner - Next

- Custom machine presets and directional clearance profiles.
- Snap/guides, collision warnings, annotations, and print export.
- Irregular rooms, wall openings, utilities, and workflow layers after rectangular-room interaction is trusted.

Exit criteria: a printed plan can be measured against the physical shop and exposes access or clearance conflicts before equipment is moved.

### M5: Shared Tablet Appliance - Next

- Verified Docker deployment. _Done._
- Add shared LAN persistence, private HTTPS, backups, and conflict handling.
- Complete PWA installation and offline behavior.

Exit criteria: computer and tablet safely edit the same projects, survive restarts, and can restore from backup without manual JSON shuttling.

### M6: Notion Bridge - Cancelled

- Secure OAuth integration.
- Project metadata, notes, selected photos, and build-log links.
- Inventory ownership decision before any bidirectional stock sync.

Exit criteria: Notion improves discovery and documentation without becoming required to open, edit, or recover a design.

### M7: Additional Woodworking Designers - Later

- General project parts and assemblies.
- Furniture/jig/cabinet workflows using the shared cut planner.
- Evaluate 3D and CNC only after 2D geometry and cut semantics are proven.

## Research-Derived Parking Lot

These items came from the 2026-06-24 comparison pass against cutting-board apps, cut-list optimizers, floor-planning tools, maker assembly tools, and material-aware woodworking research. They are parked here so they can influence the roadmap without interrupting the current friend-beta focus.

| Research item | Plan home | Why it matters | Next action |
| --- | --- | --- | --- |
| 1. Warning center + fix links | `UX-006`, `SHOP-007`, `BOARD-007`, `CUT-005` | Keeps geometry, stock, import, storage, and clearance problems visible and correctable instead of scattered across separate screens. | Start with a basic app-wide warning list that links to the project, board input, shop object, or import action that caused each issue. |
| 2. Stock and offcut inventory | `CUT-008`, `CUT-009`, `CUT-010`, `NOTION-005` | Lets the app answer whether a design can be built from available material, purchased stock, or reusable offcuts. | Define the first stock record shape: species/material, dimensions, quantity, cost, location, moisture, notes, photos, and defect/no-cut zones. |
| 3. Sheet-goods cutting lists | `CUT-004`, `CUT-005`, `CUT-011` | Many real woodworking jobs start with plywood or MDF, and users expect a panel cut diagram plus a believable list they can take to the saw. | Define the first sheet-goods scope around rectangular parts, grain direction, kerf, trim, sheet sizes, labeled cuts, and validator-backed layout reconciliation. |
| 4. Cost and waste realism | `CUT-013`, `CUT-014`, `BOARD-013` | Woodworkers need to know whether the finished product price, scrap, and leftovers make sense, not just the nominal board-foot total. | Add a shared accounting vocabulary for purchased stock, consumed stock, reusable offcuts, discarded waste, finished-part value, and tolerance-based reconciliation. |
| 5. Shop layout precision tools | `SHOP-006`, `SHOP-012`, `SHOP-013` | Makes the workshop planner usable for real equipment placement, not just approximate visual arrangement. | Add grid snap, nudge, coordinate entry, dimension lines, annotations, and print/export acceptance criteria before expanding room geometry. |
| 6. Clearance and collision intelligence | `SHOP-004`, `SHOP-007`, `SHOP-010`, `SHOP-011` | SawdustAtlas can beat generic room planners by modeling machine envelopes, infeed/outfeed, operator zones, utility conflicts, and workflow paths. | Separate physical overlap warnings from working-zone warnings, then identify the conflicting objects and clearance type. |
| 7. Board assembly recipes | `BOARD-008`, `BOARD-015`, `BOARD-020`, `BOARD-021` | Unlocks true brick-and-mortar, basket weave, borders, wafers, separators, and other patterns that a single source panel cannot represent. | Decide whether source panels/wafers are independent recipes, references to other board projects, or both. |
| 8. Tablet build mode | `BOARD-022`, `UX-001`, `UX-002`, `UX-008` | Turns a finished design into a bench-side execution workflow with fewer measurement mistakes and less paper shuffling. | Prototype a read-only build checklist view with large measurements, current operation, warning callouts, and completion state. |
| 9. Material-first design | `CUT-008`, `CUT-009`, `CUT-010`, `CUT-012` | Supports the woodworker who starts with actual stock or scrap and wants feasible designs, not only a shopping list for ideal material. | Research a stock-first flow that filters or adapts board/project options based on selected inventory and defects; keep XR/AR optional and later. |
| 10. Practical board math and setup helpers | `BOARD-023`, `BOARD-024`, `BOARD-025` | Gives woodworkers the exact rip widths, angle numbers, and setup references they still often compute on paper, which is a better near-term fit than capture/documentation-heavy features. | Define the first calculator set around finished-to-rough conversion, kerf-aware rip sizing, angle/offset conversion, and a simple printable setup card. |

## Review Follow-Ups

These recommendations came from the 2026-06-24 end-of-develop review pass. They are not all defects; several are product and release-hardening tasks that should be handled before broader beta use.

| Area | Priority | Recommendation | Why it matters | Next action |
| --- | --- | --- | --- | --- |
| Backup restore | Now | Keep hardening import normalization and user-facing restore flow. | Browser-local data is the current source of truth, so restore failures are trust failures. | Add migration fixtures for realistic exported files from older app states, including partial records, missing libraries, and malformed nested arrays. |
| Import safety | Now | Make destructive import state explicit. | Import currently replaces local projects; users need confidence before overwriting browser-local work. | After import, show a success state with project counts, replacement warning, and a prompt to export the new workspace backup. |
| Warning center | Now | Centralize "safe, saved, wrong, or ready to build" status. | Geometry, storage, backup, stock, and clearance issues are currently spread across screens. | Start with app-wide warnings for import/storage status, board geometry errors, missing wood references, and shop clearance conflicts. |
| E2E testing | Next | Add a repeatable browser smoke path after the local Playwright/tooling issue is resolved. | Lint, unit tests, and build pass, but they do not prove the friend-beta flows work in a browser. | Create a minimal smoke suite for Home, starter board, starter shop, export backup, import backup, print build sheet, and tablet landscape layout. |
| Package tooling | Next | Decide whether to rely on Corepack/pnpm only or document the repo's direct local-binary fallback. | On Windows, `pnpm` may not be on PATH even when Corepack is available; this can confuse contributors. | Update developer docs with `corepack pnpm ...` commands and troubleshooting for missing shims or optional native packages. |
| Dependency policy | Next | Replace broad `latest` dependency ranges with intentional update cadence. | `latest` can shift Vite, TypeScript, ESLint, and React behavior between installs, making support harder for a local appliance. | Pin direct dependencies or use compatible ranges, then let Dependabot propose controlled updates. |
| Docker install | Next | Treat Docker as the appliance path, not necessarily the only try-it path. | Docker is reproducible, but Docker Desktop is unfamiliar to many non-technical users. | Add a hosted/static demo option for browser-local evaluation, while keeping Docker for LAN/tablet appliance use. |
| Local persistence | Next | Decide the first shared persistence backend before adding more sync UI. | Tablet and desktop currently have separate browser stores, which is clear but limiting. | Choose between SQLite behind a small local API and atomic versioned JSON files; document conflict and backup semantics before implementation. |
| Accessibility | Next | Add keyboard and screen-reader acceptance criteria to canvas-like interactions. | The app has many drag, drawer, and visual controls that unit tests do not validate. | Define keyboard paths for moving shop objects, editing board strips, selecting slices, opening drawers, and dismissing modals. |
| Print/export QA | Next | Add golden manual checks for build sheets and shop plans. | Printed output is part of the "take it to the bench" promise. | Maintain a short checklist for print preview: assumptions visible, dimensions legible, warnings included, app chrome hidden, and scale statement present. |
| Release confidence | Later | Add a friend-beta release checklist separate from feature DoD. | Release readiness includes install, backup, docs, and recovery, not only code correctness. | Create a checklist covering Docker Hub pull, local run, tablet access, starter project edit, export/import restore, and issue-report instructions. |

## User-Reported Issues and Requests

These came from direct user feedback on 2026-06-25. They are logged here for triage only. No fix or scope commitment is implied by this section.

| Type | Area | Report | Likely plan home / note |
| --- | --- | --- | --- |
| Bug | Navigation / app shell | If the left nav is collapsed, the ruler in the icon jumps upward. | UI polish; likely app-shell/nav alignment issue. |
| UX issue | Workshop layout | Room size control was found, but too late: when `New` is selected, workshop dimensions should be the first thing shown instead of living at the bottom of a long scroll. | `SHOP-001`, `UX-004`, `UX-006`; primarily a control-ordering and discoverability problem for first-time layout setup. |
| Feature | Material/library metadata | Add an `available at` field for stores/vendors. | Likely `BOARD-010` and later `CUT-008`; could hold preferred store, SKU, aisle, or supplier note. |
| Feature | Cutting board preview controls | In the expanded preview under the 90-degree turn, allow slice rotation there too, not only on the finished board. | `BOARD-003`, `BOARD-004`; interaction expansion in the staged workflow. |
| Bug | End-grain randomize | In the end-grain cutting board flow, `Randomize` can produce results that feel excessively chaotic. | Likely `BOARD-002` / arrangement logic; needs a reproducible definition of acceptable randomization. |
| UX confusion | Cutting board arrangement tools | User does not understand what `Gradient` is trying to do. | Naming, affordance, preview, or docs problem; likely `UX-004` plus board-arrangement UX cleanup. |
| Bug | Navigation / app shell | The top-left icon should always take the user home. | App-shell navigation behavior; should be verified against current route behavior and expectations. |

## Near-Term Ordered Backlog

1. Friend-beta smoke test: Docker Hub install, starter shop, starter board, tablet landscape, export backup, import backup in a second browser.
2. `PLAT-004`: complete named migration steps and import validation for versioned backups.
3. `UX-002`, `PLAT-008`: touch and keyboard pass for board editing, slice controls, shop object movement, and visible focus.
4. `UX-004`, `UX-005`: first-run guidance for units, browser-local saving, backups, kerf, and allowances.
5. `UX-006`: basic warning center for geometry, import, storage, and backup issues.
6. `BOARD-023`, `BOARD-024`, `BOARD-025`: add rip sizing, angle/setup calculators, and bench-side reference outputs that reuse the same domain math as the board designer.
7. `BOARD-008`: support composable board assemblies with source panels, reusable wafers, separators, and final glue-up recipes.
8. `CUT-001`, `CUT-002`, `CUT-008`, `CUT-009`: establish shared cut-plan types, move cutting-board operations toward that contract, and define stock/offcut inventory records.
9. `CUT-003`, `CUT-005`, `CUT-013`, `CUT-014`: exact 1D optimizer, validator, and explicit material/cost reconciliation totals for believable estimates.
10. `CUT-004`, `CUT-011`: add sheet-goods layouts, cutting lists, and printable cut maps for plywood and similar materials.
11. `DATA-005`, `DATA-007`, `DATA-008`: shared LAN persistence, private HTTPS, and automated backups.
12. `SHOP-006`, `SHOP-007`, `SHOP-012`, `SHOP-013`: precision placement, collision warnings, annotations, and printable shop plans.

## Open Decisions

- Should shared LAN persistence use SQLite behind a small API or versioned JSON files with atomic replacement?
- Is friend beta explicitly browser-local, or should any tablet editing wait for shared LAN persistence?
- Should source panels/wafers be independent recipes, reusable references to other board projects, or both?
- Which rough-stock allowances should have defaults, and which must always be explicitly entered?
- Should stock inventory track individual physical boards, pooled quantities, or both?
- How should reusable offcuts affect project cost views: subtract immediately from waste, remain neutral until reused, or support both accounting modes?
- Which cut method constraints are required first: table-saw rip/crosscut, miter saw, bandsaw, or sheet-goods breakdown?
- Is a Tailscale-based private HTTPS setup acceptable for tablet installation, or is fully local certificate management required?
- Docker Hub release cadence is branch-gated: `develop` runs validation and local Docker builds only; `main` pushes publish `latest`, `main`, and `sha-...` tags. Decide later whether named immutable version tags should be added on top of this.
- Which Notion database currently holds projects, wood inventory, tools, and photos, and which fields are authoritative?

## Definition of Done

A feature is complete only when:

- Domain behavior and assumptions are documented.
- Strict TypeScript, lint, and relevant tests pass.
- Accuracy-sensitive outputs have independent validation and boundary tests.
- Existing saved projects migrate without data loss.
- Mouse, touch, and keyboard behavior are considered.
- Empty, loading, invalid, offline, and failure states are handled.
- Tablet landscape layout is verified for affected workflows.
- Export, print, and sync surfaces do not leak credentials or private data.
- The feature inventory and near-term backlog in this document are updated.
