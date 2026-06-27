# Composite Assembly UI — Row-Based Redesign

- Date: 2026-06-27
- Status: approved design (wireframed + signed off), ready for an implementation plan
- Supersedes the **assembly UI + grid data model** of `COMPOSITE_BOARD_MODE_DESIGN.md`. The "composite is a mode of the Cutting Boards module / unified gallery / Make-composite entry" decisions from that doc still hold; this doc replaces the rows×cols grid + transform-toolbar UX and refines the panel/wafer model.

## Problem

The shipped composite assembly (rows×cols steppers, one-wafer-at-a-time tap-place, a green transform toolbar, a giant near-empty canvas) is confusing and clunky. The mental model should be **Lego parts-bag**: a panel is a finished board you slice into strips (wafers); you drop wafers into rows to build one rectangular cutting board.

## Core model

- A **panel** is a finished board (`BoardProject`) **sliced into strips along one axis**:
  - **X (crosscut)** — strips across the board; or **Y (rip)** — strips along the board.
  - The slices are the **wafers** in the parts bag. Each crosscut/rip is one physical piece (placing it consumes it; the bag chip greys out).
- A **composite board** is an ordered list of **rows**; each row is an ordered list of **placed wafers**. There is no rows×cols grid.
- The **finished board is always a 4-sided rectangle**, derived by cropping the assembled rows:
  - **Y:** each row is cropped to the height of its **shortest wafer**, centered on the row's y-axis.
  - **X:** every row is cropped to the **narrowest row's total width**, centered on the x-axis.
  - Cropped-off overhang is **waste**. The finished size = the cropped rectangle.
- **One construction per composite:** all panels are edge-grain or all end-grain — **never mixed**.

### Data model (replaces grid fields on `CompositeBoard`)

```ts
interface CompositePanel {
  id: string
  boardId: string                       // source board in data.boards
  cut: { axis: 'x' | 'y'; stripWidthMm: number; kerfMm: number; count: number }
}
interface PlacedWafer {
  panelId: string
  pieceIndex: number
  rotate: 0 | 90 | 180 | 270
  flip: boolean
}
interface CompositeRow { id: string; wafers: PlacedWafer[] }
interface CompositeBoard {
  id: string
  name: string
  construction: 'edge' | 'end'          // enforced single construction
  panels: CompositePanel[]
  rows: CompositeRow[]                   // ordered top→bottom; build outward from middle
  updatedAt: string
}
```

Migration: existing `CompositeBoard` records (panels `{boardId,crosscut}`, `rows/cols/cells`) convert — each non-null cell becomes a `PlacedWafer`, grouped by its grid row into `CompositeRow`s; `crosscut` becomes `cut` with `axis:'x'`; `construction` defaults from the first panel's board (else `'edge'`). Legacy/empty unaffected.

### Wafer geometry (pure engine)

`panelPieces(panel, boards): Piece[]` slices the panel's board into `count` wafers along `cut.axis`. A wafer's face is the board's slice cross-section (reusing the board's strip composition for fill); `stripWidthMm` is the slice thickness (kerf removed between slices). `placedFootprint(piece, wafer)` applies rotate (90/270 swap). Crop/finished/material all derive from placed wafers (below). Exact per-axis face dimensions and species split are fixed in the plan with TDD.

### Crop, finished size, material (pure engine)

- `croppedLayout(board, boards)` → the finished rectangle: per-row Y-crop to shortest wafer, X-crop to narrowest row, centered; returns each placed wafer's kept rect + trimmed (waste) rect.
- `assembledSize` = the cropped rectangle (length × width × thickness).
- `materialBySpecies` / `stockBySpecies`: **placed wafers only**; **finished** = kept (cropped) volume by species; **waste** = trimmed overhang + kerf. finished + waste = stock.

## Screen (touch-first, responsive)

Reached from the Cutting Boards gallery (composite card) or "Make composite" (unchanged). Three regions:

