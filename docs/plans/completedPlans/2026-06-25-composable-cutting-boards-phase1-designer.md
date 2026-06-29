# Composable Cutting Boards — Phase 1 Designer (Part 2 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the touch-first **Composite boards** designer UI on top of the already-shipped Phase 1 engine — a panel rail (rip + derived panels, crosscut steppers, strip editor), a true-to-scale grid canvas (tap-to-place, tap-to-cycle-transform, drag-to-move, pinch-zoom), and an on-screen cut plan + material totals, wired into the app as a new workspace section.

**Architecture:** All interaction math is extracted into a pure, unit-tested module `src/domain/compositeAssembly.ts` (mirroring `sliceDrag.ts`). React components are thin and reuse existing primitives: `StripList` (strip editing), `ScaledBoardFrame`/`LongGrainFace`/`EndGrainFace`/`WoodPatterns` (true-to-scale SVG), `resolveScale`/`useContainerWidth` (scaling), `usePinchPan` + `sliceDrag` (touch). The domain engine (`src/domain/compositeBoard.ts`: `panelPieces`, `placedFootprint`, `assembledSize`, `materialBySpecies`, `boardDependsOn`, `compositeCutPlan`) is consumed as-is. Data flows through `App` exactly like `BoardDesigner`/`ShopPlanner` (`projects`/`project`/`onSelect`/`onCreate`/`onChange`/`onDelete`).

**Tech Stack:** TypeScript (strict), React 19, Vitest 4, pnpm. No new dependencies.

## Global Constraints

- Package manager **pnpm**; verification commands: `pnpm test`, `pnpm lint`, `pnpm build` — all must be green before every commit.
- Pure logic lives in `src/domain/` with **no React/DOM imports** and is unit-tested in `tests/*.test.ts` (Vitest). **This repo has no React component tests** — components are verified by `pnpm build` + `pnpm lint` + the manual tablet pass in the spec. Do not add a component-test framework.
- Strict TS: `verbatimModuleSyntax` → `import type` for type-only imports; `noUncheckedIndexedAccess` → guard every indexed/array access (`T | undefined`); `exactOptionalPropertyTypes`; `noUnusedLocals` (underscore-prefix intentionally-unused args — `eslint no-unused-vars` is configured to honor `^_`).
- **All dimensions are millimeters**; convert to px only at render via `pxPerMm`. 1 SVG user unit = 1 mm (per `ScaledBoardFrame`).
- **Touch-first / coarse-pointer**: reuse the `@media (pointer: coarse)` sizing in `src/styles.css` (44–50px targets); canvas wrappers need `touch-action: none`.
- **Additive only**: existing edge/end-grain boards, shops, and saved data are unaffected. `AtlasData.composites` already exists and is persisted (`normalizeData` → `normalizeComposite`).
- Central principle (spec): **free mix-and-match** — any cell may hold a piece from any panel; the tray is fully shared; no panel is locked to a region.
- IDs come from `createId` in `src/id`.

---

## File Structure

- **Create:** `src/domain/compositeAssembly.ts` — pure interaction/grid math (`emptyCells`, `placeCell`, `clearCell`, `moveCell`, `resizeGrid`, `cycleTransform`, `cellFromPointer`, `buildRegistry`, `selectableSourceBoardIds`). Tests: `tests/compositeAssembly.test.ts`.
- **Create:** `src/components/composite/CompositePieceFace.tsx` — SVG `<g>` that renders one piece's face (rip strips or derived fill) with rotate/flip applied. Pure presentational.
- **Create:** `src/components/composite/PanelRail.tsx` — left rail: panel cards + crosscut steppers + "+ Add panel" menu + per-panel piece tray; opens the strip editor drawer.
- **Create:** `src/components/composite/PanelEditorDrawer.tsx` — drawer wrapping `StripList` + construction/thickness fields for a `RipPanel` (and crosscut for a `DerivedPanel`).
- **Create:** `src/components/composite/AssemblyCanvas.tsx` — the true-to-scale grid canvas (place/transform/move/clear + pinch-pan).
- **Create:** `src/components/composite/CompositeSummary.tsx` — finished size, material totals, and staged cut plan.
- **Create:** `src/components/composite/CompositeBoards.tsx` — the section: project selector/header + `PanelRail` + `AssemblyCanvas` + `CompositeSummary`. This is the component `App` mounts.
- **Modify:** `src/types.ts` — add `'composites'` to `View`.
- **Modify:** `src/App.tsx` — nav item, breadcrumb, state (`activeComposite`), `Snapshot`, `commitData`/`applyHistory`, `create/update/delete Composite`, section render.
- **Modify:** `src/styles.css` — composite-specific layout + coarse-pointer targets.

**Engine API consumed (already on `develop`, do not modify):** `src/domain/compositeBoard.ts` exports `panelPieces(panel, registry): Piece[]`, `placedFootprint(piece, cell): { widthMm; heightMm }`, `assembledSize(board, registry): { lengthMm; widthMm; thicknessMm }`, `materialBySpecies(board, registry): { speciesId; boardFeet }[]`, `boardDependsOn(board, candidateId, registry): boolean`, `compositeCutPlan(board, registry): { stages: { boardId; boardName; steps: string[] }[] }`, and `type BoardRegistry = Map<string, CompositeBoard>`, `interface Piece { panelId; index; widthMm; heightMm; thicknessMm; bySpecies: Record<string, number> }`.

---

### Task 1: `compositeAssembly.ts` — grid cell operations

**Files:**
- Create: `src/domain/compositeAssembly.ts`
- Test: `tests/compositeAssembly.test.ts`

**Interfaces:**
- Consumes: `AssemblyCell` from `src/types.ts`.
- Produces: `emptyCells(rows: number, cols: number): null[]`; `placeCell(cells: (AssemblyCell|null)[], index: number, cell: AssemblyCell): (AssemblyCell|null)[]`; `clearCell(cells: (AssemblyCell|null)[], index: number): (AssemblyCell|null)[]`; `resizeGrid(cells: (AssemblyCell|null)[], oldCols: number, newRows: number, newCols: number): (AssemblyCell|null)[]` (preserves pieces by their (row,col), drops cells that fall outside the new bounds, pads with null).

- [ ] **Step 1: Write the failing test** — `tests/compositeAssembly.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { clearCell, emptyCells, placeCell, resizeGrid } from '../src/domain/compositeAssembly'
import type { AssemblyCell } from '../src/types'

const cell = (over: Partial<AssemblyCell> = {}): AssemblyCell => ({ panelId: 'A', pieceIndex: 0, rotate: 0, flip: false, ...over })

describe('grid cell operations', () => {
  it('emptyCells builds a rows*cols array of nulls', () => {
    expect(emptyCells(2, 3)).toEqual([null, null, null, null, null, null])
  })

  it('placeCell returns a new array with the cell set at index', () => {
    const before = emptyCells(1, 2)
    const after = placeCell(before, 1, cell({ pieceIndex: 2 }))
    expect(after[1]).toEqual(cell({ pieceIndex: 2 }))
    expect(after).not.toBe(before) // immutable
    expect(before[1]).toBeNull()
  })

  it('clearCell nulls a single index immutably', () => {
    const before = placeCell(emptyCells(1, 2), 0, cell())
    const after = clearCell(before, 0)
    expect(after[0]).toBeNull()
    expect(before[0]).not.toBeNull()
  })

  it('resizeGrid preserves pieces by (row,col) and drops out-of-bounds', () => {
    // 2x2 grid, piece at row1,col1 (index 3)
    const cells = placeCell(emptyCells(2, 2), 3, cell({ pieceIndex: 9 }))
    // grow to 3 cols: index 3 (r1,c1) moves to r1,c1 = 1*3+1 = 4
    const grown = resizeGrid(cells, 2, 2, 3)
    expect(grown).toHaveLength(6)
    expect(grown[4]).toEqual(cell({ pieceIndex: 9 }))
    // shrink back to 1 col: r1,c1 is out of bounds (cols=1) -> dropped
    const shrunk = resizeGrid(cells, 2, 2, 1)
    expect(shrunk).toEqual([null, null])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test compositeAssembly`
