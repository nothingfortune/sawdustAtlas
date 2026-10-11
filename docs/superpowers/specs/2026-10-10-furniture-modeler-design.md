# Furniture Modeler: Design Spec (Furniture Wave 1)

**Status:** Approved for implementation (furniture wave 1)
**Date:** 2026-10-10
**Scope:** Strategy Phase 4 (furniture modeler MVP) and Phase 5 (furniture instruction generation), plus the joinery-intent slice of Phase 6. Furniture becomes the second producer of the shared `InstructionPlan` built in [instruction platform wave 1](2026-10-10-instruction-platform-design.md).

## Sources

- **Holistic strategy** (`sawdust-atlas-holistic-strategy`): the design workspace, the canonical furniture project model, the shared instruction model, Phases 4 to 6, and the guardrails. Panelizer's canonical-panel-list pattern and WoodworkingShop's pure template engines are the interaction and architecture references.
- **Stress test**: C5 (per-domain view kinds), C6 (stable keys, snapshot-on-start), F7 (part marks), F11 (one warning model), F12 (defer instruction authoring).
- **Instruction platform spec, wave 1**: the contracts, the validator, readiness, build runs, and the steps preview this work plugs into.

Finding and decision ids (C5, F7, D3, and so on) refer to those documents. Furniture decisions are numbered FD1 onward.

## Summary

A woodworker picks a table or bookcase template, sizes it, adjusts parts in a 3D view or by typing numbers, declares how parts join, and gets a reconciled cut list with board feet and sheet counts plus generated build steps that use the same contracts, validator, readiness, and preview as cutting boards.

The project document is canonical: a list of rectangular parts, named parameters, relationships, joinery intent, and subassemblies. The resolved boxes, 2D drawings, 3D scene, parts list, and instruction plan are all derived from it on demand and never stored.

## Decisions

| Id | Decision | Rationale |
| --- | --- | --- |
| FD1 | Build furniture now, stacked on the unmerged instruction platform wave 1 | Requested by Alex. The strategy's order (prove the platform on boards first) is kept in substance: furniture touches the platform only through a generator and the existing validator, so a contract change found by board builds lands in one adapter. |
| FD2 | three.js with `@react-three/fiber`, no `drei`; the 3D viewport is lazy-loaded and optional | All MIT (licensing guardrail 1). `drei` pulls fonts and environment maps from CDNs that the CSP blocks and the offline promise cannot rely on. Lazy loading keeps the board and shop tools' bundle unchanged. |
| FD3 | Rectangular, axis-aligned parts only | Strategy: begin with rectangular stock and panels. Splayed legs (via `compoundAngle.ts`), curves, and arbitrary rotation are later. |
| FD4 | Named parameters with arithmetic expressions; relationships drive positions only | "Adjust any dimension and linked dimensions adjust, or throw an error" without a constraint solver. Sizes come only from what the woodworker entered or from expressions over parameters; positions come from literals or relationships. Impossible results are errors, never fabricated answers. |
| FD5 | The modeled size is the visible size; joinery adds reported cut allowances | Guardrail: joinery never silently alters finished dimensions. A tenon or dado makes the cut part longer, and the parts list shows the modeled size, each allowance with its reason, and the cut size. |
| FD6 | 2D projections (orthographic, isometric, exploded) are computed in the domain and drawn as SVG; WebGL is only the interactive viewport | Print and the bench must not depend on WebGL. The step visual uses the existing `scene-3d` view kind, which a renderer may draw as an SVG projection. Every editing action also works without the 3D view. |
| FD7 | Furniture projects live in `AtlasData.furniture` (localStorage), schema v3 | A project is small (tens of parts). The IndexedDB boundary stays wave 2 platform work. Project packages learn furniture after wave 1's package PRs merge. |
| FD8 | A "Furniture" sidebar section with a gallery and a designer, using today's in-memory view state | Wave 2's routes and Design, Plan, and Build modes absorb it later, as they will the board designer. |
| FD9 | Generated instructions are a read-only preview | Same as boards in wave 1. Split, merge, reorder, annotation, and camera authoring arrive with the platform's authoring wave for every domain (F12). |
| FD10 | Material is estimated, not nested | Board feet per species and a sheet count from area plus a stated waste factor. Nesting is the shared cut planner (CUT-001), later. |
| FD11 | The service worker precaches every build asset | The 3D chunk is lazy. Without precaching it, the first offline visit to the 3D view fails. |
| FD12 | Hardware reaches the plan as consumables in v1 | `ProjectRequirements` stays unchanged for boards. Hardware readiness becomes a structured requirement with wave 2 readiness. |

