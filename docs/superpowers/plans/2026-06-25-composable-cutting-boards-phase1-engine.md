# Composable Cutting Boards — Phase 1 Engine (Part 1 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure domain engine + storage for composable cutting boards — source panels (rip glue-up or a re-cut board) crosscut into pieces, mixed-and-matched on a grid, with finished size, cross-chain material accounting, a staged cut plan, and a cycle guard — all TDD'd and persisted.

**Architecture:** A single pure module `src/domain/compositeBoard.ts` operates over a board **registry** (`Map<id, CompositeBoard>`) so a `DerivedPanel` can resolve and recursively render its source board. Types live in `src/types.ts`; persistence is an additive field on `AtlasData` normalized in `src/storage.ts`. No React/DOM — the touch-first designer UI is Part 2, built on this green engine.

**Tech Stack:** TypeScript (strict), Vitest 4, pnpm. Reuses `src/domain/units.ts` (`CUBIC_MM_PER_BOARD_FOOT`, `nonNegative`) and the `src/storage.ts` normalize helpers (`records`, `stringValue`, `finiteNumber`, `signedFinite`, `createId`).

## Global Constraints

- Package manager **pnpm**; verification commands: `pnpm test`, `pnpm lint`, `pnpm build` — all must be green before every commit.
- Tests live in `tests/`, named `*.test.ts` (Vitest). Pure domain logic lives in `src/domain/` with **no React/DOM imports**.
- Strict TS: `verbatimModuleSyntax` → use `import type` for type-only imports; `noUncheckedIndexedAccess` → indexed/array access is `T | undefined`, always guard; `exactOptionalPropertyTypes`; `noUnusedLocals`.
- **All dimensions are millimeters.** Material is computed in mm³ internally and converted to board-feet via `CUBIC_MM_PER_BOARD_FOOT` only at the boundary.
- **Additive schema:** existing edge/end-grain boards and saved data must be unaffected.
- TDD throughout: write the failing test → watch it fail for the right reason → minimal code → watch it pass → commit.
- Central principle (from the spec): **free mix-and-match** — any cell may reference any panel; no panel is locked to a region.

---

## File Structure

- **Create:** `src/domain/compositeBoard.ts` — all composite-board pure logic (`panelPieces`, `placedFootprint`, `assembledSize`, `boardVolumeBySpecies`, `materialBySpecies`, `boardDependsOn`, `compositeCutPlan`) + the `Piece`/`BoardRegistry` types.
- **Create:** `tests/compositeBoard.test.ts` — domain tests (grown across Tasks 1–6).
- **Modify:** `src/types.ts` — add `CrosscutSpec`, `RipPanel`, `DerivedPanel`, `SourcePanel`, `AssemblyCell`, `CompositeBoard`; add `composites: CompositeBoard[]` to `AtlasData`.
- **Modify:** `src/storage.ts` — `normalizeComposite` + `composites` in `normalizeData`.
- **Modify:** `tests/storage.test.ts` — composites migration/round-trip test (Task 7).

---

### Task 1: Composite board types + `panelPieces` for rip panels

**Files:**
- Modify: `src/types.ts` (add composite types; add `composites` to `AtlasData`)
- Create: `src/domain/compositeBoard.ts`
- Test: `tests/compositeBoard.test.ts`

**Interfaces:**
- Consumes: `BoardStrip` from `src/types.ts`; `nonNegative` from `src/domain/units.ts`.
- Produces: types `RipPanel`, `DerivedPanel`, `SourcePanel`, `CrosscutSpec`, `AssemblyCell`, `CompositeBoard`; `compositeBoard.ts` exports `type BoardRegistry = Map<string, CompositeBoard>`, `interface Piece { panelId: string; index: number; widthMm: number; heightMm: number; thicknessMm: number; bySpecies: Record<string, number> }`, and `panelPieces(panel: SourcePanel, registry: BoardRegistry): Piece[]`.

- [ ] **Step 1: Add the types to `src/types.ts`**

Add after the `BoardStrip` interface:

```ts
export interface CrosscutSpec {
  stripWidthMm: number
  kerfMm: number
  count: number
}

export interface RipPanel {
  id: string
  name: string
  kind: 'rip'
  construction: 'edge' | 'end'
  thicknessMm: number
  strips: BoardStrip[]
  crosscut: CrosscutSpec
}

export interface DerivedPanel {
  id: string
  name: string
  kind: 'derived'
  construction: 'edge' | 'end'
  sourceBoardId: string
  crosscut: CrosscutSpec
}

export type SourcePanel = RipPanel | DerivedPanel

export interface AssemblyCell {
  panelId: string
  pieceIndex: number
  rotate: 0 | 90 | 180 | 270
  flip: boolean
}

export interface CompositeBoard {
  id: string
  name: string
  panels: SourcePanel[]
  rows: number
  cols: number
  cells: (AssemblyCell | null)[]
  updatedAt: string
}
```