Expected: FAIL — module not found / exports missing.

- [ ] **Step 3: Write minimal implementation** — `src/domain/compositeAssembly.ts`

```ts
import type { AssemblyCell } from '../types'

export type Cell = AssemblyCell | null

export function emptyCells(rows: number, cols: number): Cell[] {
  return Array.from({ length: Math.max(0, rows) * Math.max(0, cols) }, () => null)
}

export function placeCell(cells: Cell[], index: number, cell: AssemblyCell): Cell[] {
  const next = cells.slice()
  if (index >= 0 && index < next.length) next[index] = cell
  return next
}

export function clearCell(cells: Cell[], index: number): Cell[] {
  const next = cells.slice()
  if (index >= 0 && index < next.length) next[index] = null
  return next
}

export function resizeGrid(cells: Cell[], oldCols: number, newRows: number, newCols: number): Cell[] {
  const next = emptyCells(newRows, newCols)
  for (let i = 0; i < cells.length; i += 1) {
    const piece = cells[i]
    if (!piece) continue
    const r = Math.floor(i / oldCols)
    const c = i % oldCols
    if (r < newRows && c < newCols) next[r * newCols + c] = piece
  }
  return next
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test compositeAssembly`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck, lint, commit**

Run: `pnpm build && pnpm lint`

```bash
git add src/domain/compositeAssembly.ts tests/compositeAssembly.test.ts
git commit -m "feat(composite-ui): pure grid cell operations (place/clear/resize)"
```

---

### Task 2: `compositeAssembly.ts` — `cycleTransform` (tap cycle)

**Files:**
- Modify: `src/domain/compositeAssembly.ts`
- Test: `tests/compositeAssembly.test.ts`

**Interfaces:**
- Consumes: `AssemblyCell`.
- Produces: `cycleTransform(cell: AssemblyCell): AssemblyCell` — advances through the 8-state cycle `rotate 0→90→180→270` with `flip:false`, then the same four rotations with `flip:true`, then wraps to `{rotate:0, flip:false}`. Preserves `panelId`/`pieceIndex`.

- [ ] **Step 1: Write the failing test** — append to `tests/compositeAssembly.test.ts`

```ts
import { cycleTransform } from '../src/domain/compositeAssembly'

describe('cycleTransform (tap to rotate/flip)', () => {
  it('cycles rotations then flips then wraps, preserving identity', () => {
    let c = cell({ panelId: 'B', pieceIndex: 3, rotate: 0, flip: false })
    const seen: Array<{ rotate: number; flip: boolean }> = []
    for (let i = 0; i < 8; i += 1) { c = cycleTransform(c); seen.push({ rotate: c.rotate, flip: c.flip }) }
    expect(seen).toEqual([
      { rotate: 90, flip: false }, { rotate: 180, flip: false }, { rotate: 270, flip: false },
      { rotate: 0, flip: true }, { rotate: 90, flip: true }, { rotate: 180, flip: true }, { rotate: 270, flip: true },
      { rotate: 0, flip: false },
    ])
    expect(c).toMatchObject({ panelId: 'B', pieceIndex: 3 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test compositeAssembly`
Expected: FAIL — `cycleTransform` not exported.

- [ ] **Step 3: Write minimal implementation** — append to `src/domain/compositeAssembly.ts`

```ts
const TRANSFORM_CYCLE: Array<{ rotate: 0 | 90 | 180 | 270; flip: boolean }> = [
  { rotate: 0, flip: false }, { rotate: 90, flip: false }, { rotate: 180, flip: false }, { rotate: 270, flip: false },
  { rotate: 0, flip: true }, { rotate: 90, flip: true }, { rotate: 180, flip: true }, { rotate: 270, flip: true },
]

export function cycleTransform(cell: AssemblyCell): AssemblyCell {
  const i = TRANSFORM_CYCLE.findIndex(s => s.rotate === cell.rotate && s.flip === cell.flip)
  const next = TRANSFORM_CYCLE[(i + 1) % TRANSFORM_CYCLE.length] ?? TRANSFORM_CYCLE[0]!
  return { ...cell, rotate: next.rotate, flip: next.flip }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test compositeAssembly`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

Run: `pnpm build && pnpm lint`

```bash
git add src/domain/compositeAssembly.ts tests/compositeAssembly.test.ts
git commit -m "feat(composite-ui): tap transform cycle (rotate then flip)"
```

---

### Task 3: `compositeAssembly.ts` — `cellFromPointer` (2D hit test)

**Files:**
- Modify: `src/domain/compositeAssembly.ts`
- Test: `tests/compositeAssembly.test.ts`

**Interfaces:**
- Produces: `interface CellRect { index: number; left: number; top: number; right: number; bottom: number }`; `cellFromPointer(rects: readonly CellRect[], clientX: number, clientY: number): number` — returns the `index` of the first rect that contains the point (inclusive left/top, exclusive right/bottom), or `-1` if none. (Mirrors `dropTargetFromX` but 2D and point-in-rect rather than nearest.)

- [ ] **Step 1: Write the failing test** — append to `tests/compositeAssembly.test.ts`

```ts
import { cellFromPointer } from '../src/domain/compositeAssembly'

describe('cellFromPointer (2D hit test)', () => {
  const rects = [
    { index: 0, left: 0, top: 0, right: 10, bottom: 10 },
    { index: 1, left: 10, top: 0, right: 20, bottom: 10 },
    { index: 2, left: 0, top: 10, right: 10, bottom: 20 },
  ]
  it('returns the index of the containing cell', () => {
    expect(cellFromPointer(rects, 5, 5)).toBe(0)
    expect(cellFromPointer(rects, 15, 5)).toBe(1)
    expect(cellFromPointer(rects, 5, 15)).toBe(2)
  })
  it('is half-open on right/bottom edges', () => {
    expect(cellFromPointer(rects, 10, 0)).toBe(1) // x=10 belongs to cell 1, not 0
  })
  it('returns -1 when outside every cell', () => {
    expect(cellFromPointer(rects, 100, 100)).toBe(-1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test compositeAssembly`
Expected: FAIL — `cellFromPointer` not exported.

- [ ] **Step 3: Write minimal implementation** — append to `src/domain/compositeAssembly.ts`