## Primary User and Jobs

The owner-builder from the platform spec. Jobs, in order of value:

1. Start from a template, set the overall size, and get a sensible, editable design.
2. Change one dimension and see every linked part follow, or see exactly why it cannot.
3. Say how parts join, and see what that means for each part's cut size.
4. Get a cut list, board feet, sheet count, hardware list, and cost without a spreadsheet.
5. Get build steps in the order a woodworker would actually work, checked by the same validator as boards.

## Architecture

```text
FurnitureProject (canonical, in AtlasData.furniture)
  │
  ├─ resolveFurniture ─→ ResolvedFurniture (boxes, evaluated parameters, issues)
  │      ├─ validateFurniture ─→ FurnitureIssue[] ─→ warning center
  │      ├─ joinery ─→ cut sizes, joint operations, hardware
  │      ├─ partsList ─→ cut list, board feet, sheets, cost
  │      ├─ projectDrawing ─→ SVG front, side, top, iso, exploded
  │      └─ 3D viewport (lazy, optional)
  │
  └─ generateFurniturePlan ─→ InstructionPlan ─→ validatePlan, readiness, build runs, steps preview
```

New modules. Domain modules are pure, deterministic, framework-free, and unit-tested.

```text
src/domain/furniture/
├── types.ts           contracts (merged first)
├── project.ts         defaults and the normalizer (merged first)
├── expressions.ts     expression parser and evaluator, parameter evaluation
├── geometry.ts        orientation, resolve, overlap, contact, bounds
├── relationships.ts   position solver used by resolve
├── joinery.ts         cut allowances, joint operations, hardware, joint checks
├── validation.ts      validateFurniture and furniture workspace warnings
├── partsList.ts       reconciled parts list, board feet, sheets, cost
├── projection.ts      orthographic, isometric, and exploded 2D drawings
└── templates/         table, workbench, desk, bookcase, base cabinet, wall cabinet

src/domain/instructions/furnitureInstructions.ts   furniture generator

src/components/furniture/
├── FurnitureGallery.tsx      gallery and new-project dialog
├── FurnitureDesigner.tsx     designer shell
├── PartsPanel.tsx, PartInspector.tsx, ParametersPanel.tsx
├── JointsPanel.tsx, SubassembliesPanel.tsx, FurnitureWarnings.tsx
├── DimInput.tsx              length or expression entry
├── FurnitureDrawing.tsx      SVG drawing from projectDrawing
├── FurnitureViewport.tsx     lazy wrapper with WebGL detection and fallback
├── FurnitureViewport3D.tsx   three.js scene (lazy chunk)
├── FurnitureCutList.tsx, FurnitureSteps.tsx, FurniturePrint.tsx
```

## Contract Rules

The contracts are `src/domain/furniture/types.ts`; the shared fixtures are `tests/fixtures/furniture.ts`.

1. **Millimeters at full precision.** No rounding in the domain.
2. **World axes.** x runs left to right seen from the front, y runs front to back, z runs up. The floor is z = 0. A part's `position` is the min corner (left, front, bottom) of its box.
3. **Orientation.** `PartOrientation` names the world axes of the part's length, width, and thickness in that order. For solid wood, length runs along the grain, so the grain axis is the first letter.
4. **Sizes never move.** Relationships drive positions only. Snapping, alignment, and distribution never resize a part. Joinery adds `CutAllowance` lines; it never edits the modeled size.
5. **Relationships never imply joinery**, and joinery never implies relationships. Two touching parts with no joint are reported, not guessed.
6. **Errors, not fabrications.** An expression that fails, a parameter cycle, a conflicting relationship, or an impossible joint produces a `FurnitureIssue`. The part that cannot resolve is left out of the resolved model, not placed somewhere plausible.
7. **Stable keys.** Plan keys derive from part, joint, subassembly, and parts-list-line identity, never from list positions.
8. **The clock and ids are inputs.** Domain functions never read the clock or generate random ids. Templates take `projectId` and `updatedAt`.
9. **Derived data is never stored.** Resolved boxes, drawings, the parts list, and plans are recomputed. Only the project document persists.
10. **Defaults are assumptions.** A value not entered by the woodworker (a default tenon thickness, the sheet waste factor, glue clamp time) is a named constant and surfaces with `source: 'assumption'` or in the parts list's `assumptions`.

