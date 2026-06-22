# SawdustAtlas Product Plan

Last updated: 2026-06-20

## Purpose

SawdustAtlas is a millimeter-first, local-first workspace for planning a woodworking shop and designing woodworking projects. It should replace generic commercial tools where they fail to represent real machines, working clearances, stock, grain, kerf, process waste, and the sequence used to build an object.

The first two product areas are:

1. Workshop layout planning.
2. Cutting board design, including edge-grain and end-grain construction.

The longer-term product connects designs to stock, cut plans, build sheets, shop assets, project photos, and selected Notion records without making Notion the source of truth for geometry.

## Status Legend

| Status | Meaning |
| --- | --- |
| Complete | Implemented and verified for the current scope. |
| Partial | Useful implementation exists, but important workflow or validation work remains. |
| Planned | Accepted product direction; not implemented. |
| Research | Valuable idea that needs validation before committing to an implementation. |

Priorities are `Now`, `Next`, `Later`, and `Research`.

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
| Deployment | Verified Docker/Nginx appliance, Vite LAN commands, PWA files | Add private HTTPS and shared persistence. |
| Quality | Repository-wide strict TypeScript, ESLint, Vitest | Add property, golden, migration, and interaction tests. |

## Feature Inventory

### Platform Foundation

| ID | Feature | Status | Priority | Acceptance criteria / TODO |
| --- | --- | --- | --- | --- |
| PLAT-001 | Strict TypeScript policy | Complete | Now | All TypeScript projects inherit `tsconfig.base.json`; build passes with unchecked-index and exact-optional checks. |
| PLAT-002 | Local autosave | Complete | Now | Changes persist across reloads in the same browser. |
| PLAT-003 | JSON backup and restore | Complete | Now | Full project data exports and imports; legacy board records are normalized. |
| PLAT-004 | Schema versioning and migrations | Planned | Next | Exported data includes a schema version; migrations are tested and never silently discard fields. |
| PLAT-005 | Undo and redo | Planned | Next | Geometry and editor actions can be undone/redone across both designers; autosave stores the resulting state. |
| PLAT-006 | Project duplicate, rename, archive, delete | Planned | Next | Destructive actions require confirmation; archived projects remain recoverable. |
| PLAT-007 | Search, tags, and recent projects | Planned | Later | Projects can be filtered by name, type, wood species, and tags. |
| PLAT-008 | Accessible keyboard operation | Partial | Next | Navigation is labeled; all canvas operations need keyboard equivalents and visible focus states. |

### Workshop Layout Planner

| ID | Feature | Status | Priority | Acceptance criteria / TODO |
| --- | --- | --- | --- | --- |
| SHOP-001 | Rectangular room with real dimensions | Complete | Now | Width and depth are stored in millimeters and rendered to scale. |
| SHOP-002 | Place and drag shop objects | Complete | Now | Machines, benches, storage, and doors can be added and moved within room bounds. |
| SHOP-003 | Edit object dimensions and rotation | Complete | Now | Width, depth, name, duplicate, delete, and 0/90/180/270-degree rotation are supported. |
| SHOP-004 | Working-clearance zones | Partial | Now | General and directional infeed/outfeed/side zones are visible and rotate with equipment; add distinct operator zones and collision warnings. |
| SHOP-005 | Custom object library | Partial | Now | Catalog and arbitrary placed objects support category, dimensions, color, and clearance; add reusable user presets, notes, photos, and directional clearance profiles. |
| SHOP-006 | Snap, guides, and precise placement | Planned | Next | Configurable grid snap, edge/center guides, coordinate entry, nudge controls, and alignment tools. |
| SHOP-007 | Collision and clearance warnings | Planned | Next | Distinguish physical overlap from working-zone conflicts; warnings identify involved objects. |
| SHOP-008 | Irregular rooms and wall segments | Planned | Next | Polygonal rooms, alcoves, columns, and interior walls preserve exact dimensions. |
| SHOP-009 | Doors, windows, and openings | Planned | Next | Wall-hosted openings include width, swing, sill height, and obstruction rules. |
| SHOP-010 | Utilities layer | Planned | Later | Electrical circuits, outlets, lighting, compressed air, and dust collection can be mapped independently. |
| SHOP-011 | Workflow zones | Planned | Later | Mark lumber intake, milling, assembly, finishing, storage, and walking paths. |
| SHOP-012 | Measurements and annotations | Planned | Next | Add dimension lines, notes, labels, and printable legends. |
| SHOP-013 | Print and image/PDF export | Planned | Next | Produce a dimensioned floor plan with selectable layers and a scale statement. |
| SHOP-014 | Multiple layout variants | Planned | Later | Compare alternatives without duplicating all room metadata and assets. |
| SHOP-015 | 3D visualization | Research | Research | Consider only after 2D geometry, heights, and collision semantics are trustworthy. |
| SHOP-016 | Angled shop view | Complete | Now | Project exact millimeter footprints, rotations, object heights, and directional feed zones into a selectable isometric review view. |