```ts
export interface CellRect {
  index: number
  left: number
  top: number
  right: number
  bottom: number
}

export function cellFromPointer(rects: readonly CellRect[], clientX: number, clientY: number): number {
  for (const r of rects) {
    if (clientX >= r.left && clientX < r.right && clientY >= r.top && clientY < r.bottom) return r.index
  }
  return -1
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test compositeAssembly`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

Run: `pnpm build && pnpm lint`

```bash
git add src/domain/compositeAssembly.ts tests/compositeAssembly.test.ts
git commit -m "feat(composite-ui): cellFromPointer 2D grid hit test"
```

---

### Task 4: `compositeAssembly.ts` — `moveCell` (drag to move/swap)

**Files:**
- Modify: `src/domain/compositeAssembly.ts`
- Test: `tests/compositeAssembly.test.ts`

**Interfaces:**
- Produces: `moveCell(cells: Cell[], from: number, to: number): Cell[]` — moves the piece at `from` into `to`, swapping whatever was at `to` back into `from` (so dragging onto an occupied cell swaps). No-op if `from === to` or either index is out of range. Immutable.

- [ ] **Step 1: Write the failing test** — append to `tests/compositeAssembly.test.ts`

```ts
import { moveCell } from '../src/domain/compositeAssembly'

describe('moveCell (drag to move / swap)', () => {
  it('moves a piece into an empty cell', () => {
    const cells = placeCell(emptyCells(1, 2), 0, cell({ pieceIndex: 1 }))
    const after = moveCell(cells, 0, 1)
    expect(after[0]).toBeNull()
    expect(after[1]).toEqual(cell({ pieceIndex: 1 }))
  })
  it('swaps when the target is occupied', () => {
    let cells = placeCell(emptyCells(1, 2), 0, cell({ pieceIndex: 1 }))
    cells = placeCell(cells, 1, cell({ pieceIndex: 2 }))
    const after = moveCell(cells, 0, 1)
    expect(after[0]).toEqual(cell({ pieceIndex: 2 }))
    expect(after[1]).toEqual(cell({ pieceIndex: 1 }))
  })
  it('is a no-op for from===to or out-of-range', () => {
    const cells = placeCell(emptyCells(1, 2), 0, cell())
    expect(moveCell(cells, 0, 0)).toEqual(cells)
    expect(moveCell(cells, 0, 9)).toEqual(cells)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test compositeAssembly`
Expected: FAIL — `moveCell` not exported.

- [ ] **Step 3: Write minimal implementation** — append to `src/domain/compositeAssembly.ts`

```ts
export function moveCell(cells: Cell[], from: number, to: number): Cell[] {
  if (from === to || from < 0 || to < 0 || from >= cells.length || to >= cells.length) return cells
  const next = cells.slice()
  const moved = next[from] ?? null
  next[from] = next[to] ?? null
  next[to] = moved
  return next
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test compositeAssembly`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

Run: `pnpm build && pnpm lint`

```bash
git add src/domain/compositeAssembly.ts tests/compositeAssembly.test.ts
git commit -m "feat(composite-ui): moveCell drag-to-move with swap"
```

---

### Task 5: `compositeAssembly.ts` — registry + cycle-guarded source-board selection

**Files:**
- Modify: `src/domain/compositeAssembly.ts`
- Test: `tests/compositeAssembly.test.ts`

**Interfaces:**
- Consumes: `CompositeBoard` from `src/types.ts`; `boardDependsOn` and `type BoardRegistry` from `src/domain/compositeBoard.ts`.
- Produces: `buildRegistry(boards: readonly CompositeBoard[]): BoardRegistry` (Map by id); `selectableSourceBoardIds(boards: readonly CompositeBoard[], currentId: string): string[]` — ids of boards a `DerivedPanel` on `currentId` may reference without creating a cycle: excludes `currentId` itself and any board that already (transitively) depends on `currentId`.

- [ ] **Step 1: Write the failing test** — append to `tests/compositeAssembly.test.ts`

```ts
import { buildRegistry, selectableSourceBoardIds } from '../src/domain/compositeAssembly'
import type { CompositeBoard, DerivedPanel } from '../src/types'

const board = (id: string, panels: CompositeBoard['panels'] = []): CompositeBoard => ({
  id, name: id, panels, rows: 1, cols: 1, cells: [null], updatedAt: '2026-06-25T00:00:00.000Z',
})
const derived = (sourceBoardId: string): DerivedPanel => ({
  id: 'd-' + sourceBoardId, name: 'd', kind: 'derived', construction: 'edge', sourceBoardId,
  crosscut: { stripWidthMm: 20, kerfMm: 3, count: 2 },
})

describe('registry + cycle-guarded selection', () => {
  it('buildRegistry maps boards by id', () => {
    const reg = buildRegistry([board('A'), board('B')])
    expect(reg.get('A')?.id).toBe('A')
    expect(reg.size).toBe(2)
  })
  it('selectableSourceBoardIds excludes self and boards that depend on current', () => {
    const a = board('A')
    const b = board('B', [derived('A')]) // B depends on A
    const c = board('C')
    const ids = selectableSourceBoardIds([a, b, c], 'A')
    // A can't source itself; B depends on A (would cycle); C is fine
    expect(ids.sort()).toEqual(['C'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test compositeAssembly`
Expected: FAIL — `buildRegistry` / `selectableSourceBoardIds` not exported.

- [ ] **Step 3: Write minimal implementation** — append to `src/domain/compositeAssembly.ts`

Add to the imports at the top of the file:

```ts
import type { CompositeBoard } from '../types'
import { boardDependsOn, type BoardRegistry } from './compositeBoard'
```

Then:

```ts
export function buildRegistry(boards: readonly CompositeBoard[]): BoardRegistry {
  return new Map(boards.map(b => [b.id, b]))
}

export function selectableSourceBoardIds(boards: readonly CompositeBoard[], currentId: string): string[] {
  const registry = buildRegistry(boards)
  return boards
    .filter(b => b.id !== currentId && !boardDependsOn(b, currentId, registry))
    .map(b => b.id)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test compositeAssembly`
Expected: PASS.

- [ ] **Step 5: Full domain gate + commit**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: entire suite green (composite engine + assembly math).

```bash
git add src/domain/compositeAssembly.ts tests/compositeAssembly.test.ts
git commit -m "feat(composite-ui): registry + cycle-guarded source board selection"
```

---

### Task 6: `CompositePieceFace` — render one piece's face (rotate/flip)

**Files:**
- Create: `src/components/composite/CompositePieceFace.tsx`
- (No unit test — presentational SVG; verified by build/lint and the manual pass.)

**Interfaces:**
- Consumes: `Piece` from `src/domain/compositeBoard.ts`; `SourcePanel`, `WoodSpecies`, `AssemblyCell` from `src/types.ts`; `placedFootprint` from `src/domain/compositeBoard.ts`.
- Produces: `export function CompositePieceFace({ piece, panel, cell, pxPerMm }: { piece: Piece; panel: SourcePanel | undefined; cell: AssemblyCell; pxPerMm: number }): JSX.Element` — an SVG `<g>` (in mm user units) sized to the **placed** footprint (`placedFootprint(piece, cell)`), drawing the piece face with rotate/flip applied via an inner transform.

- [ ] **Step 1: Implement the component** — `src/components/composite/CompositePieceFace.tsx`