## Module Specs

### `expressions.ts`

```ts
export function isValidParameterName(name: string): boolean
export function referencedNames(source: string): string[]
export function evaluateDim(value: DimExpr, scope: Readonly<Record<string, number>>): { ok: true; value: number } | { ok: false; code: 'expression-invalid' | 'unknown-parameter'; message: string }
export function evaluateParameters(parameters: readonly FurnitureParameter[]): { values: Record<string, number>; issues: FurnitureIssue[] }
```

- **Grammar.** Decimal numbers (`12`, `0.75`, `.5`), each optionally followed directly by a unit suffix `mm`, `cm`, or `in` (25.4 mm); parameter names; `+ - * /`; unary minus and plus; parentheses; `min(a, b, ...)` and `max(a, b, ...)`. Whitespace is ignored. Nothing else: no exponent, no other functions, no `eval` or `Function` (the CSP forbids them anyway).
- A literal number is returned unchanged. A string is parsed; a string holding only a number is a literal.
- Division by zero, a non-finite result, a syntax error, more than 200 characters, or nesting deeper than 32 is `expression-invalid`. An unknown name is `unknown-parameter`. Messages name the offending token in plain words.
- `evaluateParameters` evaluates in dependency order. A duplicate or invalid name is `duplicate-parameter` or `expression-invalid` on that parameter. A cycle is `parameter-cycle` on every member, and members are left out of `values`.

### `geometry.ts` and `relationships.ts`

```ts
export function orientedExtents(size: PartDims, orientation: PartOrientation): { sx: number; sy: number; sz: number }
export function faceAxis(face: BoxFace): Axis
export function facePlane(box: Box, face: BoxFace): number
export function overlapVolume(a: Box, b: Box): number
export interface Contact { axis: Axis; aFace: BoxFace; bFace: BoxFace; plane: number; area: number; rect: { u0: number; u1: number; v0: number; v1: number } }
export function contactBetween(a: Box, b: Box): Contact | null
export function partSurfaceAt(orientation: PartOrientation, face: BoxFace): 'end' | 'edge' | 'face'
export function boundsOf(boxes: readonly Box[]): Box | null
export function resolveFurniture(project: FurnitureProject, context: FurnitureContext): ResolvedFurniture
```

- Touching and overlap use a tolerance of 1e-6 mm. Two boxes touch when one face plane coincides with the other's opposite face plane and the contact rectangle has positive area. Edge or corner contact does not count.
- `resolveFurniture` evaluates parameters, then each part's size (any failure or a size ≤ 0 is an issue, `dimension-not-positive` with the field), then positions: literal or expression axes first, then relationships in dependency order. Parts that fail are absent from `parts`.
- `partSurfaceAt` says whether a world face of a part is its end (length axis), edge (width axis), or face (thickness axis). Joinery uses it to decide which dimension grows.
- **Relationships** (`relationships.ts`, called by resolve). `face`: the part's face plane equals the target face plane plus offset; both faces must share an axis. `center`: the part's center equals the target's center plus offset on that axis. `between`: the part is centered between two face planes on the axis. `distribute`: the parts are spaced with equal clear gaps between two planes, in array order. Each anchor face must lie on the relationship's axis.
- Each part axis may be driven by one relationship. A second is `relationship-conflict` (the first in array order wins). Unknown parts, self-reference, or a face on the wrong axis is `relationship-invalid`. A dependency cycle is `relationship-cycle`, and its members keep their stored positions on those axes. A relationship whose target failed to resolve leaves its part unresolved, with an issue saying why.
- Relationships never read or write sizes.

### `joinery.ts`

```ts
export function cutSizes(resolved: ResolvedFurniture): PartCutSize[]
export function jointOperations(resolved: ResolvedFurniture): JointOperation[]
export function jointHardware(resolved: ResolvedFurniture): HardwareLine[]
export function validateJoints(resolved: ResolvedFurniture): FurnitureIssue[]
```