In the `AtlasData` interface, add one field:

```ts
  composites: CompositeBoard[]
```

- [ ] **Step 2: Write the failing test** — `tests/compositeBoard.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { panelPieces } from '../src/domain/compositeBoard'
import type { RipPanel } from '../src/types'

const ripPanel = (over: Partial<RipPanel> = {}): RipPanel => ({
  id: 'A',
  name: 'Panel A',
  kind: 'rip',
  construction: 'edge',
  thicknessMm: 20,
  strips: [
    { id: 's1', speciesId: 'maple', width: 30, trailingAngle: 0 },
    { id: 's2', speciesId: 'walnut', width: 10, trailingAngle: 0 },
  ],
  crosscut: { stripWidthMm: 25, kerfMm: 3, count: 4 },
  ...over,
})

describe('panelPieces (rip panel)', () => {
  it('yields one piece per crosscut with the strip-stack cross-section', () => {
    const pieces = panelPieces(ripPanel(), new Map())
    expect(pieces).toHaveLength(4)
    expect(pieces[0]).toMatchObject({ panelId: 'A', index: 0, widthMm: 25, heightMm: 40, thicknessMm: 20 })
  })

  it('splits each piece volume by species (strip width × crosscut width × thickness)', () => {
    const [piece] = panelPieces(ripPanel(), new Map())
    expect(piece?.bySpecies).toEqual({ maple: 30 * 25 * 20, walnut: 10 * 25 * 20 })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test compositeBoard`
Expected: FAIL — `panelPieces` is not exported / module not found.

- [ ] **Step 4: Write minimal implementation** — `src/domain/compositeBoard.ts`

```ts
import type { CompositeBoard, RipPanel, SourcePanel } from '../types'
import { nonNegative } from './units'

export type BoardRegistry = Map<string, CompositeBoard>

export interface Piece {
  panelId: string
  index: number
  widthMm: number
  heightMm: number
  thicknessMm: number
  bySpecies: Record<string, number>
}

export function panelPieces(panel: SourcePanel, registry: BoardRegistry): Piece[] {
  if (panel.kind === 'rip') return ripPanelPieces(panel)
  // Derived panels resolve from a source board; rendering is added in Task 5.
  return []
}

function ripPanelPieces(panel: RipPanel): Piece[] {
  const width = nonNegative(panel.crosscut.stripWidthMm)
  const thickness = nonNegative(panel.thicknessMm)
  const stackHeight = panel.strips.reduce((acc, strip) => acc + nonNegative(strip.width), 0)
  const bySpecies: Record<string, number> = {}
  for (const strip of panel.strips) {
    bySpecies[strip.speciesId] = (bySpecies[strip.speciesId] ?? 0) + nonNegative(strip.width) * width * thickness
  }
  const count = Math.max(0, Math.floor(panel.crosscut.count))
  const pieces: Piece[] = []
  for (let index = 0; index < count; index += 1) {
    pieces.push({ panelId: panel.id, index, widthMm: width, heightMm: stackHeight, thicknessMm: thickness, bySpecies: { ...bySpecies } })
  }
  return pieces
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test compositeBoard`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck + lint, then commit**

Run: `pnpm build && pnpm lint`
Expected: both succeed. (`registry` is intentionally unused in `panelPieces` until Task 5; if `noUnusedLocals` flags the parameter, prefix it `_registry` now and rename back in Task 5.)

```bash
git add src/types.ts src/domain/compositeBoard.ts tests/compositeBoard.test.ts
git commit -m "feat(composite): rip-panel crosscut pieces + composite board types"
```

---

### Task 2: `placedFootprint` + `assembledSize`

**Files:**
- Modify: `src/domain/compositeBoard.ts`
- Test: `tests/compositeBoard.test.ts`

**Interfaces:**
- Consumes: `panelPieces`, `Piece`, `BoardRegistry` (Task 1); `AssemblyCell`, `CompositeBoard` types.
- Produces: `placedFootprint(piece: Piece, cell: AssemblyCell): { widthMm: number; heightMm: number }`; `interface AssembledSize { lengthMm: number; widthMm: number; thicknessMm: number }`; `assembledSize(board: CompositeBoard, registry: BoardRegistry): AssembledSize`. Internal helpers `buildPieceMap` and `pieceFor` (also used by later tasks).