Render strategy (Phase 1):
- Outer `<g>` occupies the placed footprint `{ widthMm, heightMm }` from `placedFootprint(piece, cell)`.
- Inner `<g transform>` rotates about the piece center and flips horizontally (`scale(-1,1)`) when `cell.flip`.
- For a **rip** panel: draw the strip stack as bands across the piece's *unrotated* cross-section (`piece.widthMm` × `piece.heightMm`), one `<rect>` per strip filled `url(#long-<speciesId>)` (construction `'edge'`) or `url(#end-<speciesId>)` (construction `'end'`). The strip thicknesses come from `panel.strips` (sum scaled to `piece.heightMm`).
- For a **derived** panel (or missing `panel`): draw a single neutral `<rect>` (fill `#cdbfa8`) with the panel name — full source-face fidelity is deferred (spec: derived pieces render as a flat blank in Phase 1).

```tsx
import type { AssemblyCell, SourcePanel, WoodSpecies } from '../../types'
import type { Piece } from '../../domain/compositeBoard'
import { placedFootprint } from '../../domain/compositeBoard'

export function CompositePieceFace({ piece, panel, cell, pxPerMm: _pxPerMm }: {
  piece: Piece
  panel: SourcePanel | undefined
  cell: AssemblyCell
  pxPerMm: number
}) {
  const footprint = placedFootprint(piece, cell)
  const cx = footprint.widthMm / 2
  const cy = footprint.heightMm / 2
  // Rotate about center; flip horizontally when requested. Unrotated content is the
  // piece's own width x height; rotation by 90/270 is absorbed by the footprint swap.
  const flip = cell.flip ? `translate(${footprint.widthMm} 0) scale(-1 1)` : ''
  const rotate = `rotate(${cell.rotate} ${cx} ${cy})`
  const fillPrefix = panel?.construction === 'end' ? 'end' : 'long'

  let content: JSX.Element
  if (panel && panel.kind === 'rip' && panel.strips.length > 0) {
    const totalStrip = panel.strips.reduce((acc, s) => acc + Math.max(0, s.width), 0) || 1
    let y = 0
    content = (
      <g>
        {panel.strips.map(strip => {
          const h = (Math.max(0, strip.width) / totalStrip) * piece.heightMm
          const rect = <rect key={strip.id} x={0} y={y} width={piece.widthMm} height={h} fill={`url(#${fillPrefix}-${strip.speciesId})`} stroke="#0003" strokeWidth={0.3} />
          y += h
          return rect
        })}
      </g>
    )
  } else {
    content = <rect x={0} y={0} width={piece.widthMm} height={piece.heightMm} fill="#cdbfa8" stroke="#0003" strokeWidth={0.3} />
  }

  return (
    <g transform={`${rotate} ${flip}`}>
      {content}
    </g>
  )
}

// `WoodSpecies` import retained for callers that pass woods to <defs>; not used here directly.
export type { WoodSpecies }
```

- [ ] **Step 2: Typecheck + lint** (no behavior test; presentational)

Run: `pnpm build && pnpm lint`
Expected: both succeed. (If the unused `WoodSpecies` re-export trips `noUnusedLocals`, delete the import and the `export type` line — it is only a convenience.)

- [ ] **Step 3: Commit**

```bash
git add src/components/composite/CompositePieceFace.tsx
git commit -m "feat(composite-ui): CompositePieceFace SVG renderer with rotate/flip"
```

---

### Task 7: `PanelEditorDrawer` + `PanelRail` — panels, crosscut steppers, piece tray

**Files:**
- Create: `src/components/composite/PanelEditorDrawer.tsx`
- Create: `src/components/composite/PanelRail.tsx`
- (No unit tests — components; verified by build/lint + manual pass.)

**Interfaces:**
- Consumes: `StripList` (`src/components/StripList.tsx` — props `{ strips, woods, construction, onReorder, onUpdateStrip, onDeleteStrip }`); `NumberField` (`src/components/fields.tsx` — `{ label, value, min?, step?, onChange }`); engine `panelPieces`, `buildRegistry`; `selectableSourceBoardIds`; `createId` from `src/id`.
- Produces:
  - `PanelEditorDrawer({ panel, woods, onChange, onClose }: { panel: SourcePanel; woods: WoodSpecies[]; onChange: (panel: SourcePanel) => void; onClose: () => void }): JSX.Element` — edits a rip panel's `strips` (via `StripList`), `construction`, `thicknessMm`, and `crosscut`; for a derived panel edits `construction` + `crosscut` only.
  - `PanelRail({ board, boards, woods, selectedPieceKey, onSelectPiece, onChangeBoard, onEditPanel }: Props): JSX.Element` — one card per `board.panels` (mini preview via `CompositePieceFace` of piece 0, name, `crosscut into N` stepper, a tray of piece chips), plus a "+ Add panel" control offering **rip** and **from a finished board** (the latter lists `selectableSourceBoardIds(boards, board.id)`).
  - Piece identity in the tray and selection is the string key `\`${panelId}:${pieceIndex}\``.

- [ ] **Step 1: Implement `PanelEditorDrawer`** — `src/components/composite/PanelEditorDrawer.tsx`

```tsx
import type { SourcePanel, WoodSpecies, BoardStrip } from '../../types'
import { StripList } from '../StripList'
import { NumberField } from '../fields'
import { createId } from '../../id'

export function PanelEditorDrawer({ panel, woods, onChange, onClose }: {
  panel: SourcePanel
  woods: WoodSpecies[]
  onChange: (panel: SourcePanel) => void
  onClose: () => void
}) {
  const setCrosscut = (patch: Partial<SourcePanel['crosscut']>) =>
    onChange({ ...panel, crosscut: { ...panel.crosscut, ...patch } })

  return (
    <aside className="panel-drawer" role="dialog" aria-label={`Edit ${panel.name}`}>
      <header className="panel-drawer-head">
        <input className="panel-name" value={panel.name} onChange={e => onChange({ ...panel, name: e.target.value })} />
        <button className="icon-button" aria-label="Close editor" onClick={onClose}>×</button>
      </header>

      <div className="field-row">
        <label className="field">
          <span>Construction</span>
          <select value={panel.construction} onChange={e => onChange({ ...panel, construction: e.target.value === 'end' ? 'end' : 'edge' })}>
            <option value="edge">Edge grain</option>
            <option value="end">End grain</option>
          </select>
        </label>
        <NumberField label="Crosscut width (mm)" value={panel.crosscut.stripWidthMm} min={1} step={1} onChange={v => setCrosscut({ stripWidthMm: v })} />
        <NumberField label="Kerf (mm)" value={panel.crosscut.kerfMm} min={0} step={0.1} onChange={v => setCrosscut({ kerfMm: v })} />
        <NumberField label="Pieces" value={panel.crosscut.count} min={0} step={1} onChange={v => setCrosscut({ count: Math.max(0, Math.floor(v)) })} />
      </div>

      {panel.kind === 'rip' ? (
        <>
          <NumberField label="Panel thickness (mm)" value={panel.thicknessMm} min={1} step={1} onChange={v => onChange({ ...panel, thicknessMm: v })} />
          <StripList
            strips={panel.strips}
            woods={woods}
            construction={panel.construction}
            onReorder={ids => onChange({ ...panel, strips: ids.map(id => panel.strips.find(s => s.id === id)).filter((s): s is BoardStrip => Boolean(s)) })}
            onUpdateStrip={(id, patch) => onChange({ ...panel, strips: panel.strips.map(s => s.id === id ? { ...s, ...patch } : s) })}
            onDeleteStrip={id => onChange({ ...panel, strips: panel.strips.filter(s => s.id !== id) })}
          />
          <button className="button" onClick={() => onChange({ ...panel, strips: [...panel.strips, { id: createId(), speciesId: woods[0]?.id ?? 'walnut', width: 38, trailingAngle: 0 }] })}>
            + Add strip
          </button>
        </>
      ) : (
        <p className="hint">Derived panel — crosscuts the finished face of “{panel.sourceBoardId}”.</p>
      )}
    </aside>
  )
}
```