### Cutting Board Designer

| ID | Feature | Status | Priority | Acceptance criteria / TODO |
| --- | --- | --- | --- | --- |
| BOARD-001 | Edge-grain strip designer | Complete | Now | Species and strip widths produce a live, dimensioned preview and material estimate. |
| BOARD-002 | Pattern helpers | Complete | Now | Mirror, repeat, and reverse operate on strip sequences. |
| BOARD-003 | End-grain staged workflow | Complete | Now | Show first glue-up, kerf-aware crosscut plan, and board after the 90-degree turn. |
| BOARD-004 | Per-slice rotate and flip | Complete | Now | Normal, rotate, flip, and combined transformations remain distinct and persist. |
| BOARD-005 | Angled strip geometry | Complete | Now | Trailing angles affect cross-sections, stock requirements, final squaring, and visible patterns. |
| BOARD-006 | Material and waste conservation | Complete | Now | Rip wedges, end trim, kerf, offcut, and side squaring reconcile to source volume. |
| BOARD-007 | Invalid-geometry reporting | Complete | Now | Self-crossing strips and invalid dimensions produce visible errors rather than trusted output. |
| BOARD-008 | Multiple source glue-up panels | Planned | Next | Create multiple panel recipes, generate slices from each, and combine them in any final order. |
| BOARD-009 | Drag-to-reorder slices | Complete | Now | Final slices reorder via pointer drag, arrow keys, and tap-to-cycle, each carrying its rotate/flip/offset (its identity in the single-panel model). Pure `boardSlices` domain layer with boundary tests. Full value lands with multi-panel `BOARD-008`. |
| BOARD-010 | Custom wood library | Partial | Next | Shared wood-library module (own sidebar section) supports add/edit species, base color, grain accent, and price per board foot; texture, density, notes, and inventory references remain. |
| BOARD-011 | Improved wood appearance | Partial | Next | Current procedural textures distinguish species; add user photos, face/end-grain texture pairs, scale, and orientation. |
| BOARD-012 | Build allowances | Complete | Now | Separate rough and finished dimensions for jointing, planing, router-table surfacing, and final trimming; rough-stock board feet and cost reflect purchased stock. Allowances are now a shop-wide module (machine setup) shared by every board. |
| BOARD-013 | Cut list and bill of materials | Complete | Now | Generate rough stock, rip widths, crosscut and saw-pass counts, sequence, warnings, and per-species totals from one typed domain plan. |
| BOARD-014 | Printable build sheet | Complete | Now | Browser print path renders previews, finished/rough dimensions, numbered build steps, cut list, BOM, warnings, and an assumptions block; app chrome is stripped via `@media print`. |
| BOARD-015 | Pattern presets | Partial | Next | Stripe, checkerboard, brick, and chevron exist. Add third-bond, stepped-wave, seeded-mosaic, and distinct zig-zag recipes next; presets remain editable and dimensionally validated. Basket weave and 3D blocks require BOARD-008/composite blanks, while herringbone, pinwheel, and spiral require block-level 2D assembly. See `END_GRAIN_PATTERN_RESEARCH.md`. |
| BOARD-016 | Board features | Planned | Later | Juice grooves, handles, finger slots, feet, chamfers, edge profiles, and corner radii affect dimensions and steps. |
| BOARD-017 | Variant comparison | Planned | Later | Compare pattern, cost, waste, and finished-size alternatives side by side. |
| BOARD-018 | Shareable design links | Planned | Later | Encode or host versioned read-only designs without exposing private project data. |
| BOARD-019 | CNC/toolpath export | Research | Research | Export only after geometry, tool diameter, origin, and safety semantics are defined. |
| BOARD-020 | Multiple glueups | Planned | Research | allow for user to add or remove n amount of glueups, adding additional different boards, cross cuts with the final preview rendering final state, updating live |
| BOARD-021 | Slice Creation | Research | Research | Allow for user to create the slices of cutting board directly and generate the preview around that. Allow for addition of different shapes, (user can set angles of cuts etc etc) as alternate entry point. merges in with rest of design workflow |
| BOARD-022 | Printable Instructions based on design and cuts | Planned | Later | Provide user with A) interactive instructions based on the currently generated design or B) A printable version that accounts for their selections,  design, cuts wood choices that are all step by step |