- [ ] **Step 1: Write the failing test** — append to `tests/compositeBoard.test.ts`

```ts
import { assembledSize, placedFootprint } from '../src/domain/compositeBoard'
import type { AssemblyCell, CompositeBoard } from '../src/types'

const cell = (over: Partial<AssemblyCell> = {}): AssemblyCell => ({ panelId: 'A', pieceIndex: 0, rotate: 0, flip: false, ...over })

const boardWith = (over: Partial<CompositeBoard> = {}): CompositeBoard => ({
  id: 'board1', name: 'Board 1', panels: [ripPanel()], rows: 2, cols: 1,
  cells: [cell({ pieceIndex: 0 }), cell({ pieceIndex: 1 })], updatedAt: '2026-06-25T00:00:00.000Z', ...over,
})

describe('placedFootprint', () => {
  it('swaps width/height when rotated 90 or 270', () => {
    const [piece] = panelPieces(ripPanel(), new Map())
    expect(placedFootprint(piece!, cell({ rotate: 0 }))).toEqual({ widthMm: 25, heightMm: 40 })
    expect(placedFootprint(piece!, cell({ rotate: 90 }))).toEqual({ widthMm: 40, heightMm: 25 })
  })
})

describe('assembledSize', () => {
  it('stacks two pieces in a 2x1 grid: length = sum of heights, width = max row width', () => {
    const size = assembledSize(boardWith(), new Map())
    expect(size).toEqual({ lengthMm: 80, widthMm: 25, thicknessMm: 20 })
  })

  it('ignores empty (null) cells', () => {
    const size = assembledSize(boardWith({ cells: [cell({ pieceIndex: 0 }), null] }), new Map())
    expect(size).toEqual({ lengthMm: 40, widthMm: 25, thicknessMm: 20 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test compositeBoard`
Expected: FAIL — `placedFootprint` / `assembledSize` not exported.

- [ ] **Step 3: Write minimal implementation** — append to `src/domain/compositeBoard.ts`

```ts
import type { AssemblyCell } from '../types'

export function placedFootprint(piece: Piece, cell: AssemblyCell): { widthMm: number; heightMm: number } {
  const swap = cell.rotate === 90 || cell.rotate === 270
  return swap
    ? { widthMm: piece.heightMm, heightMm: piece.widthMm }
    : { widthMm: piece.widthMm, heightMm: piece.heightMm }
}

export interface AssembledSize {
  lengthMm: number
  widthMm: number
  thicknessMm: number
}

function buildPieceMap(board: CompositeBoard, registry: BoardRegistry): Map<string, Piece[]> {
  const map = new Map<string, Piece[]>()
  for (const panel of board.panels) map.set(panel.id, panelPieces(panel, registry))
  return map
}

function pieceFor(cell: AssemblyCell, pieceMap: Map<string, Piece[]>): Piece | undefined {
  return pieceMap.get(cell.panelId)?.[cell.pieceIndex]
}

export function assembledSize(board: CompositeBoard, registry: BoardRegistry): AssembledSize {
  const pieceMap = buildPieceMap(board, registry)
  let widthMm = 0
  let lengthMm = 0
  let thicknessMm = 0
  for (let r = 0; r < board.rows; r += 1) {
    let rowWidth = 0
    for (let c = 0; c < board.cols; c += 1) {
      const placed = board.cells[r * board.cols + c]
      if (!placed) continue
      const piece = pieceFor(placed, pieceMap)
      if (!piece) continue
      rowWidth += placedFootprint(piece, placed).widthMm
      thicknessMm = Math.max(thicknessMm, piece.thicknessMm)
    }
    widthMm = Math.max(widthMm, rowWidth)
  }
  for (let c = 0; c < board.cols; c += 1) {
    let colHeight = 0
    for (let r = 0; r < board.rows; r += 1) {
      const placed = board.cells[r * board.cols + c]
      if (!placed) continue
      const piece = pieceFor(placed, pieceMap)
      if (!piece) continue
      colHeight += placedFootprint(piece, placed).heightMm
    }
    lengthMm = Math.max(lengthMm, colHeight)
  }
  return { lengthMm, widthMm, thicknessMm }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test compositeBoard`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

Run: `pnpm build && pnpm lint`

```bash
git add src/domain/compositeBoard.ts tests/compositeBoard.test.ts
git commit -m "feat(composite): placedFootprint + assembledSize from the grid"
```

---

### Task 3: `boardVolumeBySpecies` + `materialBySpecies` (conservation)

**Files:**
- Modify: `src/domain/compositeBoard.ts`
- Test: `tests/compositeBoard.test.ts`