- [ ] **Step 2: Implement `PanelRail`** — `src/components/composite/PanelRail.tsx`

```tsx
import type { CompositeBoard, SourcePanel, WoodSpecies } from '../../types'
import { panelPieces } from '../../domain/compositeBoard'
import { buildRegistry, selectableSourceBoardIds } from '../../domain/compositeAssembly'
import { CompositePieceFace } from './CompositePieceFace'
import { createId } from '../../id'

export interface PanelRailProps {
  board: CompositeBoard
  boards: CompositeBoard[]
  woods: WoodSpecies[]
  selectedPieceKey: string | null
  onSelectPiece: (key: string | null) => void
  onChangeBoard: (board: CompositeBoard) => void
  onEditPanel: (panelId: string) => void
}

export function pieceKey(panelId: string, pieceIndex: number): string {
  return `${panelId}:${pieceIndex}`
}

export function PanelRail({ board, boards, woods, selectedPieceKey, onSelectPiece, onChangeBoard, onEditPanel }: PanelRailProps) {
  const registry = buildRegistry(boards)

  const addRipPanel = () => {
    const panel: SourcePanel = {
      id: createId(), name: `Panel ${board.panels.length + 1}`, kind: 'rip', construction: 'edge',
      thicknessMm: 38, strips: [{ id: createId(), speciesId: woods[0]?.id ?? 'walnut', width: 38, trailingAngle: 0 }],
      crosscut: { stripWidthMm: 25, kerfMm: 3, count: 4 },
    }
    onChangeBoard({ ...board, panels: [...board.panels, panel] })
    onEditPanel(panel.id)
  }
  const addDerivedPanel = (sourceBoardId: string) => {
    const panel: SourcePanel = {
      id: createId(), name: `From ${registry.get(sourceBoardId)?.name ?? 'board'}`, kind: 'derived', construction: 'edge',
      sourceBoardId, crosscut: { stripWidthMm: 25, kerfMm: 3, count: 4 },
    }
    onChangeBoard({ ...board, panels: [...board.panels, panel] })
  }
  const setCount = (panelId: string, count: number) =>
    onChangeBoard({ ...board, panels: board.panels.map(p => p.id === panelId ? { ...p, crosscut: { ...p.crosscut, count: Math.max(0, count) } } : p) })

  const candidates = selectableSourceBoardIds(boards, board.id)

  return (
    <div className="panel-rail">
      {board.panels.map(panel => {
        const pieces = panelPieces(panel, registry)
        return (
          <div className="panel-card" key={panel.id}>
            <button className="panel-card-head" onClick={() => onEditPanel(panel.id)}>
              <span className="panel-card-name">{panel.name}</span>
              <span className="panel-card-meta">{panel.kind === 'rip' ? `${panel.strips.length} strips` : 'derived'}</span>
            </button>
            <div className="crosscut-stepper">
              <button className="icon-button" aria-label="Fewer pieces" onClick={() => setCount(panel.id, panel.crosscut.count - 1)}>−</button>
              <span>crosscut into {panel.crosscut.count}</span>
              <button className="icon-button" aria-label="More pieces" onClick={() => setCount(panel.id, panel.crosscut.count + 1)}>+</button>
            </div>
            <div className="piece-tray">
              {pieces.map(piece => {
                const key = pieceKey(panel.id, piece.index)
                return (
                  <button key={key} className={`piece-chip${selectedPieceKey === key ? ' is-selected' : ''}`}
                    aria-pressed={selectedPieceKey === key}
                    onClick={() => onSelectPiece(selectedPieceKey === key ? null : key)}>
                    <svg viewBox={`0 0 ${piece.widthMm} ${piece.heightMm}`} width={40} height={40} preserveAspectRatio="xMidYMid meet">
                      <CompositePieceFace piece={piece} panel={panel} cell={{ panelId: panel.id, pieceIndex: piece.index, rotate: 0, flip: false }} pxPerMm={1} />
                    </svg>
                    <span>#{piece.index + 1}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      <div className="panel-card add-panel">
        <button className="button" onClick={addRipPanel}>+ Add rip panel</button>
        {candidates.length > 0 && (
          <select aria-label="Add panel from a finished board" defaultValue="" onChange={e => { if (e.target.value) { addDerivedPanel(e.target.value); e.target.value = '' } }}>
            <option value="" disabled>+ From a finished board…</option>
            {candidates.map(id => <option key={id} value={id}>{boards.find(b => b.id === id)?.name ?? id}</option>)}
          </select>
        )}
      </div>
    </div>
  )
}
```

Note: `CompositePieceFace` renders inside the chip SVG without a `<defs>` of wood patterns, so `url(#long-…)` fills resolve to nothing (transparent) at chip scale — acceptable for the tiny chip; the full canvas (Task 8) provides `<defs>`. If you want chip fills, render `<WoodPatterns woods={woods} />` inside each chip `<svg><defs>`.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm build && pnpm lint`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add src/components/composite/PanelEditorDrawer.tsx src/components/composite/PanelRail.tsx
git commit -m "feat(composite-ui): panel rail + crosscut steppers + strip editor drawer"
```

---

### Task 8: `AssemblyCanvas` — true-to-scale grid with touch place/transform/move

**Files:**
- Create: `src/components/composite/AssemblyCanvas.tsx`
- (No unit test — the math it relies on is unit-tested in Tasks 1–4; this wires it to pointers. Verified by build/lint + manual pass.)

**Interfaces:**
- Consumes: `useContainerWidth`, `resolveScale` (`src/domain/boardScale.ts`), `usePinchPan`, `WoodPatterns` (`src/components/board/WoodPatterns.tsx`), `CompositePieceFace`; engine `panelPieces`, `placedFootprint`, `assembledSize`; assembly math `cellFromPointer`, `cycleTransform`, `placeCell`, `clearCell`, `moveCell`, `buildRegistry`; `pieceKey` from `PanelRail`.
- Produces: `AssemblyCanvas({ board, boards, woods, selectedPieceKey, onChangeBoard, onConsumeSelection }: Props): JSX.Element`. Grid is `board.rows × board.cols`; each cell is a fixed slot sized to the **max piece footprint** so the grid is regular. Tap empty cell with a selected tray piece → place; tap a placed piece → `cycleTransform`; drag a placed piece (>10px slop) → `moveCell`; long-press/✕ affordance → `clearCell`. Pinch-zoom/pan via `usePinchPan`.

