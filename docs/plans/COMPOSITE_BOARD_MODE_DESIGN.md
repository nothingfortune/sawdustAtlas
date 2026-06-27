# Composite Boards as a Cutting-Board Mode — Design

- Date: 2026-06-26
- Status: approved design, ready for an implementation plan
- Supersedes the UX/architecture of `2026-06-25-composable-cutting-boards-design.md` (Phase 1 standalone section). The pure engine + grid math from that work are largely reused; the standalone "Composite boards" section is removed.

## Problem & goal

The Phase-1 composite designer shipped as a **separate top-level section** with its own data type and an inline strip editor. In use it doesn't fit the mental model and the canvas is broken (renders ~105×70px stranded in a large empty area because it uses the comparable-scale helper instead of fitting its container; the rows/cols steppers are mislabeled "(mm)").

The composite capability should instead be **part of the Cutting boards module**: you design a board normally, then turn it into a composite, where each *panel* you crosscut is itself a board built with the **same designer**. The headline capabilities the user requires:

1. **Build the same way.** A panel is built with the existing cutting-board designer — "the build process is the same."
2. **Free mix-and-match on a 2-D grid.** Any panel's piece can go in any cell of a rows×cols grid.
3. **Free orientation.** Each placed piece can be rotated in 90° steps (both directions) and mirrored across **both** the X and Y axes — all 8 dihedral orientations, set by explicit on-piece controls (not only tap-to-cycle).
4. **Kerf is real.** Crosscut kerf and rip kerf are accounted for in the required source-panel length, the cut plan, and the material/waste totals.

## Decisions (from brainstorming)

- **Spawn a composite FROM a board** — composite stays its own object (`CompositeBoard`), created via a "Make composite" action inside the board designer; it lives under the Cutting boards module. No separate top-level nav item.
- **Panels are board references.** A panel = `{ boardId, crosscut }`. The panel editor *is* the board designer. The board you spawned from is panel #1 (by reference).
- **Panels come from both sources.** "+ Add panel" → **design a new panel inline** (creates a board) **or** **pick an existing saved board**.
- **Inline panels are normal boards.** Building a panel inline just creates a `BoardProject` in `data.boards`; the composite only stores references + crosscuts.
- **Unified selector.** The Cutting boards project picker lists simple boards **and** composites together (composites badged). Selecting a board → board designer; selecting a composite → composite screen.

## Data model (all dimensions mm)

`CompositeBoard` is retained on `AtlasData.composites` (additive; existing data migrates). Its panel representation changes from Phase-1's inline-`strips` `RipPanel` to a **board reference**:

```ts
interface CompositePanel {
  id: string                 // stable panel id (referenced by cells)
  boardId: string            // → BoardProject.id in data.boards (inline-created or picked)
  crosscut: { stripWidthMm: number; kerfMm: number; count: number }
}

interface AssemblyCell {
  panelId: string            // CompositePanel.id
  pieceIndex: number         // which crosscut piece (0..count-1)
  rotate: 0 | 90 | 180 | 270 // in-plane rotation (z), 90° steps
  flip: boolean              // horizontal mirror (X). Vertical mirror (Y) = flip + rotate180.
}

interface CompositeBoard {
  id: string
  name: string
  panels: CompositePanel[]
  rows: number
  cols: number
  cells: (AssemblyCell | null)[]  // length rows*cols, row-major; null = empty
  updatedAt: string
}
```

`rotate` (4 states) × `flip` (2 states) spans the full dihedral group D4 — all 8 orientations, so both-axis mirroring is representable. The UI exposes them as explicit controls (below) so the user never has to derive "flip-Y = flip + 180".

**Why no inline strips on the panel:** a panel's geometry/species/strips/construction all live on its `BoardProject`. One design surface, one renderer, one source of truth. Picking an existing board and building one inline produce the same thing: a board id.

**Migration:** any Phase-1 `CompositeBoard` whose panels carry inline `strips` (kind `'rip'`) is migrated by creating a `BoardProject` from those strips (+ thickness/construction) and rewriting the panel to a `{ boardId, crosscut }` reference. Derived panels (`kind: 'derived'`, source = a composite) are dropped on migration (recursion is deferred — see Scope); cells referencing dropped panels become null. Legacy saves with no composites are unaffected.

## Engine (pure, reuses Phase-1 work)

`src/domain/compositeBoard.ts` and `src/domain/compositeAssembly.ts` are reused; the panel-resolution and kerf accounting change:

- **`panelPieces(panel, boards)`** resolves `panel.boardId` to a `BoardProject` and crosscuts its design into `count` pieces:
  - **Edge construction:** the visible face is the strip stack (long grain), exactly like Phase-1's rip computation — each piece is `stripWidthMm` wide × (sum of strip widths) tall × board thickness; species volumes split by strip.
  - **End construction:** the piece face is the board's assembled end-grain face (reuse the existing `buildEndGrainTemplate`/end-grain geometry); each crosscut is `stripWidthMm` wide × that face's height × thickness.
  - A piece's width is always the crosscut `stripWidthMm`; **kerf is removed stock between pieces, not part of a piece.**