**Interfaces:**
- Consumes: `buildPieceMap`, `pieceFor`, `Piece`, `BoardRegistry`; `CUBIC_MM_PER_BOARD_FOOT` from `units.ts`.
- Produces: `boardVolumeBySpecies(board: CompositeBoard, registry: BoardRegistry): Record<string, number>` (mm³); `interface SpeciesUsage { speciesId: string; boardFeet: number }`; `materialBySpecies(board: CompositeBoard, registry: BoardRegistry): SpeciesUsage[]` (sorted by `speciesId`).

- [ ] **Step 1: Write the failing test** — append to `tests/compositeBoard.test.ts`

```ts
import { boardVolumeBySpecies, materialBySpecies } from '../src/domain/compositeBoard'
import { CUBIC_MM_PER_BOARD_FOOT } from '../src/domain/units'

describe('material accounting', () => {
  it('sums placed-piece volume by species (mm^3)', () => {
    // 2x1 grid places pieces 0 and 1 of the rip panel; each piece is maple 15000 + walnut 5000
    expect(boardVolumeBySpecies(boardWith(), new Map())).toEqual({ maple: 30000, walnut: 10000 })
  })

  it('conserves: placing all crosscut pieces equals the whole panel material', () => {
    const board = boardWith({ rows: 4, cols: 1, cells: [0, 1, 2, 3].map(i => cell({ pieceIndex: i })) })
    const vol = boardVolumeBySpecies(board, new Map())
    expect(vol).toEqual({ maple: 4 * 30 * 25 * 20, walnut: 4 * 10 * 25 * 20 })
  })

  it('reports board-feet per species, sorted', () => {
    expect(materialBySpecies(boardWith(), new Map())).toEqual([
      { speciesId: 'maple', boardFeet: 30000 / CUBIC_MM_PER_BOARD_FOOT },
      { speciesId: 'walnut', boardFeet: 10000 / CUBIC_MM_PER_BOARD_FOOT },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test compositeBoard`
Expected: FAIL — `boardVolumeBySpecies` / `materialBySpecies` not exported.

- [ ] **Step 3: Write minimal implementation** — append to `src/domain/compositeBoard.ts`

Add `CUBIC_MM_PER_BOARD_FOOT` to the existing `units` import, then:

```ts
export function boardVolumeBySpecies(board: CompositeBoard, registry: BoardRegistry): Record<string, number> {
  const pieceMap = buildPieceMap(board, registry)
  const totals: Record<string, number> = {}
  for (const placed of board.cells) {
    if (!placed) continue
    const piece = pieceFor(placed, pieceMap)
    if (!piece) continue
    for (const [species, volume] of Object.entries(piece.bySpecies)) {
      totals[species] = (totals[species] ?? 0) + volume
    }
  }
  return totals
}

export interface SpeciesUsage {
  speciesId: string
  boardFeet: number
}

export function materialBySpecies(board: CompositeBoard, registry: BoardRegistry): SpeciesUsage[] {
  return Object.entries(boardVolumeBySpecies(board, registry))
    .map(([speciesId, volume]) => ({ speciesId, boardFeet: volume / CUBIC_MM_PER_BOARD_FOOT }))
    .sort((a, b) => a.speciesId.localeCompare(b.speciesId))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test compositeBoard`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

Run: `pnpm build && pnpm lint`

```bash
git add src/domain/compositeBoard.ts tests/compositeBoard.test.ts
git commit -m "feat(composite): material by species with volume conservation"
```

---

### Task 4: `boardDependsOn` (cycle guard)

**Files:**
- Modify: `src/domain/compositeBoard.ts`
- Test: `tests/compositeBoard.test.ts`

**Interfaces:**
- Consumes: `CompositeBoard`, `BoardRegistry`.
- Produces: `boardDependsOn(board: CompositeBoard, candidateId: string, registry: BoardRegistry): boolean` — true if `board` is `candidateId` or transitively derives from it. The designer (Part 2) forbids adding a derived panel to board X sourcing board Y when `boardDependsOn(Y, X.id, registry)` is true.

- [ ] **Step 1: Write the failing test** — append to `tests/compositeBoard.test.ts`