- [ ] **Step 1: Implement the canvas** — `src/components/composite/AssemblyCanvas.tsx`

```tsx
import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { AssemblyCell, CompositeBoard, WoodSpecies } from '../../types'
import { panelPieces, placedFootprint } from '../../domain/compositeBoard'
import { buildRegistry, cellFromPointer, clearCell, cycleTransform, moveCell, placeCell, type CellRect } from '../../domain/compositeAssembly'
import { resolveScale } from '../../domain/boardScale'
import { useContainerWidth } from '../useContainerWidth'
import { usePinchPan } from '../usePinchPan'
import { WoodPatterns } from '../board/WoodPatterns'
import { CompositePieceFace } from './CompositePieceFace'

export interface AssemblyCanvasProps {
  board: CompositeBoard
  boards: CompositeBoard[]
  woods: WoodSpecies[]
  selectedPieceKey: string | null
  onChangeBoard: (board: CompositeBoard) => void
  onConsumeSelection: () => void
}

export function AssemblyCanvas({ board, boards, woods, selectedPieceKey, onChangeBoard, onConsumeSelection }: AssemblyCanvasProps) {
  const registry = buildRegistry(boards)
  const [canvasRef, canvasWidth] = useContainerWidth(820)
  const pinch = usePinchPan()
  const gridRef = useRef<SVGSVGElement | null>(null)
  const [drag, setDrag] = useState<{ from: number; startX: number; startY: number; moved: boolean } | null>(null)

  // Resolve a piece by an AssemblyCell.
  const pieceFor = (cellValue: AssemblyCell | null) => {
    if (!cellValue) return undefined
    const panel = board.panels.find(p => p.id === cellValue.panelId)
    if (!panel) return undefined
    return { panel, piece: panelPieces(panel, registry)[cellValue.pieceIndex] }
  }

  // Regular slot size = max placed footprint across all pieces (fallback 50mm).
  let slotW = 50, slotH = 50
  for (const panel of board.panels) {
    for (const piece of panelPieces(panel, registry)) {
      slotW = Math.max(slotW, piece.widthMm, piece.heightMm)
      slotH = Math.max(slotH, piece.widthMm, piece.heightMm)
    }
  }
  const contentW = slotW * board.cols
  const contentH = slotH * board.rows
  const scale = resolveScale(contentW, canvasWidth)
  const pxPerMm = scale.pxPerMm

  const cellRectsClient = (): CellRect[] => {
    const svg = gridRef.current
    if (!svg) return []
    const box = svg.getBoundingClientRect()
    // The svg viewBox is contentW x contentH mapped to box.width x box.height (after pinch transform).
    const sx = box.width / contentW
    const sy = box.height / contentH
    const rects: CellRect[] = []
    for (let r = 0; r < board.rows; r += 1) {
      for (let c = 0; c < board.cols; c += 1) {
        rects.push({
          index: r * board.cols + c,
          left: box.left + c * slotW * sx,
          top: box.top + r * slotH * sy,
          right: box.left + (c + 1) * slotW * sx,
          bottom: box.top + (r + 1) * slotH * sy,
        })
      }
    }
    return rects
  }

  const placeOrTransform = (index: number) => {
    const existing = board.cells[index] ?? null
    if (existing) {
      onChangeBoard({ ...board, cells: placeCell(board.cells, index, cycleTransform(existing)) })
      return
    }
    if (selectedPieceKey) {
      const [panelId, pieceIndexRaw] = selectedPieceKey.split(':')
      const pieceIndex = Number(pieceIndexRaw)
      if (panelId && Number.isFinite(pieceIndex)) {
        onChangeBoard({ ...board, cells: placeCell(board.cells, index, { panelId, pieceIndex, rotate: 0, flip: false }) })
        onConsumeSelection()
      }
    }
  }

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.isPrimary === false) return // let pinch (2nd pointer) through
    const idx = cellFromPointer(cellRectsClient(), e.clientX, e.clientY)
    if (idx < 0) return
    if (board.cells[idx]) setDrag({ from: idx, startX: e.clientX, startY: e.clientY, moved: false })
    else setDrag({ from: idx, startX: e.clientX, startY: e.clientY, moved: false })
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    setDrag(d => d ? { ...d, moved: d.moved || Math.abs(e.clientX - d.startX) > 10 || Math.abs(e.clientY - d.startY) > 10 } : d)
  }
  const onPointerUp = (e: ReactPointerEvent) => {
    const d = drag
    setDrag(null)
    if (!d) return
    const idx = cellFromPointer(cellRectsClient(), e.clientX, e.clientY)
    if (d.moved && board.cells[d.from] && idx >= 0 && idx !== d.from) {
      onChangeBoard({ ...board, cells: moveCell(board.cells, d.from, idx) })
    } else if (!d.moved && idx === d.from) {
      placeOrTransform(d.from)
    }
  }

  const clearAt = (index: number) => onChangeBoard({ ...board, cells: clearCell(board.cells, index) })

  return (
    <div className="assembly-canvas">
      <div className="pinch-viewport" ref={canvasRef} {...pinch.handlers} style={{ touchAction: 'none' }}>
        <div className="pinch-content" style={{ transform: `translate(${pinch.x}px, ${pinch.y}px) scale(${pinch.scale})`, transformOrigin: '0 0' }}>
          <svg ref={gridRef} viewBox={`0 0 ${contentW} ${contentH}`} width={contentW * pxPerMm} height={contentH * pxPerMm}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDrag(null)}
            role="group" aria-label="Composite board assembly grid">
            <defs><WoodPatterns woods={woods} /></defs>
            {Array.from({ length: board.rows * board.cols }, (_, index) => {
              const r = Math.floor(index / board.cols)
              const c = index % board.cols
              const resolved = pieceFor(board.cells[index] ?? null)
              return (
                <g key={index} transform={`translate(${c * slotW} ${r * slotH})`}>
                  <rect x={0} y={0} width={slotW} height={slotH} fill="#fff" stroke="#0002" strokeWidth={0.5} />
                  {resolved?.piece && board.cells[index] && (() => {
                    const fp = placedFootprint(resolved.piece, board.cells[index]!)
                    return (
                      <g transform={`translate(${(slotW - fp.widthMm) / 2} ${(slotH - fp.heightMm) / 2})`}>
                        <CompositePieceFace piece={resolved.piece} panel={resolved.panel} cell={board.cells[index]!} pxPerMm={pxPerMm} />
                      </g>
                    )
                  })()}
                </g>
              )
            })}
          </svg>
        </div>
      </div>
      <div className="canvas-controls">
        <button className="button" onClick={() => pinch.reset()} disabled={!pinch.active}>Reset zoom</button>
        {board.cells.some(Boolean) && (
          <button className="button" onClick={() => onChangeBoard({ ...board, cells: board.cells.map(() => null) })}>Clear all</button>
        )}
      </div>
      {/* Per-cell clear: rendered as an overlay row of ✕ for occupied cells (simple Phase-1 affordance). */}
      <div className="cell-clear-row">
        {board.cells.map((cv, index) => cv ? (
          <button key={index} className="icon-button" aria-label={`Clear cell ${index + 1}`} onClick={() => clearAt(index)}>✕{index + 1}</button>
        ) : null)}
      </div>
    </div>
  )
}
```

