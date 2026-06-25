# Composable Cutting Boards — Design (Phase 1)

- Date: 2026-06-25
- Status: approved design, ready for an implementation plan
- Scope: **Phase 1** (thin end-to-end) of a larger composable-board system

## Problem & goal

Today a cutting board is one source glue-up that becomes one stack of slices. Real
builds — brick-and-mortar, herringbone, mixed mosaics, bookmatched stacks — are
made from **reusable intermediate pieces drawn from more than one panel**. The user
wants to:

1. design **any number** of rip glue-ups ("source panels"),
2. **crosscut** each into pieces,
3. **combine pieces from any panel** into one final cutting board, **flipping and
   rotating each piece independently**, and
4. **re-cut a finished board as new stock** — crosscut a completed glue-up and
   flip/rotate those pieces too (recursive composition).

**The central capability is free mix-and-match:** any cell in the final board can hold a
piece from *any* panel — rip glue-up or re-cut board — so different species, grains, and
sources combine freely on one board. Everything else (panels, crosscuts, recursion)
exists to feed that one ability. No panel is "locked" to a region; the tray is fully
shared.

This is the general form of the "composable board assemblies" concept already named
in `docs/plans/BRICK_PATTERN_CORRECTION.md` (BOARD-008). The brick domain foundation
(`src/domain/brickAssembly.ts`: `SourcePanelRecipe`, `AssemblyPart`,
`CompositeBoardRecipe`) is a specialized recipe of exactly this model — Phase 1
generalizes those types into a directly-editable designer.

**Non-negotiable constraint: tablet / touch-first.** The app already targets
landscape tablets and ships the touch primitives this feature reuses —
`usePinchPan` (pinch-zoom/pan), the wafer **tap-to-rotate / drag-to-reorder**
interaction with a 10 px tap-slop (`src/components/sliceDrag.ts`,
`DraggableAssembledBoard`), and coarse-pointer target sizing in `styles.css`.

## Phased roadmap (this spec is Phase 1 only)

- **Phase 1 — thin end-to-end (this spec):** the composite data model + a touch-first
  designer where you build N rip panels, crosscut each, and arrange the combined
  pieces into one final board (flip/rotate each), with a live true-to-scale preview
  and a per-panel cut plan + cross-panel material totals. "Inventory" = the panels of
  the current design (no cross-project library yet).
- **Phase 2 — inventory/library:** panels and pieces become persistent and reusable
  *across* designs ("save this wafer, reuse it later").
- **Phase 3 — patterns & polish:** pattern templates (brick, herringbone, mirror),
  cross-panel stock optimization, the printable build sheet.

Each phase gets its own spec → plan → implementation cycle.

## Phase 1 design

### Where it lives

A new top-level **"Composite boards"** workspace section with its own left-nav item,
alongside Workshop layout and Cutting boards. The existing edge/end-grain designer is
left untouched. A composite board is **N source panels + one final assembly**.

### Data model (all dimensions in mm)

Stored under a new `AtlasData.composites: CompositeBoard[]` (parallel to `shops`,
`boards`), with schema migration leaving existing data untouched.

```ts
// A panel is the stock you crosscut. Its stock is EITHER a primitive rip glue-up
// OR a previously-built composite board — so a finished glue-up can be cut,
// flipped, and rotated again (recursive composition).
type SourcePanel = RipPanel | DerivedPanel

interface RipPanel {
  id: string
  name: string
  kind: 'rip'
  construction: 'edge' | 'end'      // 'end' = pieces turned so end grain shows
  strips: BoardStrip[]              // reuses the existing strip model
  crosscut: { stripWidthMm: number; kerfMm: number; count: number }
}

interface DerivedPanel {
  id: string
  name: string
  kind: 'derived'
  sourceBoardId: string             // crosscut the finished assembly of this composite board
  construction: 'edge' | 'end'
  crosscut: { stripWidthMm: number; kerfMm: number; count: number }
}

interface AssemblyCell {
  panelId: string                   // which source panel
  pieceIndex: number                // which crosscut piece from it
  rotate: 0 | 90 | 180 | 270
  flip: boolean
}

interface CompositeBoard {
  id: string
  name: string
  panels: SourcePanel[]
  rows: number
  cols: number
  cells: (AssemblyCell | null)[]    // length rows*cols, row-major; null = empty cell
  updatedAt: string
}
```

Crosscutting a panel yields `crosscut.count` pieces. For a `RipPanel` each piece's
cross-section is its strip stack; for a `DerivedPanel` each piece is a crosscut of the
referenced board's **fully assembled** face. `AssemblyCell` references a piece by
`(panelId, pieceIndex)` so the same panel's pieces can be reused across cells.

### Recursive composition (cut the finished glue-up again)

A `DerivedPanel` points at another `CompositeBoard` by `sourceBoardId`. That means a
board's assembled output becomes **stock** for a new crosscut + flip/rotate stage — you
can glue up to the end, cut *that*, and rearrange, to any depth (glue → cut →
rearrange → glue → cut → …). In the UI this is **"Add panel → from a finished board"**:
pick an existing composite board and set its crosscut, then its pieces appear in the
tray like any other panel.

Two rules keep this sound:

- **Acyclic only:** a board cannot derive from itself, directly or transitively. The
  designer prevents creating a cycle (it filters out boards that already depend on the
  current one when you add a derived panel).
- **Hierarchical cut plan & material:** building a derived panel first requires building
  its source board. The cut plan is therefore staged — "Build board A → crosscut A into
  N pieces → use in board B" — and material/board-feet flow up through the chain. The
  domain renders a board's assembled face first, then crosscuts it for the parent.