```ts
import { boardDependsOn } from '../src/domain/compositeBoard'
import type { DerivedPanel } from '../src/types'

const derivedPanel = (sourceBoardId: string, over: Partial<DerivedPanel> = {}): DerivedPanel => ({
  id: 'd', name: 'Derived', kind: 'derived', construction: 'end', sourceBoardId,
  crosscut: { stripWidthMm: 20, kerfMm: 3, count: 3 }, ...over,
})

describe('boardDependsOn (cycle guard)', () => {
  it('is true for itself', () => {
    const b = boardWith({ id: 'X' })
    expect(boardDependsOn(b, 'X', new Map())).toBe(true)
  })

  it('detects a transitive dependency through derived panels', () => {
    const a = boardWith({ id: 'A', panels: [ripPanel()] })
    const b = boardWith({ id: 'B', panels: [derivedPanel('A')] })
    const c = boardWith({ id: 'C', panels: [derivedPanel('B')] })
    const reg = new Map([['A', a], ['B', b], ['C', c]])
    expect(boardDependsOn(c, 'A', reg)).toBe(true)
    expect(boardDependsOn(c, 'Z', reg)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test compositeBoard`
Expected: FAIL — `boardDependsOn` not exported.

- [ ] **Step 3: Write minimal implementation** — append to `src/domain/compositeBoard.ts`

```ts
export function boardDependsOn(board: CompositeBoard, candidateId: string, registry: BoardRegistry): boolean {
  if (board.id === candidateId) return true
  for (const panel of board.panels) {
    if (panel.kind !== 'derived') continue
    if (panel.sourceBoardId === candidateId) return true
    const source = registry.get(panel.sourceBoardId)
    if (source && boardDependsOn(source, candidateId, registry)) return true
  }
  return false
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test compositeBoard`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

Run: `pnpm build && pnpm lint`

```bash
git add src/domain/compositeBoard.ts tests/compositeBoard.test.ts
git commit -m "feat(composite): boardDependsOn cycle guard for derived panels"
```

---

### Task 5: `panelPieces` for derived panels (render → crosscut) + chain conservation

**Files:**
- Modify: `src/domain/compositeBoard.ts`
- Test: `tests/compositeBoard.test.ts`

**Interfaces:**
- Consumes: `assembledSize`, `boardVolumeBySpecies` (so a derived panel renders its source board, then crosscuts it).
- Produces: extends `panelPieces` to resolve `DerivedPanel` via the registry. A derived piece's footprint is `widthMm = crosscut.stripWidthMm`, `heightMm = source.assembledSize.widthMm`, `thicknessMm = source.assembledSize.thicknessMm`; its `bySpecies` is the source board's total volume divided evenly across `count` pieces.

- [ ] **Step 1: Write the failing test** — append to `tests/compositeBoard.test.ts`

```ts
describe('panelPieces (derived panel)', () => {
  it('renders the source board then crosscuts it into N pieces, splitting material evenly', () => {
    const source = boardWith({ id: 'A', panels: [ripPanel()] }) // maple 30000 + walnut 10000 over 2 placed pieces
    const reg = new Map([['A', source]])
    const panel = derivedPanel('A', { crosscut: { stripWidthMm: 20, kerfMm: 3, count: 4 } })
    const pieces = panelPieces(panel, reg)
    expect(pieces).toHaveLength(4)
    expect(pieces[0]).toMatchObject({ widthMm: 20, heightMm: 25 }) // source width = 25
    expect(pieces[0]?.bySpecies).toEqual({ maple: 30000 / 4, walnut: 10000 / 4 })
  })

  it('yields no pieces when the source board is missing from the registry', () => {
    expect(panelPieces(derivedPanel('missing'), new Map())).toEqual([])
  })

  it('conserves material up a derived chain: re-cutting a board keeps total volume', () => {
    const source = boardWith({ id: 'A', panels: [ripPanel()] })
    const reg = new Map([['A', source]])
    const child = boardWith({
      id: 'B', panels: [derivedPanel('A', { id: 'dp', crosscut: { stripWidthMm: 20, kerfMm: 3, count: 4 } })],
      rows: 4, cols: 1,
      cells: [0, 1, 2, 3].map(i => cell({ panelId: 'dp', pieceIndex: i })),
    })
    reg.set('B', child)
    // placing all 4 derived pieces reconstitutes the source board's material
    expect(boardVolumeBySpecies(child, reg)).toEqual({ maple: 30000, walnut: 10000 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test compositeBoard`
Expected: FAIL — derived panels currently return `[]`, so the first assertion (length 4) fails.

- [ ] **Step 3: Write minimal implementation** — in `src/domain/compositeBoard.ts`

Replace the `panelPieces` body's derived branch and add `derivedPanelPieces`. Update the import to include `DerivedPanel`:

```ts
import type { AssemblyCell, CompositeBoard, DerivedPanel, RipPanel, SourcePanel } from '../types'
```

