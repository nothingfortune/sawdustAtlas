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
2. **crosscut** each into pieces, and
3. **combine pieces from any panel** into one final cutting board, **flipping and
   rotating each piece independently**.

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
interface SourcePanel {
  id: string
  name: string
  construction: 'edge' | 'end'      // 'end' = pieces turned so end grain shows
  strips: BoardStrip[]              // reuses the existing strip model
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

Crosscutting a panel yields `crosscut.count` pieces; each piece's cross-section is the
panel's strip stack (its end-grain or face pattern). `AssemblyCell` references a piece
by `(panelId, pieceIndex)` so the same panel's pieces can be reused across cells.

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
from `brickAssembly.ts`:

- `panelPieces(panel): Piece[]` — derive the `count` crosscut pieces and each piece's
  dimensions (strip stack height × crosscut width × thickness).
- `assembledSize(board): { lengthMm, widthMm, thicknessMm }` — finished board size from
  the grid of placed pieces (accounting for piece dimensions and the chosen
  construction).
- `materialBySpecies(board): WoodUsage[]` — board-feet per species summed **across all
  panels**, conserved (source pieces placed = finished + accounted waste).
- `compositeCutPlan(board): CutPlan` — per panel: rip strips, then the crosscut (count,
  kerf, offcut, trim); plus the final assembly order. Reuses the existing cut-plan and
  `resolveScale`/SVG patterns.

The place/rotate/flip/grid interaction math (e.g. cell-from-pointer, transform cycle,
swap) is extracted into a pure module and unit-tested like `sliceDrag.ts`.

### Reuse (don't reinvent)

`brickAssembly.ts` types/accounting (generalized), the strip editor, `usePinchPan`, the
tap-vs-drag interaction (`sliceDrag.ts`), `resolveScale` + the board SVG renderers, and
the cut-plan helpers.

### Testing strategy

1. Domain first (test-first): `panelPieces` counts/dimensions; `assembledSize` for a
   known grid; **material conservation across multiple panels**; `compositeCutPlan`
   counts (strips, crosscuts, kerf/trim).
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

## Acceptance criteria (Phase 1)

- A composite board can hold **2 or more** source panels and combine pieces from any of
  them in one final board.
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