| Kind | Cut allowance on `partId` | Operations | Hardware |
| --- | --- | --- | --- |
| `mortise-tenon` | `depth` on the engaged dimension | `tenon` on the part; `mortise` on the target (depth plus a stated clearance) | — |
| `loose-tenon` | — | `mortise` on both | loose tenons × count |
| `dowel` | — | `dowel-holes` on both (`drill`) | dowels × count |
| `dado`, `rabbet`, `groove` | `depth` on the engaged dimension | `dado`, `rabbet`, or `groove` on the target, width = the part's thickness | — |
| `pocket-screw` | — | `pocket-holes` on the part (`drill`) | pocket screws × count |
| `screw` | — | `pilot-holes` on the part (`drill`) | screws × count |
| `tabletop-fastener` | — | `fastener-slots` on the target | fasteners × count |
| `butt` | — | — | — |

- The engaged dimension is found from the contact between the two parts: the part's end engages length, its edge engages width. A joint whose parts do not touch is `joint-parts-not-touching`.
- Defaults (named constants, surfaced as assumptions): tenon thickness one third of the part's thickness, tenon depth bounded by the target's extent, dado depth one third of the target's thickness, dowel diameter about a third of the thinner part, counts sized to the contact length. Exact values are the implementer's call, documented in the module, and tested.
- `setupKey` groups operations with the same operation, tool, and settings so the generator can batch them.
- `validateJoints` reports: `joint-invalid` (missing or identical parts, a hardware part, glue on a tabletop fastener); `joint-parts-not-touching`; `joint-params-invalid` (a tenon thicker than its part, a stopped mortise or dado as deep as the target, a dowel too wide for the thinner part, a count below one); `cross-grain-glue` (two solid parts glued with their grain axes crossing in the contact plane over more than a stated width, so seasonal movement will crack the joint; a warning); `end-grain-glue` (a glue-only butt joint on end grain; a warning). Mortise-and-tenon, loose tenons, and dowels are exempt from the end-grain warning.

### `validation.ts`

```ts
export function validateFurniture(resolved: ResolvedFurniture, context: FurnitureContext): FurnitureIssue[]
export function furnitureWarnings(project: FurnitureProject, context: FurnitureContext): WorkspaceWarning[]
```

| Code | Severity | Rule |
| --- | --- | --- |
| everything in `resolved.issues` | as reported | expressions, parameters, sizes, relationships |
| `parts-collide` | error | two parts overlap and no joint connects them |
| `parts-overlap-at-joint` | warning | jointed parts overlap: model the visible size, joinery allowances are added for you |
| `part-unattached` | warning | a part touches others but belongs to no joint |
| `part-floating` | warning | a part touches nothing (projects with more than one part) |
| joint codes | as reported | from `validateJoints` |
| `material-missing` | error | a solid part with an unknown species, or a sheet part with an unknown sheet material |
| `sheet-thickness-mismatch` | warning | a sheet part's thickness differs from its material's |
| `part-exceeds-sheet` | error | a sheet part's cut size fits the sheet in no orientation allowed by its grain |
| `subassembly-invalid` | error | unknown part or child, a part in two subassemblies, a child in two parents, or a cycle |
| `duplicate-label` | warning | two parts share a non-empty bench label |

- Issues come out in a deterministic order that does not depend on array order where the input is a set.
- `furnitureWarnings` maps issues to `WorkspaceWarning` with ids `furniture:<projectId>:<code>:<subject>` and location `{ view: 'furniture', targetId: projectId, focusId: <first part id> }`. `collectWorkspaceWarnings` includes them, using the workspace woods and allowances.

### `partsList.ts`

```ts
export const SHEET_WASTE_FACTOR: number
export function partsList(resolved: ResolvedFurniture, context: FurnitureContext): FurniturePartsList
```

- One line per group of parts with the same kind, material, cut size, and panel spec. Lines are sorted deterministically (material, then role, then size).
- Solid rough size: thickness plus `jointing + planing`, width plus `ripAllowance`, length plus `lengthTrim`, from the shop-wide allowances.
- A solid part wider than `maxBoardWidth` is an edge-glued panel: `boards = ceil(cutWidth / maxBoardWidth)`, each board ripped to `cutWidth / boards` plus the rip allowance, and the panel trimmed by `widthTrim`. The line carries `panel`.
- Board feet come from rough volume through `toBoardFeet`. Cost is board feet times the species price.
- Sheets: `sheets = ceil(partArea × (1 + SHEET_WASTE_FACTOR) / sheetArea)`, labelled an estimate. Cost is sheets times the sheet price.
- Hardware is `jointHardware` plus hardware parts, merged by key.
- **Reconciliation invariant (tested):** every non-hardware resolved part appears in exactly one line, line quantities sum to the part count, and board feet are never below the cut volume's board feet.