```ts
export function panelPieces(panel: SourcePanel, registry: BoardRegistry): Piece[] {
  return panel.kind === 'rip' ? ripPanelPieces(panel) : derivedPanelPieces(panel, registry)
}

function derivedPanelPieces(panel: DerivedPanel, registry: BoardRegistry): Piece[] {
  const source = registry.get(panel.sourceBoardId)
  if (!source) return []
  const size = assembledSize(source, registry)
  const sourceVolume = boardVolumeBySpecies(source, registry)
  const count = Math.max(0, Math.floor(panel.crosscut.count))
  const width = nonNegative(panel.crosscut.stripWidthMm)
  const bySpecies: Record<string, number> = {}
  for (const [species, volume] of Object.entries(sourceVolume)) {
    bySpecies[species] = count > 0 ? volume / count : 0
  }
  const pieces: Piece[] = []
  for (let index = 0; index < count; index += 1) {
    pieces.push({ panelId: panel.id, index, widthMm: width, heightMm: size.widthMm, thicknessMm: size.thicknessMm, bySpecies: { ...bySpecies } })
  }
  return pieces
}
```

(If Task 1 renamed the parameter to `_registry`, rename it back to `registry` now.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test compositeBoard`
Expected: PASS (all composite tests).

- [ ] **Step 5: Typecheck, lint, commit**

Run: `pnpm build && pnpm lint`

```bash
git add src/domain/compositeBoard.ts tests/compositeBoard.test.ts
git commit -m "feat(composite): derived panels render-then-crosscut with chain conservation"
```

---

### Task 6: `compositeCutPlan` (staged, dependency-ordered)

**Files:**
- Modify: `src/domain/compositeBoard.ts`
- Test: `tests/compositeBoard.test.ts`

**Interfaces:**
- Consumes: `CompositeBoard`, `BoardRegistry`.
- Produces: `interface CutPlanStage { boardId: string; boardName: string; steps: string[] }`; `interface CompositeCutPlan { stages: CutPlanStage[] }`; `compositeCutPlan(board: CompositeBoard, registry: BoardRegistry): CompositeCutPlan` — source boards appear **before** the boards that derive from them; each stage lists per-panel rip/crosscut steps then the assembly step.

- [ ] **Step 1: Write the failing test** — append to `tests/compositeBoard.test.ts`

```ts
import { compositeCutPlan } from '../src/domain/compositeBoard'

describe('compositeCutPlan', () => {
  it('orders source boards before boards that derive from them', () => {
    const source = boardWith({ id: 'A', name: 'Base', panels: [ripPanel()] })
    const child = boardWith({ id: 'B', name: 'Final', panels: [derivedPanel('A', { id: 'dp' })], cells: [cell({ panelId: 'dp', pieceIndex: 0 }), cell({ panelId: 'dp', pieceIndex: 1 })] })
    const reg = new Map([['A', source], ['B', child]])
    const plan = compositeCutPlan(child, reg)
    expect(plan.stages.map(s => s.boardId)).toEqual(['A', 'B'])
    expect(plan.stages[1]?.steps.some(s => s.includes('Final'))).toBe(false)
    expect(plan.stages[1]?.steps.some(s => /crosscut finished board "Base"/i.test(s))).toBe(true)
  })

  it('a rip-only board is a single stage with a crosscut step and an assembly step', () => {
    const plan = compositeCutPlan(boardWith(), new Map())
    expect(plan.stages).toHaveLength(1)
    expect(plan.stages[0]?.steps.some(s => /crosscut into 4 pieces/i.test(s))).toBe(true)
    expect(plan.stages[0]?.steps.some(s => /Assemble 2×1 grid/i.test(s))).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test compositeBoard`
Expected: FAIL — `compositeCutPlan` not exported.

- [ ] **Step 3: Write minimal implementation** — append to `src/domain/compositeBoard.ts`

```ts
export interface CutPlanStage {
  boardId: string
  boardName: string
  steps: string[]
}

export interface CompositeCutPlan {
  stages: CutPlanStage[]
}

export function compositeCutPlan(board: CompositeBoard, registry: BoardRegistry): CompositeCutPlan {
  const stages: CutPlanStage[] = []
  const visited = new Set<string>()
  const addBoard = (current: CompositeBoard): void => {
    if (visited.has(current.id)) return
    visited.add(current.id)
    for (const panel of current.panels) {
      if (panel.kind === 'derived') {
        const source = registry.get(panel.sourceBoardId)
        if (source) addBoard(source)
      }
    }
    stages.push({ boardId: current.id, boardName: current.name, steps: boardSteps(current, registry) })
  }
  addBoard(board)
  return { stages }
}

function boardSteps(board: CompositeBoard, registry: BoardRegistry): string[] {
  const steps: string[] = []
  for (const panel of board.panels) {
    if (panel.kind === 'rip') {
      steps.push(`Rip panel "${panel.name}": glue ${panel.strips.length} strips, then crosscut into ${panel.crosscut.count} pieces (${panel.crosscut.stripWidthMm}mm wide, ${panel.crosscut.kerfMm}mm kerf).`)
    } else {
      const source = registry.get(panel.sourceBoardId)
      steps.push(`Derived panel "${panel.name}": crosscut finished board "${source?.name ?? panel.sourceBoardId}" into ${panel.crosscut.count} pieces (${panel.crosscut.stripWidthMm}mm wide).`)
    }
  }
  const placed = board.cells.filter((c): c is AssemblyCell => c !== null).length
  steps.push(`Assemble ${board.rows}×${board.cols} grid: place ${placed} pieces, then glue up.`)
  return steps
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test compositeBoard`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

Run: `pnpm build && pnpm lint`

```bash
git add src/domain/compositeBoard.ts tests/compositeBoard.test.ts
git commit -m "feat(composite): staged dependency-ordered cut plan"
```

---

### Task 7: Storage — persist `composites` (additive migration)

**Files:**
- Modify: `src/types.ts` (already has `composites` on `AtlasData` from Task 1 — verify)
- Modify: `src/storage.ts` (`normalizeComposite` + `composites` in `normalizeData`)
- Test: `tests/storage.test.ts`

**Interfaces:**
- Consumes: existing `src/storage.ts` helpers `records`, `stringValue`, `finiteNumber`, `signedFinite`, `createId`; `CompositeBoard`, `SourcePanel`, `AssemblyCell` types.
- Produces: `normalizeData` returns `composites: CompositeBoard[]`; legacy saves (no `composites` key) normalize to `[]`.

- [ ] **Step 1: Write the failing test** — append to `tests/storage.test.ts`

```ts
it('defaults composites to an empty array for legacy saves', () => {
  const legacy = { shops: [], boards: [] } as unknown as AtlasData
  expect(normalizeData(legacy).composites).toEqual([])
})

it('round-trips a composite board with rip and derived panels', () => {
  const data = normalizeData({
    shops: [], boards: [],
    composites: [{
      id: 'B', name: 'Final', rows: 1, cols: 2, updatedAt: '2026-06-25T00:00:00.000Z',
      panels: [
        { id: 'A', name: 'Base', kind: 'rip', construction: 'edge', thicknessMm: 20,
          strips: [{ id: 's1', speciesId: 'walnut', width: 38, trailingAngle: 0 }],
          crosscut: { stripWidthMm: 25, kerfMm: 3, count: 4 } },
        { id: 'dp', name: 'Recut', kind: 'derived', construction: 'end', sourceBoardId: 'A',
          crosscut: { stripWidthMm: 20, kerfMm: 3, count: 3 } },
      ],
      cells: [{ panelId: 'A', pieceIndex: 0, rotate: 90, flip: true }, null],
    }],
  } as unknown as Partial<AtlasData>)
  const board = normalizeData({ composites: data.composites } as Partial<AtlasData>).composites[0]
  expect(board?.panels).toHaveLength(2)
  expect(board?.panels[0]?.kind).toBe('rip')
  expect(board?.panels[1]).toMatchObject({ kind: 'derived', sourceBoardId: 'A' })
  expect(board?.cells).toEqual([{ panelId: 'A', pieceIndex: 0, rotate: 90, flip: true }, null])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test storage`
Expected: FAIL — `normalizeData(...).composites` is `undefined`.

- [ ] **Step 3: Write minimal implementation** — in `src/storage.ts`

Add `composites` to the object returned by `normalizeData` (alongside `shops`/`boards`):

```ts
    composites: records(data.composites).map(normalizeComposite),
```

Add the helper (place it near `normalizeShop`). It reuses the existing helpers and mirrors their defensive style:

```ts
function normalizeComposite(raw: Record<string, unknown>): CompositeBoard {
  const rows = Math.max(1, Math.floor(finiteNumber(raw['rows'], 1)))
  const cols = Math.max(1, Math.floor(finiteNumber(raw['cols'], 1)))
  const cells = records(raw['cells'] as unknown).slice(0, rows * cols)
  return {
    id: stringValue(raw['id'], createId()),
    name: stringValue(raw['name'], 'Composite board'),
    rows,
    cols,
    updatedAt: stringValue(raw['updatedAt'], new Date().toISOString()),
    panels: records(raw['panels']).map(normalizeSourcePanel),
    cells: Array.from({ length: rows * cols }, (_, i) => normalizeCell(cells[i])),
  }
}

function normalizeSourcePanel(raw: Record<string, unknown>): SourcePanel {
  const crosscut = (raw['crosscut'] ?? {}) as Record<string, unknown>
  const base = {
    id: stringValue(raw['id'], createId()),
    name: stringValue(raw['name'], 'Panel'),
    construction: raw['construction'] === 'end' ? 'end' as const : 'edge' as const,
    crosscut: {
      stripWidthMm: finiteNumber(crosscut['stripWidthMm'], 25),
      kerfMm: finiteNumber(crosscut['kerfMm'], 3),
      count: Math.max(0, Math.floor(finiteNumber(crosscut['count'], 1))),
    },
  }
  if (raw['kind'] === 'derived') {
    return { ...base, kind: 'derived', sourceBoardId: stringValue(raw['sourceBoardId'], '') }
  }
  return {
    ...base,
    kind: 'rip',
    thicknessMm: finiteNumber(raw['thicknessMm'], 38),
    strips: records(raw['strips']).map(strip => ({
      id: stringValue(strip['id'], createId()),
      speciesId: stringValue(strip['speciesId'], 'walnut'),
      width: finiteNumber(strip['width'], 38),
      trailingAngle: signedFinite(strip['trailingAngle'], 0),
    })),
  }
}

function normalizeCell(raw: Record<string, unknown> | undefined): AssemblyCell | null {
  if (!raw || typeof raw['panelId'] !== 'string') return null
  const rotateRaw = finiteNumber(raw['rotate'], 0)
  const rotate = ([0, 90, 180, 270].includes(rotateRaw) ? rotateRaw : 0) as 0 | 90 | 180 | 270
  return {
    panelId: raw['panelId'],
    pieceIndex: Math.max(0, Math.floor(finiteNumber(raw['pieceIndex'], 0))),
    rotate,
    flip: raw['flip'] === true,
  }
}
```

Add the new type imports to the existing type import in `src/storage.ts`:

```ts
import type { /* …existing… */ AssemblyCell, CompositeBoard, SourcePanel } from './types'
```

Note: `records(raw['cells'])` keeps non-object entries out; `normalizeCell(undefined)` returns `null`, preserving sparse grids. If `records` rejects `null` array entries (collapsing the array), instead map over the raw array directly: `const rawCells = Array.isArray(raw['cells']) ? raw['cells'] : []` and index that — verify against `records`'s implementation when you open the file.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test storage`
Expected: PASS (including the empty-cell `null` round-trip).

- [ ] **Step 5: Full gate + commit**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: entire suite green.

```bash
git add src/types.ts src/storage.ts tests/storage.test.ts
git commit -m "feat(composite): persist composite boards (additive normalizeData migration)"
```

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-06-25-composable-cutting-boards-design.md`):
- Data model (`SourcePanel`/`AssemblyCell`/`CompositeBoard`, `AtlasData.composites`) → Task 1, persisted Task 7.
- `panelPieces` rip + derived (render-then-crosscut) → Tasks 1, 5.
- `assembledSize` → Task 2. `materialBySpecies` across panels + up the chain, conserved → Tasks 3, 5.
- `boardDependsOn` cycle guard → Task 4. Staged `compositeCutPlan` → Task 6.
- Recursive composition / free mix-and-match → exercised by Tasks 5–6 (derived chain, any cell → any panel).
- **Out of scope for this plan (Part 2 — UI):** the "Composite boards" section, panel rail + tray + grid canvas, touch interaction math (`compositeAssembly.ts`: cell-from-pointer, transform cycle, swap), `usePinchPan` reuse, true-to-scale SVG preview, on-screen cut-plan rendering, App/nav wiring. These build on this engine.

**Placeholder scan:** No "TBD/TODO". The Task 1 derived branch returns `[]` (a valid behavior) and is explicitly replaced in Task 5 — not a placeholder.

**Type consistency:** `BoardRegistry`, `Piece`, `AssembledSize`, `SpeciesUsage`, `CutPlanStage`, `CompositeCutPlan` are defined once and reused with the same names. `panelPieces(panel, registry)`, `assembledSize(board, registry)`, `boardVolumeBySpecies`, `materialBySpecies`, `boardDependsOn(board, candidateId, registry)`, `compositeCutPlan(board, registry)` signatures are stable across tasks. `placedFootprint` swaps on `rotate ∈ {90,270}` consistently.

**Note on `thicknessMm`:** the spec's data-model sketch omitted panel thickness; this plan adds `RipPanel.thicknessMm` (needed for volume/size). Carry this back into the spec's data model when convenient.