Note (slop/tap-vs-drag): this reuses the exact 10px-slop pattern from `DraggableAssembledBoard` (`BoardDesigner.tsx:451`), driving it through the unit-tested `cellFromPointer`/`moveCell`/`cycleTransform`. `usePinchPan` engages only on a second pointer, so single-finger taps/drags pass through to these handlers.

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm build && pnpm lint`
Expected: both succeed. (Resolve any `noUncheckedIndexedAccess` complaints with the `board.cells[index]!` guards already present, or local `const cv = board.cells[index]` consts.)

- [ ] **Step 3: Commit**

```bash
git add src/components/composite/AssemblyCanvas.tsx
git commit -m "feat(composite-ui): true-to-scale assembly canvas with touch place/transform/move"
```

---

### Task 9: `CompositeSummary` — finished size, material totals, staged cut plan

**Files:**
- Create: `src/components/composite/CompositeSummary.tsx`

**Interfaces:**
- Consumes: engine `assembledSize`, `materialBySpecies`, `compositeCutPlan`, `buildRegistry`; `WoodSpecies`.
- Produces: `CompositeSummary({ board, boards, woods }: { board: CompositeBoard; boards: CompositeBoard[]; woods: WoodSpecies[] }): JSX.Element` — renders finished `length × width × thickness`, a board-feet-per-species table (species name resolved from `woods`), and the staged cut plan (`stages[].steps`).

- [ ] **Step 1: Implement** — `src/components/composite/CompositeSummary.tsx`

```tsx
import type { CompositeBoard, WoodSpecies } from '../../types'
import { assembledSize, compositeCutPlan, materialBySpecies } from '../../domain/compositeBoard'
import { buildRegistry } from '../../domain/compositeAssembly'