### Shared Cut Planner and Stock

This engine will serve cutting boards first and later furniture, jigs, cabinetry, and general project designs. It must not copy approximate pixel-grid optimizers.

| ID | Feature | Status | Priority | Acceptance criteria / TODO |
| --- | --- | --- | --- | --- |
| CUT-001 | Typed cut-plan domain model | Planned | Next | Represent stock, required parts, quantity, material, grain direction, rotation rules, kerf, trim, defects, and placements. |
| CUT-002 | Cutting-board generated cut plan | Planned | Next | Board recipes emit their rip and crosscut requirements without duplicate math in the UI. |
| CUT-003 | Exact 1D optimizer | Planned | Next | Optimize linear rips/crosscuts with measured kerf, trim, quantities, and reusable offcuts; verify every placement. |
| CUT-004 | 2D sheet/board optimizer | Planned | Later | Use continuous millimeter geometry; honor grain, rotation, kerf, defects, and cutting method constraints. |
| CUT-005 | Optimizer result validator | Planned | Next | Independently prove bounds, non-overlap, quantities, kerf spacing, and material balance for every result. |
| CUT-006 | Multiple optimization goals | Planned | Later | Choose minimum stock, minimum waste, fewest cuts, preferred offcuts, or lower cost; show tradeoffs. |
| CUT-007 | Cut sequence | Planned | Later | Produce an executable sequence appropriate to rip fence, crosscut sled, track saw, or sheet breakdown. |
| CUT-008 | Stock inventory | Planned | Next | Track species/material, length, width, thickness, quantity, cost, location, moisture, and photos. |
| CUT-009 | Reusable offcuts | Planned | Next | Results create labeled offcuts that can be accepted into inventory or discarded. |
| CUT-010 | Defects and no-cut zones | Planned | Later | Mark knots, checks, live edge, splits, and reserved grain features on individual stock pieces. |
| CUT-011 | Printable labels and cut maps | Planned | Later | Print stock IDs, part labels, dimensions, grain arrows, and placement diagrams. printable via label printer or label sheet |

### Data, Tablet, and Deployment

| ID | Feature | Status | Priority | Acceptance criteria / TODO |
| --- | --- | --- | --- | --- |
| DATA-001 | Same-device browser persistence | Complete | Now | Local storage remains the fallback when no server is configured. |
| DATA-002 | LAN-accessible development server | Complete | Now | `pnpm dev:lan` binds to the private network and documents firewall constraints. |
| DATA-003 | Docker appliance configuration | Complete | Now | Compose build, health check, restart policy, local and LAN responses, PWA endpoints, updates, and recovery are verified and documented. |
| DATA-004 | Installable PWA shell | Partial | Next | Manifest, icon, and cache worker exist; verify installation and offline behavior under trusted HTTPS. |
| DATA-005 | Shared LAN persistence | Planned | Next | Computer and tablet read/write one versioned project store with backups and atomic writes. |
| DATA-006 | Conflict handling | Planned | Next | Detect concurrent edits; never silently overwrite another device's newer project revision. |
| DATA-007 | Private HTTPS | Planned | Next | Support a trusted local certificate or Tailscale Serve without public internet exposure. |
| DATA-008 | Automated backups | Planned | Next | Configurable scheduled snapshots with retention and tested restore. |
| DATA-009 | Optional authentication | Research | Research | Decide whether trusted-LAN access is sufficient before adding account complexity. |

### Notion Integration

| ID | Feature | Status | Priority | Acceptance criteria / TODO |
| --- | --- | --- | --- | --- |
| NOTION-001 | Integration mapping design | Planned | Later | Define which databases represent projects, stock, tools, photos, and build logs. |
| NOTION-002 | OAuth/server credential flow | Planned | Later | Tokens never ship in the browser bundle or exported project files. |
| NOTION-003 | Link project metadata | Planned | Later | Sync name, status, tags, notes, dates, costs, and canonical SawdustAtlas project ID. |
| NOTION-004 | Reference Notion photos | Planned | Later | Browse or attach selected images while handling expiring Notion asset URLs correctly. |
| NOTION-005 | Stock and tool sync | Research | Research | Validate whether Notion or SawdustAtlas should own each inventory field before implementing bidirectional sync. |
| NOTION-006 | Geometry ownership boundary | Planned | Later | Design geometry remains in SawdustAtlas; Notion receives summaries and links, not editable geometry blobs. |