- **Kerf accounting (new, required):** a panel cutting `count` pieces of width `w` with kerf `k` requires source-panel length `count·w + count·k` (a parting kerf per piece; this is the conservative, build-safe figure). The **cut plan** reports this required source length per panel, and **material totals** report finished board-feet **and** kerf/offcut waste board-feet (kerf volume = `cuts · k · faceHeight · thickness`, summed by species proportionally). Rip kerf between strips (when gluing the panel) is likewise surfaced in the panel's own build step.
- **`assembledSize`, grid math (`compositeAssembly`: place/clear/move/resize, `cellFromPointer`), and `compositeCutPlan`** stay; the cut plan becomes board-aware (it now references real boards) and staged (build each panel board → crosscut → assemble).
- **Transform helper:** keep `cycleTransform` (tap-to-cycle through the 8 states) and add pure helpers for the explicit controls — `rotateLeft`, `rotateRight`, `flipX`, `flipY` (each returns a new `AssemblyCell`), unit-tested.

## UI

### Entry & navigation
- **Cutting boards** project selector lists boards + composites (composites badged). The top-level **Composite boards** nav item and the `'composites'` view are removed.
- In the board designer, near the build summary: **"Make composite board"** → creates a `CompositeBoard` with the current board as panel #1, switches the selector to it, opens the composite screen.

### Composite screen (under Cutting boards)
- **Left rail — panels:** one card per panel: a true-to-scale **board thumbnail**, name, **crosscut stepper** (count, with width/kerf), and a **tray of piece chips**. **"+ Add panel"** → *Design new* (opens the board designer for a fresh board, then returns) | *Pick existing board* (lists `data.boards`). **Edit** a panel → opens the board designer for its board (edits are live; a board used in two composites updates both). **Remove** a panel (✕) drops it and nulls referencing cells.
- **Right — the board canvas:** a true-to-scale rows×cols grid that **fits its container** (`fitPxPerMm`, not the comparable `resolveScale`) so cells are large and touchable. Interactions: tap a tray piece then tap an empty cell to place; **tap a placed piece cycles** orientation; an **inline control on the selected/placed piece** offers explicit **rotate ⟲ / rotate ⟳ / flip-H / flip-V**; drag a placed piece to move/swap; ✕ clears a cell; `usePinchPan` zoom/pan. Rows/Cols are plain **count** steppers (no "(mm)").
- **Summary:** finished size, **material totals (finished + kerf/offcut waste)**, and the staged cut plan (per-panel source length incl. kerf, crosscut steps, then the assembly).

### Fixes folded in
- Canvas fit-to-container (the core "doesn't work" bug).
- Rows/Cols count labels (drop the unit suffix the imperial-toggle field leaked).
- Coarse-pointer sizing on chips, steppers, and the new transform controls.

## Reuse vs rework

- **Reuse:** `compositeAssembly.ts` grid/transform math (tested); `AssemblyCanvas` (with the scaling fix + explicit transform controls); `CompositeSummary` (with kerf/waste rows); `CompositePieceFace`; the board SVG renderers (`ScaledBoardFrame`/`LongGrainFace`/`EndGrainFace`/`WoodPatterns`); the cutting-board designer for panel building.
- **Rework:** `compositeBoard.ts` `panelPieces` → board-resolving + kerf; panel type → board reference (drop inline strips); `PanelRail`/`PanelEditorDrawer` → board thumbnails + "edit opens the board designer", add-panel = inline/pick; `App.tsx` → remove the composites view/nav, Cutting boards gains the unified selector + composite screen + "Make composite" entry; storage `normalizeComposite` → new panel shape + migration of Phase-1 composites.

## Scope (YAGNI)

- **In:** the flow and model above; both panel sources; free 8-orientation per piece via explicit controls; kerf in source length + cut plan + material/waste; unified selector; canvas fit-to-container; migration of Phase-1 composites.
- **Deferred:** picking an existing *composite* as a panel (recursion — engine still supports it, not surfaced now); pattern templates (brick/herringbone auto-fill); printable build-sheet polish; a real-device touch-hardening pass for pinch/drag.

## Testing strategy

1. **Pure domain first (test-first):** `panelPieces` for an edge board and an end-grain board (counts, dimensions, species split); **kerf accounting** (required source length = `count·w + count·k`; kerf/offcut waste board-feet); `assembledSize`; material conservation across panels with kerf waste added; `compositeCutPlan` staging (build panel board → crosscut incl. kerf → assemble); the transform helpers (`rotateLeft/Right`, `flipX`, `flipY`, `cycleTransform`) covering all 8 orientations; grid place/clear/move/resize; migration (Phase-1 inline-`strips` panel → board + reference; dropped derived panels null their cells; legacy empty unaffected).
2. **Interaction math** extracted/unit-tested (already is) — `cellFromPointer`, transforms, swap.
3. **Manual tablet pass:** build a board, Make composite, add a second panel (inline + pick existing), set crosscuts, place pieces across a multi-cell grid, rotate/flip each freely, confirm kerf shows in the cut plan/material, pinch-zoom — on a tablet.

## Acceptance criteria

- The standalone "Composite boards" nav/section is gone; composites are created from a board and opened from the unified Cutting boards selector.
- A panel is a board reference; "+ Add panel" supports building inline (creates a board) and picking an existing board; editing a panel opens the board designer.
- Each placed piece can be independently rotated (90° steps, both directions) and mirrored on both X and Y, via explicit controls; any panel's piece can go in any grid cell.
- The crosscut **kerf** is reflected in the required source-panel length, the cut plan, and the material/waste totals (cutting N pieces consumes more than N×width of stock).
- The canvas fills its container with large, touchable cells; rows/cols are count steppers.
- Finished size and cross-panel material totals are computed and conserved (finished + kerf waste = stock).
- Phase-1 composite data migrates without breaking existing boards/shops; full suite, lint, and build stay green.