### The screen (layout B, touch-first, landscape)

- **Left rail — panels:** each source panel is a card showing a mini preview, its
  name, and a **"crosscut into N"** stepper (large +/- touch targets). Tapping a panel
  card opens the **existing strip editor** in a drawer to edit that panel's strips and
  construction. A **"+ Add panel"** card appends a new panel. Under each card, the
  panel's crosscut pieces appear as a **tray of chips**.
- **Right — the board canvas (also the live preview):** a true-to-scale `rows × cols`
  grid.
  - **Place:** tap a tray piece to select it, then tap an empty cell to drop it (the
    reliable touch primitive); dragging a chip onto a cell also works.
  - **Transform:** **tap a placed piece to cycle** through rotate → flip states
    (the exact wafer-tap interaction already in the app); a small inline control also
    offers explicit rotate-left/right/flip for precision.
  - **Move/clear:** drag a placed piece to another cell (swap); long-press or a clear
    affordance empties a cell.
  - **Zoom/pan:** `usePinchPan` on the canvas.
- Grid size (`rows`, `cols`) is set with steppers; rows-only (cols = 1) reproduces the
  original "stack on top" idea.

### Domain logic (pure, test-first)

A new `src/domain/compositeBoard.ts`, reusing helpers from `units.ts` and patterns
from `brickAssembly.ts`. Functions take a board **registry** (`Map<id, CompositeBoard>`)
so derived panels can resolve their source board:

- `panelPieces(panel, registry): Piece[]` — crosscut `count` pieces. A `RipPanel` cuts
  its strip stack; a `DerivedPanel` first renders its source board's assembled face
  (recursively) then crosscuts that.
- `assembledSize(board, registry): { lengthMm, widthMm, thicknessMm }` — finished board
  size from the grid of placed pieces and the chosen construction.
- `materialBySpecies(board, registry): WoodUsage[]` — board-feet per species summed
  **across all panels and up the derived-panel chain**, conserved (pieces placed =
  finished + accounted waste).
- `compositeCutPlan(board, registry): CutPlan` — a **staged** plan: build each source
  board before the panel that derives from it, then per panel the rip + crosscut steps
  (count, kerf, offcut, trim), then the final assembly order. Reuses the existing
  cut-plan and `resolveScale`/SVG patterns.
- `boardDependsOn(board, candidateId, registry): boolean` — cycle guard the designer
  uses to forbid self/transitive derivation.

The place/rotate/flip/grid interaction math (cell-from-pointer, transform cycle, swap)
is extracted into a pure module and unit-tested like `sliceDrag.ts`.

### Reuse (don't reinvent)

`brickAssembly.ts` types/accounting (generalized), the strip editor, `usePinchPan`, the
tap-vs-drag interaction (`sliceDrag.ts`), `resolveScale` + the board SVG renderers, and
the cut-plan helpers.

### Testing strategy

1. Domain first (test-first): `panelPieces` counts/dimensions (rip **and** derived,
   render-then-crosscut); `assembledSize` for a known grid; **material conservation
   across multiple panels and up a derived chain**; `compositeCutPlan` staging + counts
   (strips, crosscuts, kerf/trim); `boardDependsOn` cycle detection.
2. Interaction math extracted and unit-tested (cell-from-pointer, transform cycle, swap)
   — no DOM needed, same approach as `sliceDrag`/`usePinchPan`.
3. A manual tablet pass (touch place/rotate/flip, pinch-zoom) before calling it done.

### Phase-1 guardrails (YAGNI — explicitly deferred)

- **Grid layout only** (rows × cols; rows-only covers "stack on top"). No free-form
  placement.
- Rotate in **90° steps** + horizontal/vertical flip only.
- **No cross-project inventory/library** (Phase 2).
- **No pattern templates** (brick/herringbone/mirror auto-fill) — Phase 3.
- No printable build sheet polish yet (basic on-screen cut plan only).
- Recursive derived panels are supported by the model and staged cut plan, but the
  Phase 1 UI for managing many chained stages stays basic (add/remove a derived panel,
  with a cycle guard; no visual dependency graph yet).

## Acceptance criteria (Phase 1)

- A composite board can hold **2 or more** source panels and combine pieces from any of
  them in one final board.
- A **finished composite board can be used as a panel** in another board — crosscut it
  and flip/rotate its pieces — to any acyclic depth; cycles are prevented.
- Each placed piece can be independently rotated (90° steps) and flipped.
- The canvas is a true-to-scale live preview and works with touch: tap-to-place,
  tap-to-cycle-transform, drag-to-move, pinch-zoom — verified on a tablet.
- Finished size and **material totals across all panels** are computed and conserved.
- A cut plan distinguishes each panel's rip + crosscut steps and lists the assembly.
- Domain logic and the interaction math are covered by unit tests; the full suite,
  lint, and build stay green.
- Existing edge/end-grain boards and saved data are unaffected (additive schema).

## Open assumptions (made explicit)

- Pieces are referenced by `(panelId, pieceIndex)`; reusing the same piece in multiple
  cells is allowed in the model and the cut plan counts the **physical** pieces needed
  (so reusing piece 0 twice means two crosscuts, not one).
- "Construction: end" turns pieces to show end grain; "edge" keeps the face. Phase 1
  renders both but does not deeply validate end-grain volume conservation per piece
  (that lives in the existing end-grain engine and can be layered in later).
- Empty cells are allowed (a sparse grid), so partial/asymmetric layouts are possible.
- A `DerivedPanel` treats its source board's **assembled face** as a flat blank to
  crosscut; the source board's own glue-up is an earlier stage in the cut plan, not
  re-derived per piece.