- **Parts bag (left):** one card per panel — source board name, **construction**, **cut** (`✄ crosscut X` / `rip Y`, strip width, count), and the wafer chips. **Placed chips grey out.** **Click a panel card → edit it** (opens the board designer for its source board; changing the board re-slices its wafers). **+ Add panel** → design a new board or pick an existing one, then choose slice axis. Adding a panel whose board construction differs from the composite is disallowed (greyed with a reason).
- **The desk (center):** the board built **row by row**. One **active row** (clearly highlighted). **Tap a wafer chip → it drops into the active row**, auto-arranged parallel, **centered on the y-axis**; build **outward from the middle**. **Tap a placed wafer → cycle rotate/flip about its center** (no toolbar). **Drag** to reorder within/across rows. **✕** removes a wafer. **⋮⋮ grip → reorder rows**; **+ Add row (above/below)**. **Light, live trim markings** (faint hatch) on the parts of pieces that will be cropped — on **both X and Y** per the crop logic.
- **Final preview (right sidebar):** the **cut-down 4-sided board only** — true-to-scale, **centered, fully responsive**, **no gaps between rows**, updates live, with a **pop-out**. Below it: finished size, material (finished / trim+kerf waste), staged cut plan.

## App-shell fix (bundled)

- **Preston's Button (imperial):** numeric stepping/snapping uses **whole and ½-inch** increments (not the metric fine-steps that overflow and overlap the UI). Metric mode unchanged. Fixes the number-overlap bug.

## Reuse

The board SVG renderers (`ScaledBoardFrame`/`LongGrainFace`/`EndGrainFace`/`WoodPatterns`), `resolveScale`/`fitPxPerMm`, `usePinchPan`, the board designer (for panel editing), the gallery + Make-composite wiring, and `compositeAssembly`/`compositeBoard` (reworked for the row model + crop).

## Scope / guardrails

- **In:** the row-based assembly model + UI; panel = board sliced along X/Y; build-from-middle; active-row tap-to-fill with grey-out; tap-cycle rotate/flip; drag reorder (wafers + rows); ✕ remove; both-axis live trim markings; cropped 4-sided final preview (centered, responsive, pop-out); placed-wafers-only material with crop waste; single-construction enforcement; migration; imperial whole/½" stepping.
- **Deferred:** recursive composites (composite as a panel); pattern auto-fill templates; printable build-sheet polish; real-device touch hardening.

## Testing

1. **Pure domain (TDD):** `panelPieces` per axis (counts, dims, species); `croppedLayout` (Y shortest-per-row, X narrowest-row, centered; kept vs waste rects); `assembledSize` = cropped rect; `materialBySpecies`/`stockBySpecies` (finished = cropped, waste = trim + kerf, conserved); row ops (add/remove/reorder rows; add/remove/reorder/transform wafers; build-from-middle insertion); imperial snapping (whole/½").
2. **Components:** build/lint + the manual tablet pass (repo has no component tests).
3. **Manual:** slice a board into wafers, fill rows from the bag, reorder rows, rotate/flip, see live trim on both axes, watch the cropped preview + material update, pop out the preview, confirm no edge/end mixing, toggle Preston's Button without overlap, persist + migrate.

## Acceptance

- A panel is a board sliced into strips (X or Y); wafers fill rows; placed wafers grey out.
- The final preview is **always a centered, responsive, 4-sided board** cropped Y→shortest-wafer-per-row and X→narrowest-row; trimmed overhang is waste and is **lightly marked live on both axes** while editing.
- Material counts placed wafers only (finished vs trim+kerf waste, conserved).
- Rows reorder; wafers add (from middle)/remove/reorder/rotate/flip about center; no rows/cols menu, no transform toolbar.
- Edge and end grain never mix in one composite; clicking a panel edits it.
- Preston's Button steps imperial by whole/½" with no UI overlap; metric unchanged.
- Existing composites migrate; full suite, lint, build stay green.