### Tablet, UX, and Accessibility

| ID | Feature | Status | Priority | Acceptance criteria / TODO |
| --- | --- | --- | --- | --- |
| UX-001 | Tablet landscape layout | Partial | Now | Core screens fit common 10-inch tablets; complete real-device testing. |
| UX-002 | Touch-first manipulation | Planned | Next | Minimum hit targets, pointer capture, long-press alternatives, and no hover-only controls. |
| UX-003 | Portrait fallback | Planned | Later | Panels collapse into drawers without making canvas operations inaccessible. |
| UX-004 | Onboarding and sample projects | Planned | Next | Explain units, saving, backups, first room, first glue-up, kerf, and allowances. |
| UX-005 | Autosave and sync status | Partial | Next | Local saved state exists; add pending, failed, offline, synced, and conflict states. |
| UX-006 | Error and warning center | Planned | Next | Geometry, clearance, stock, migration, and sync issues link directly to corrective inputs. |
| UX-007 | Command history | Planned | Later | Show meaningful actions that support undo/redo and troubleshooting. |

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

### M0: Usable Prototype — Complete

- Dashboard and local project navigation.
- Basic shop planner.
- Edge-grain and staged end-grain board designer.
- Local save, JSON backup, strict TypeScript, Docker/PWA scaffolding.

### M1: Trustworthy Cutting Board Workshop — Now

- Finish multiple-panel and slice-reordering model (`BOARD-008`, `BOARD-009`). _Slice reorder done; multi-panel pending._
- Add rough/finished allowances (`BOARD-012`). _Done._
- Generate cut list and BOM (`BOARD-013`). _Done._
- Generate a printable build sheet (`BOARD-014`). _Done._
- Expand golden and property tests for angled and multi-panel designs.
- Complete touch and accessibility pass for board editing.

Exit criteria: a woodworker can design, validate, save, print, and build an edge- or end-grain board without manually reconstructing dimensions or waste outside the app.

### M2: Shared Cut Planner and Stock — Next

- Implement typed cut-plan model, exact 1D optimizer, and independent validator.
- Generate cutting-board operations from the board domain engine.
- Add stock inventory and reusable offcuts.
- Support measured tool/kerf profiles.

Exit criteria: every generated cut is traceable to a design requirement, fits verified stock, and reconciles material without approximation.

### M3: Serious Workshop Planner — Next

- Custom machines and directional clearances.
- Snap/guides, collision warnings, irregular rooms, wall openings, annotations, and print export.
- Add utilities and workflow layers after room geometry is stable.

Exit criteria: a printed plan can be measured against the physical shop and exposes access or clearance conflicts before equipment is moved.

### M4: Shared Tablet Appliance — Next

- Verified Docker deployment. _Done._
- Add shared LAN persistence, private HTTPS, backups, and conflict handling.
- Complete PWA installation and offline behavior.

Exit criteria: computer and tablet safely edit the same projects, survive restarts, and can restore from backup without manual JSON shuttling.

### M5: Notion Bridge — Later

- Secure OAuth integration.
- Project metadata, notes, selected photos, and build-log links.
- Inventory ownership decision before any bidirectional stock sync.

Exit criteria: Notion improves discovery and documentation without becoming required to open, edit, or recover a design.

### M6: Additional Woodworking Designers — Later

- General project parts and assemblies.
- Furniture/jig/cabinet workflows using the shared cut planner.
- Evaluate 3D and CNC only after 2D geometry and cut semantics are proven.

## Near-Term Ordered Backlog

1. `BOARD-008`: support multiple first glue-up panels.
2. `CUT-001`: establish the shared cut-plan types and validation contract.
3. `CUT-003` and `CUT-005`: exact 1D optimizer plus independent validator.
4. `DATA-005`: add shared LAN persistence before relying on tablet edits.
5. `SHOP-005` through `SHOP-009`: deepen the workshop planner.
6. `NOTION-001`: map databases and ownership boundaries before OAuth implementation.

## Open Decisions

- Should shared LAN persistence use SQLite behind a small API or versioned JSON files with atomic replacement?
- Should multiple end-grain source panels be independent recipes or reusable references to other board projects?
- Which rough-stock allowances should have defaults, and which must always be explicitly entered?
- Should stock inventory track individual physical boards, pooled quantities, or both?
- Which cut method constraints are required first: table-saw rip/crosscut, miter saw, bandsaw, or sheet-goods breakdown?
- Is a Tailscale-based private HTTPS setup acceptable for tablet installation, or is fully local certificate management required?
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