### `templates/`

```ts
export const FURNITURE_TEMPLATES: readonly FurnitureTemplate[]
export function templateById(id: string): FurnitureTemplate | undefined
```

- Six templates: basic table, workbench, desk, bookcase, base cabinet, wall cabinet. Each is one file, built from parameters (the template's `TemplateParameter` names), expressions, relationships, joints, and subassemblies, so changing a parameter later re-flows the design. Values outside `[min, max]` are clamped.
- The result is an ordinary project. `templateId` is informational.
- Part ids are deterministic and readable (`leg-fl`, `apron-front`, `shelf-2`). Labels follow the bench-mark convention (L1 to L4, A1 to A4).
- **Tested:** at default values and at every corner of a min/max grid over each template's parameters, the project resolves with no issues, `validateFurniture` reports no errors, and the parts list reconciles.

### `furnitureInstructions.ts`: the furniture generator (Phase 5)

```ts
export const generateFurniturePlan: InstructionGenerator<FurnitureProject>
```

Phases, in order (a phase with no steps is omitted):

1. **Stock** (`stock`): one `select-stock` step per stock line. Solid stock lines come from the parts list's rough lines (StockLine per line, board feet from the parts list). Sheet goods are stock lines with the sheet's size and `boardFeet: 0`.
2. **Panels** (`panels`): per edge-glued panel part, rip boards (batch), glue up, a cure `wait`, and flatten. The flattened panel becomes that part's blank.
3. **Mill** (`mill`): joint and plane solid blanks to thickness, one batch step per species and target thickness.
4. **Cut to size** (`cut`): rip to width and crosscut to length, one batch step per setup (same width, or same length); sheet goods broken down per material. Every parts-list line's cuts are covered (`CutRef` per line and cut).
5. **Mark** (`mark`): mark every part with its label and reference faces, and the visible faces to keep clean.
6. **Joinery** (`joinery`): one batch step per `setupKey`, irreversible, with the joint's settings as `SetupValue`s and a critical test-cut check.
7. **Dry fit** (`dry-fit`): one per subassembly, then the final assembly.
8. **Sand** (`sand`): sand inside faces that become hard to reach after glue-up.
9. **Assembly** (`assembly`): per subassembly, children first then parents in project order, a `glue-clamp` step (if any joint closed there is glued) or an `assemble` step, each glue step followed by a cure `wait`; then the final assembly. Each joint closes in the lowest subassembly that contains both of its parts. Tabletop fasteners and screws close with `install` or `assemble` steps, never glue.
10. **Finish** (`finish`): apply finish, then a drying `wait`.

- **Keys.** Steps: `select:<lineKey>`, `panel-rip:<partId>`, `panel-glue:<partId>`, `panel-cure:<partId>`, `panel-flatten:<partId>`, `mill:<setup>`, `rip:<setup>`, `crosscut:<setup>`, `sheet-cut:<materialId>`, `mark:parts`, `joinery:<setupKey>`, `dry-fit:<subassemblyId|final>`, `sand:parts`, `glue:<subassemblyId|final>`, `cure:<subassemblyId|final>`, `finish:apply`, `finish:dry`. Parts: `stock:<lineKey>`, `blank:<lineKey>/milled`, `part:<partId>/cut`, then one state per transformation keyed from the part id and the producing step key, `assembly:<subassemblyId>`, `assembly:final`. Every key is deterministic for an unchanged design.
- **Measurements.** Milled thickness, ripped width, and crosscut length are `achieve-after` and critical when the part is jointed, with `DEFAULT_TOLERANCES`. Each glue-up checks square with equal diagonals (a critical checklist item, or a measurement when the diagonal is computable).
- **Visuals.** Every step uses `scene-3d` with an isometric `camera` from the bounds. Cut and joinery steps show `before` with the worked parts highlighted. Assembly steps show `after`, with the newly joined parts highlighted and earlier assemblies ghosted.
- **Assumptions.** Glue clamp time (`DEFAULT_GLUE_CLAMP_MINUTES`), finish dry time, default joint sizes, and allowances when `context.allowances` is absent (falling back to `DEFAULT_ALLOWANCES` with a warning) are tagged `assumption`.
- **Design issues.** `validateFurniture` errors become plan warnings of severity error, so readiness hard-blocks a start (D5). The plan covers only resolved parts.
- `finished` maps the bounds as length = width (x), width = depth (y), thickness = height (z). `construction` is omitted. Consumables list glue, abrasives, finish, and every hardware line with its quantity.
- **Tested:** the two golden plans (`tests/__golden__/furniture-table.plan.json`, `furniture-bookcase.plan.json`) validate with zero errors under `validatePlan` and match their snapshots; generating twice gives identical keys; the parametric twins give the same step and part keys; every parts-list line, joint operation, subassembly, and hardware line is traceable to a step.

### `projection.ts`

```ts
export type DrawingView = 'front' | 'side' | 'top' | 'iso' | 'exploded'
export interface DrawingPolygon { partId: string; face: 'front' | 'side' | 'top'; points: Array<[number, number]>; depth: number }
export interface DrawingDimension { from: [number, number]; to: [number, number]; value: number; offset: number }
export interface Drawing { view: DrawingView; polygons: DrawingPolygon[]; bounds: { minX: number; minY: number; maxX: number; maxY: number }; dimensions: DrawingDimension[] }
export function projectDrawing(parts: readonly ResolvedPart[], view: DrawingView, options?: { explodeOffsets?: Readonly<Record<string, readonly [number, number, number]>> }): Drawing
export function explodeOffsets(project: FurnitureProject, parts: readonly ResolvedPart[], distance: number): Record<string, [number, number, number]>
export function isoCamera(bounds: Box): CameraPose
```

- Drawing coordinates are millimeters with y up (the UI flips for SVG, as `geometry2d.ts` does). Front looks along +y, side looks along -x (the right side), top looks down -z.
- Polygons come painter-ordered, farthest first. For non-overlapping axis-aligned boxes in the isometric view the order must be correct, not approximate (test with the fixtures).
- Orthographic views carry overall dimension lines. Exploded moves each subassembly (and loose part) outward from the assembly center by `distance`.

## UI Spec

### Gallery and navigation

- `View` gains `'furniture'`. The sidebar's DESIGN group gains **Furniture** (lucide `Armchair`) below Cutting boards. The breadcrumb names it. Browser-history state includes the open furniture project, as it does for boards.
- `FurnitureGallery` shows a card per project: an isometric thumbnail (once `FurnitureDrawing` exists), name, overall width × depth × height in display units, part count, and an issue badge.
- **New project** opens a dialog: Blank, or a template with its parameters as length fields in display units (defaults filled). Creating commits one undoable change and opens the designer. Cards offer duplicate and delete (with confirmation).
- The warning center navigates to a furniture project and selects `focusId`.

### Designer

- **Header:** editable name, overall size, issue count, back to gallery.
- **Left panel tabs:** *Parts* (grouped by subassembly; select, add solid, sheet, or hardware part, duplicate, delete), *Parameters* (name, label, value or expression, evaluated value), *Joints*, *Assemblies*.
- **Center:** view switcher: 3D, Front, Side, Top, Iso, Exploded. 2D views are `FurnitureDrawing`. 3D is the lazy viewport, with a plain explanation and a switch to Iso when WebGL is unavailable.
- **Right:** *Inspector* for the selected part: label, name, role, kind, material (species with swatch, or sheet material), length, width, thickness, orientation (six named choices such as "Standing, like a leg" and "Lying flat, like a top"), position x, y, z (an axis driven by a relationship shows what drives it and is read-only there), visible faces, color.
- **Bottom tabs:** *Cut list*, *Build steps*, *Issues*. Print produces a cover (name, overall size, units, plan revision), the four drawings, the cut list, hardware, and the steps.
- **Dimension entry (`DimInput`):** anything typed is a length in the current display units, parsed as today's length fields do (fractions in imperial). An entry starting with `=` is an expression in millimeters (with `in` suffixes allowed); the field then shows `fx`, the expression, and its evaluated value. An invalid entry shows the error in place and is not committed.
- **Direct manipulation (3D):** tap or click selects. Dragging a selected part moves it on the chosen axis (X, Y, or Z segmented control, touch friendly), snapping to other parts' face planes and to a grid (off, 1, 5, 10, or 25.4 mm). Snapping only moves; it never resizes. A drag is one undoable commit. Axes driven by relationships cannot be dragged. Arrow keys nudge the selection in 2D views and the parts list (Shift multiplies by ten).
- **Arranging:** with two parts selected, *Attach* creates a `face` relationship (choose which faces meet and an offset), *Align* creates a flush `face` relationship, *Center* creates a `center` relationship. With three selected, *Between*. With several shelves selected plus two anchors, *Distribute*. Relationships appear in the inspector and can be removed, which leaves the part where it is with literal positions.
- **Joints and assemblies:** *Add joint* with two parts selected (kind list filtered to kinds the contact allows), glue toggle, parameters with defaults shown as assumptions. Assemblies are created from a selection, renamed, labelled, nested, and ordered.
- **Issues:** grouped by severity; selecting one selects its part and focuses the field. Parts with errors are outlined in drawings with a pattern, not by color alone.
- **Every edit** goes through `commitData`, bumps the project's `updatedAt`, and is undoable.

### Ergonomics and accessibility

- The parts list and inspector are a complete keyboard and screen-reader path; the 3D canvas is supplementary and carries an accessible description.
- Touch targets are at least 44 px. Orbit, zoom, and selection work with touch in the tablet project.
- Selection, highlight, ghosting, and errors never rely on color alone (outline weight, dash patterns, labels).

## Platform

- **Dependencies:** `three`, `@react-three/fiber`, and `@types/three` (dev). No `drei`.
- **Code splitting:** `FurnitureViewport3D` is imported with `React.lazy`; the main bundle must not grow by the three.js size (checked by the build output in the PR).
- **CSP:** unchanged (`script-src 'self'`). Nothing in the 3D path uses `eval`, workers from blobs, or remote assets.
- **Service worker (FD11):** the build plugin that stamps `__SW_BUILD__` also writes the list of every emitted asset (excluding `.woff` fallbacks and source maps) into `sw.js`, and install precaches that list. The production offline smoke test checks every listed asset is cached after the first load. This PR stacks on the offline smoke PR, not on the furniture stack.
- **WebGL detection:** a small pure helper decides availability; the viewport wrapper shows the fallback instead of throwing.

## Testing Requirements

- Every domain module has a sibling test in `tests/`, and the coverage gate on `src/domain/**` stays green.
- The fixtures' literal and parametric twins must resolve to the same boxes.
- Property-style tests: templates over parameter grids (resolve, validate, reconcile, generate, validate the plan); key stability (generate twice; literal versus parametric twin).
- Golden plans for the table and the bookcase.
- The validator and the generator are tested independently (testing guardrail 6).
- E2E (`e2e/furniture.spec.ts`, also in the `tablet` project): create from a template, change a parameter and see dependent parts and the cut list follow, add and edit a part in imperial units, undo and redo, add a joint, follow an issue to its field, read the cut list and steps, print, reload and keep everything, and export and import a backup containing furniture. The 3D viewport has a smoke test with a software WebGL flag and a fallback test with WebGL unavailable.

## Furniture Waves 2 and Later

| Wave | Scope |
| --- | --- |
| 2 | Project packages for furniture; furniture in wave 2's routes and Design, Plan, and Build modes; Bench Sheet and Step Manual print products for furniture; offline test for the 3D chunk in the production smoke suite |
| 3 | Instruction authoring for every domain (split, merge, reorder, annotate, camera); doors and drawers beyond placeholders; face frames |
| Later | Shared cut planner and sheet nesting (CUT-001); stock inventory and allocation; machine profiles and setup batching across projects; splayed and angled parts via `compoundAngle.ts`; placing finished furniture in the shop planner (after RB1) |

## Roadmap Reconciliation

| Item | Where it lands |
| --- | --- |
| Strategy Phase 4, furniture modeler MVP | This wave: parts, numeric and 3D editing, alignment and snapping, duplication, grouping as subassemblies, simple constraints as relationships, material and grain and visible faces and labels, six templates, orthographic, isometric, and exploded views |
| Strategy Phase 5, furniture instructions | This wave: adapter, subassemblies and dependency graph, draft sequencing. Instruction editing waits for furniture wave 3 (FD9). |
| Strategy Phase 6, joinery and cut planning | Joinery intent in this wave. Cut planning, stock allocation, machine profiles, and shop placement later. |
| Product plan M7, additional designers | Furniture starts here; cabinet templates cover the cabinet workflow's first step |

## Out of Scope for Furniture Wave 1

Instruction authoring, nesting and stock optimization, non-rectangular or rotated parts, doors and drawers beyond placeholder parts, CNC or DXF output, STEP exchange, placement in the shop planner, project packages for furniture, photos, and any change to the cutting-board or shop tools beyond the shared warning center and navigation.