export function CompositeSummary({ board, boards, woods }: { board: CompositeBoard; boards: CompositeBoard[]; woods: WoodSpecies[] }) {
  const registry = buildRegistry(boards)
  const size = assembledSize(board, registry)
  const material = materialBySpecies(board, registry)
  const plan = compositeCutPlan(board, registry)
  const nameFor = (id: string) => woods.find(w => w.id === id)?.name ?? id

  return (
    <div className="composite-summary">
      <section>
        <h3>Finished size</h3>
        <p>{Math.round(size.lengthMm)} × {Math.round(size.widthMm)} × {Math.round(size.thicknessMm)} mm</p>
      </section>
      <section>
        <h3>Material</h3>
        {material.length === 0 ? <p className="hint">Place pieces to see material.</p> : (
          <table><tbody>
            {material.map(m => <tr key={m.speciesId}><td>{nameFor(m.speciesId)}</td><td>{m.boardFeet.toFixed(2)} bf</td></tr>)}
          </tbody></table>
        )}
      </section>
      <section>
        <h3>Cut plan</h3>
        {plan.stages.map(stage => (
          <div key={stage.boardId} className="cut-stage">
            <h4>{stage.boardName}</h4>
            <ol>{stage.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          </div>
        ))}
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + lint, commit**

Run: `pnpm build && pnpm lint`

```bash
git add src/components/composite/CompositeSummary.tsx
git commit -m "feat(composite-ui): summary panel (size, material, staged cut plan)"
```

---

### Task 10: `CompositeBoards` section — compose rail + canvas + summary + grid steppers

**Files:**
- Create: `src/components/composite/CompositeBoards.tsx`

**Interfaces:**
- Consumes: `PanelRail` (+ `pieceKey`), `PanelEditorDrawer`, `AssemblyCanvas`, `CompositeSummary`; `resizeGrid` from assembly math; `NumberField`.
- Produces: `CompositeBoards({ projects, project, woods, onSelect, onCreate, onChange, onDelete }: Props): JSX.Element` — the section App mounts. Props mirror `BoardDesigner` plus the shared `woods`. Manages local UI state: `selectedPieceKey` and `editingPanelId`. Provides rows/cols steppers (using `resizeGrid` to preserve placements) and an empty state with "+ New composite board".

- [ ] **Step 1: Implement** — `src/components/composite/CompositeBoards.tsx`

```tsx
import { useState } from 'react'
import type { CompositeBoard, SourcePanel, WoodSpecies } from '../../types'
import { NumberField } from '../fields'
import { resizeGrid } from '../../domain/compositeAssembly'
import { PanelRail } from './PanelRail'
import { PanelEditorDrawer } from './PanelEditorDrawer'
import { AssemblyCanvas } from './AssemblyCanvas'
import { CompositeSummary } from './CompositeSummary'

export interface CompositeBoardsProps {
  projects: CompositeBoard[]
  project: CompositeBoard | undefined
  woods: WoodSpecies[]
  onSelect: (id: string) => void
  onCreate: () => void
  onChange: (project: CompositeBoard) => void
  onDelete: (id: string) => void
}

export function CompositeBoards({ projects, project, woods, onSelect, onCreate, onChange, onDelete }: CompositeBoardsProps) {
  const [selectedPieceKey, setSelectedPieceKey] = useState<string | null>(null)
  const [editingPanelId, setEditingPanelId] = useState<string | null>(null)

  if (!project) {
    return (
      <div className="composite-empty">
        <p>No composite board yet.</p>
        <button className="button" onClick={onCreate}>+ New composite board</button>
      </div>
    )
  }

  const setRows = (rows: number) => onChange({ ...project, rows: Math.max(1, rows), cells: resizeGrid(project.cells, project.cols, Math.max(1, rows), project.cols) })
  const setCols = (cols: number) => onChange({ ...project, cols: Math.max(1, cols), cells: resizeGrid(project.cells, project.cols, project.rows, Math.max(1, cols)) })
  const editingPanel = project.panels.find(p => p.id === editingPanelId)
  const changePanel = (panel: SourcePanel) => onChange({ ...project, panels: project.panels.map(p => p.id === panel.id ? panel : p) })

  return (
    <div className="composite-board">
      <header className="composite-head">
        <select value={project.id} onChange={e => onSelect(e.target.value)} aria-label="Select composite board">
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input className="composite-name" value={project.name} onChange={e => onChange({ ...project, name: e.target.value })} />
        <button className="button" onClick={onCreate}>+ New</button>
        <button className="button danger" onClick={() => onDelete(project.id)}>Delete</button>
        <NumberField label="Rows" value={project.rows} min={1} step={1} onChange={setRows} />
        <NumberField label="Cols" value={project.cols} min={1} step={1} onChange={setCols} />
      </header>

      <div className="composite-body">
        <PanelRail
          board={project} boards={projects} woods={woods}
          selectedPieceKey={selectedPieceKey} onSelectPiece={setSelectedPieceKey}
          onChangeBoard={onChange} onEditPanel={setEditingPanelId}
        />
        <AssemblyCanvas
          board={project} boards={projects} woods={woods}
          selectedPieceKey={selectedPieceKey} onChangeBoard={onChange}
          onConsumeSelection={() => setSelectedPieceKey(null)}
        />
        <CompositeSummary board={project} boards={projects} woods={woods} />
      </div>

      {editingPanel && (
        <PanelEditorDrawer panel={editingPanel} woods={woods} onChange={changePanel} onClose={() => setEditingPanelId(null)} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + lint, commit**

Run: `pnpm build && pnpm lint`

```bash
git add src/components/composite/CompositeBoards.tsx
git commit -m "feat(composite-ui): CompositeBoards section (rail + canvas + summary + grid)"
```

---

### Task 11: Wire into `App` (nav, state, callbacks, render) + styles

**Files:**
- Modify: `src/types.ts` (View)
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `CompositeBoards` (Task 10); `createId`; existing `commitData`/`record`/`undoHistory` patterns.
- Produces: a working `'composites'` view reachable from the nav, persisted via the existing `data`→`saveData` effect.

- [ ] **Step 1: Add the view** — `src/types.ts:1`

```ts
export type View = 'home' | 'shop' | 'boards' | 'woods' | 'allowances' | 'composites'
```

- [ ] **Step 2: App state + Snapshot + history** — `src/App.tsx`

Add to `Snapshot` (line ~15): `activeComposite: string`. Add state (near `activeBoard`):

```ts
const [activeComposite, setActiveComposite] = useState(data.composites[0]?.id ?? '')
```

In `commitData`’s `record(...)` call and in `applyHistory`’s `restore`, include `activeComposite` (mirror `activeBoard` exactly): add `activeComposite` to the snapshot object passed to `record`, and add `setActiveComposite(result.restored.activeComposite)` in `applyHistory`.

- [ ] **Step 3: Create/update/delete callbacks** — `src/App.tsx` (near `updateBoard`)

```ts
const createComposite = () => {
  const project = { id: createId(), name: 'Untitled composite', panels: [], rows: 1, cols: 1, cells: [null], updatedAt: new Date().toISOString() }
  commitData(current => ({ ...current, composites: [...current.composites, project] }))
  setActiveComposite(project.id)
  setView('composites')
}
const updateComposite = (project: CompositeBoard) => commitData(current => ({ ...current, composites: current.composites.map(p => p.id === project.id ? { ...project, updatedAt: new Date().toISOString() } : p) }))
const deleteComposite = (id: string) => {
  const target = data.composites.find(p => p.id === id)
  if (!target || !window.confirm(`Delete composite “${target.name}”?`)) return
  commitData(current => ({ ...current, composites: current.composites.filter(p => p.id !== id) }))
  if (activeComposite === id) setActiveComposite(data.composites.find(p => p.id !== id)?.id ?? '')
}
```

Add `CompositeBoard` to the `src/types.ts` import in App, and import `CompositeBoards` from `./components/composite/CompositeBoards`.

- [ ] **Step 4: Nav button + breadcrumb + section render** — `src/App.tsx`

Nav (after the `boards` NavButton, in the DESIGN group; import an icon e.g. `Layers` from `lucide-react`):

```tsx
<NavButton active={view === 'composites'} icon={<Layers />} label="Composite boards" open={sidebarOpen} onClick={() => setView('composites')} />
```

Breadcrumb (line ~172): add `view === 'composites' ? 'Composite boards' :` to the chain.

Section render (with the other `{view === ... && <... />}` lines):

```tsx
{view === 'composites' && (
  <CompositeBoards
    projects={data.composites}
    project={data.composites.find(p => p.id === activeComposite)}
    woods={data.woods}
    onSelect={setActiveComposite}
    onCreate={createComposite}
    onChange={updateComposite}
    onDelete={deleteComposite}
  />
)}
```

- [ ] **Step 5: Styles** — `src/styles.css`

Add layout for `.composite-board`, `.composite-body` (flex row: rail | canvas | summary, wrapping on narrow widths), `.panel-rail`, `.panel-card`, `.crosscut-stepper`, `.piece-tray`, `.piece-chip` (+ `.is-selected`), `.assembly-canvas`, `.cell-clear-row`, `.panel-drawer`, `.composite-summary`, `.composite-empty`. Reuse existing tokens/classes (`.button`, `.icon-button`, `.field`, `.hint`, `.pinch-viewport`, `.pinch-content`). Inside the existing `@media (pointer: coarse)` block, give `.piece-chip`, `.crosscut-stepper .icon-button`, and `.cell-clear-row .icon-button` a `min-height`/`min-width` of 44px.

- [ ] **Step 6: Full gate**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: all green (143 existing + new compositeAssembly tests).

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/App.tsx src/styles.css
git commit -m "feat(composite-ui): wire Composite boards section into the app"
```

- [ ] **Step 8: Manual tablet pass (spec acceptance)**

Run: `pnpm dev` and on a landscape tablet (or coarse-pointer emulation) verify:
- Add 2 rip panels, edit strips in the drawer, set crosscut counts → piece chips appear.
- Tap a chip → tap an empty cell → piece places (free mix-and-match: pieces from both panels on one board).
- Tap a placed piece → cycles rotate→flip; drag a placed piece → moves/swaps; ✕ clears a cell.
- Pinch-zoom/pan the canvas.
- Add a derived panel "from a finished board" (a second composite); confirm the current board is **not** offered (cycle guard) and its pieces appear in the tray.
- Finished size + material totals + staged cut plan update live.
- Reload → everything persists; existing edge/end-grain boards unaffected.

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-06-25-composable-cutting-boards-design.md`):
- New top-level "Composite boards" section + nav → Task 11. N panels + one assembly → Tasks 7/10.
- Left rail: panel cards, crosscut steppers, "+ Add panel" (rip + from finished board), strip editor drawer, piece tray → Task 7 (drawer reuses `StripList`).
- Canvas: true-to-scale grid, tap-to-place, tap-to-cycle-transform, drag-to-move/swap, clear, pinch-zoom → Task 8 (math from Tasks 1–4, `usePinchPan`).
- Recursive composition via derived panels + cycle guard in the UI → Tasks 5 (`selectableSourceBoardIds`) + 7 (add-from-board menu).
- Finished size, cross-panel material totals, staged cut plan → Task 9 (engine `assembledSize`/`materialBySpecies`/`compositeCutPlan`).
- Grid size steppers, rows-only stack → Task 10 (`resizeGrid`). Sparse grids (empty cells) → Tasks 1/8.
- Interaction math extracted + unit-tested (cell-from-pointer, transform cycle, swap) → Tasks 1–4. Additive schema unaffected → already in engine; Task 11 only adds a view.

**Out of scope (per spec guardrails, deferred):** cross-project inventory/library (Phase 2); pattern templates (Phase 3); printable build-sheet polish; per-piece end-grain volume validation; full SVG fidelity of derived pieces (Task 6 renders derived pieces as a flat blank — explicitly allowed); visual dependency graph for chained derived panels.

**Placeholder scan:** none. Component tasks intentionally end at build/lint + the manual pass because the repo has no React component-test harness (pure logic is the only thing unit-tested — see Global Constraints); the testable interaction math is fully TDD'd in Tasks 1–5.

**Type consistency:** `pieceKey(panelId, pieceIndex)` / `"panelId:pieceIndex"` is defined once (Task 7) and split in Task 8. `Cell = AssemblyCell | null`, `CellRect`, and all assembly fns keep the same signatures across tasks. Component props mirror the `BoardDesigner` contract (`projects`/`project`/`onSelect`/`onCreate`/`onChange`/`onDelete` + `woods`). Engine signatures consumed exactly as exported (verified against `src/domain/compositeBoard.ts`).
