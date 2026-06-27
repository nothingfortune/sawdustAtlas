# Composite Boards as a Cutting-Board Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework composite boards from a standalone section into a mode of the Cutting Boards module — a composite is a grid of pieces crosscut from **panels**, where a panel is a reference to a normal `BoardProject` (built inline or picked) — with kerf-accurate cuts, free per-piece 8-orientation, a fit-to-container canvas, a unified gallery selector, and a few app-shell cleanups.

**Architecture:** Panels become `{ id, boardId, crosscut }`; the engine resolves `boardId` against `data.boards` (no more inline strips, derived panels, or composite registry). The pure engine (`compositeBoard.ts`) and grid math (`compositeAssembly.ts`) from the prior shipped work are reworked, not rebuilt. The old standalone composite UI + nav are torn down and replaced by a composite screen reached from a Cutting Boards gallery; "Make composite" spawns a composite from the board you're editing.

**Tech Stack:** TypeScript (strict), React 19, Vitest 4, pnpm. No new dependencies.

**Spec:** `docs/plans/COMPOSITE_BOARD_MODE_DESIGN.md`.

## Global Constraints

- Package manager **pnpm**; verification: `pnpm test`, `pnpm lint`, `pnpm build` — all green, **0 lint warnings**, before every commit.
- Pure logic in `src/domain/` with **no React/DOM imports**, unit-tested in `tests/*.test.ts` (Vitest). The repo has **no React component tests** — components are verified by `pnpm build` + `pnpm lint` + the spec's manual tablet pass. Place test `import`s at the **top** of the test file.
- Strict TS: `verbatimModuleSyntax` (`import type` for type-only), `noUncheckedIndexedAccess` (guard indexed access), `exactOptionalPropertyTypes`, `noUnusedLocals`. ESLint honors `^_`-prefixed names and **flags in-render mutation** (no `let x; x += …` in render/map — build accumulations functionally).
- **All dimensions are millimeters**; convert to px only at render via `pxPerMm`. 1 SVG user unit = 1 mm.
- **Touch-first / coarse-pointer**: reuse `@media (pointer: coarse)` sizing in `src/styles.css` (44–50px targets); canvas wrappers need `touch-action: none`.
- **Additive / migration-safe**: existing boards, shops, woods, allowances, and saved data must survive. `AtlasData.composites` stays; its panel shape changes with a migration.
- IDs come from `createId` in `src/id`.
- **Kerf is real** (spec): cutting `count` pieces of width `w` with kerf `k` requires source length `count·w + count·k`; surface kerf in the cut plan + material/stock totals.
- **Free orientation** (spec): each piece independently rotatable 90° both ways and mirrorable on both axes (all 8 dihedral states) via explicit controls.

---

## File Structure

- **Modify:** `src/types.ts` — replace `RipPanel`/`DerivedPanel`/`SourcePanel` with `CompositePanel`; `CompositeBoard.panels: CompositePanel[]`. Keep `CrosscutSpec`, `AssemblyCell`.
- **Modify:** `src/domain/compositeBoard.ts` — `panelPieces(panel, boards)`; `Piece.construction`; kerf (`panelSourceLengthMm`, `stockBySpecies`); drop derived/`boardDependsOn`/`BoardRegistry`; signatures take `boards: readonly BoardProject[]`.
- **Modify:** `src/domain/compositeAssembly.ts` — drop `buildRegistry`/`selectableSourceBoardIds` (composite registry); add explicit transform helpers `rotateLeft`/`rotateRight`/`flipX`/`flipY`; keep grid ops + `cellFromPointer` + `cycleTransform` + `pieceKey`.
- **Modify:** `src/domain/boardScale.ts` — ensure `fitPxPerMm` covers the grid fit (already exists; reused).
- **Modify:** `src/storage.ts` — `normalizeComposite` new panel shape + Phase-1 migration.
- **Modify:** `src/App.tsx` — remove the `'composites'` view/nav/state/callbacks; add the gallery + unified selection routing; "Make composite" handler; app-shell housekeeping (Notion purge, brand→Home, Preston's Button to top bar).
- **Modify:** `src/types.ts` `View` — drop `'composites'` (gallery is part of `'boards'`).
- **Create:** `src/components/composite/CompositePieceFace.tsx` (rework), `PanelRail.tsx` (rework), `AssemblyCanvas.tsx` (rework), `CompositeSummary.tsx` (rework), `CompositeScreen.tsx` (was `CompositeBoards.tsx`).
- **Create:** `src/components/BoardGallery.tsx` — the Cutting Boards landing gallery (boards + composites badged + create-new).
- **Delete:** old `src/components/composite/PanelEditorDrawer.tsx` (panel editing now opens the board designer), old `CompositeBoards.tsx`.
- **Tests:** `tests/compositeBoard.test.ts`, `tests/compositeAssembly.test.ts`, `tests/storage.test.ts` (rework/extend).

---

## Phase A — App-shell housekeeping (independent)

### Task 1: Notion purge, brand→Home, Preston's Button to the top bar

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css` (only if a moved control needs a class)

**Interfaces:**
- Consumes: existing `setView`, `view`, `lengthUnit`, `toggleLengthUnit`, the topbar `save-state` block, the sidebar `.sidebar-bottom` and nav.
- Produces: no exported API change; visual/behavioral cleanups.

- [ ] **Step 1: Purge Notion.** In `src/App.tsx`, delete the sidebar "coming-soon" Notion element (the `<div className="coming-soon">…Notion sync…Planned integration…</div>` in `.sidebar-bottom`). Then verify nothing else references Notion:

Run: `grep -rin "notion" src/` → expected: no matches. Remove any stray references/styles if found.

- [ ] **Step 2: Brand → Home.** Make the top-left breadcrumb brand a Home control. In the topbar breadcrumb, wrap the `SawdustAtlas` text in a button that calls `setView('home')`:

```tsx
<div className="breadcrumb">
  <button type="button" className="breadcrumb-home" onClick={() => setView('home')}>SawdustAtlas</button>
  <b>/</b>
  <strong>{/* current view label */}</strong>
</div>
```
Add a minimal `.breadcrumb-home` rule in `styles.css` (unstyled button: inherit font/color, `background:none; border:0; cursor:pointer; padding:0;`).

- [ ] **Step 3: Move Preston's Button to the top bar.** Remove the `<NavButton … label="Preston's Button" … onClick={toggleLengthUnit} />` from the sidebar `<nav>`. Add an equivalent control in the topbar `topbar-actions`, immediately before/after the `save-state` indicator:

```tsx
<button className="backup-button" onClick={toggleLengthUnit} title="Toggle imperial/metric">
  <Ruler size={15} />{lengthUnit === 'imperial' ? "Preston's Button: on" : "Preston's Button"}
</button>
```
(Keep `lengthUnit`/`toggleLengthUnit`/`UnitSystemProvider` as-is.)

- [ ] **Step 4: Gate + commit**

Run: `pnpm test && pnpm lint && pnpm build` (159+ tests still green, 0 warnings; grep shows no `notion`).

```bash
git add src/App.tsx src/styles.css
git commit -m "feat(shell): purge Notion, brand→Home link, move Preston's Button to top bar"
```

---

## Phase B — Domain rework (TDD)

### Task 2: Tear down the old composite UI + App composites wiring

**Files:**
- Delete: `src/components/composite/CompositeBoards.tsx`, `PanelRail.tsx`, `PanelEditorDrawer.tsx`, `AssemblyCanvas.tsx`, `CompositeSummary.tsx`, `CompositePieceFace.tsx`
- Modify: `src/App.tsx`, `src/types.ts` (`View`)

**Interfaces:**
- Consumes: nothing new.
- Produces: a clean slate — the composite engine/types/storage remain (and their tests pass) but have no UI consumers. `data.composites` persists, temporarily unused by UI.

Rationale: the old components are the hardest consumers to keep green through the type change; removing them first lets Task 3 change the model with only engine/storage/tests as consumers. The new UI is built fresh in Phase C (reference the deleted files via git history if useful).

- [ ] **Step 1: Delete the six composite components** listed above.

- [ ] **Step 2: Remove composite wiring from `src/App.tsx`:** the `import { CompositeBoards }`, the `'composites'` `NavButton`, the breadcrumb `'composites'` case, the `{view === 'composites' && …}` render block, the `activeComposite` state, its inclusion in `Snapshot`/`commitData`/`applyHistory`, and the `createComposite`/`updateComposite`/`deleteComposite` callbacks. Remove `'composites'` from the `View` union in `src/types.ts`. Keep `CompositeBoard` imported only if still referenced (it won't be after this — remove the import if unused).

- [ ] **Step 3: Gate + commit**

Run: `pnpm test && pnpm lint && pnpm build` — green (composite domain tests still pass; App no longer references composite UI).

```bash
git add -A
git commit -m "refactor(composite): remove standalone composite UI + nav ahead of rework"
```

---

### Task 3: Reframe panels as board references (types + engine core + assembly)

**Files:**
- Modify: `src/types.ts`, `src/domain/compositeBoard.ts`, `src/domain/compositeAssembly.ts`
- Test: `tests/compositeBoard.test.ts`, `tests/compositeAssembly.test.ts`

**Interfaces:**
- Consumes: `BoardProject`, `BoardStrip` from `src/types.ts`; `nonNegative`, `CUBIC_MM_PER_BOARD_FOOT` from `units.ts`.
- Produces:
  - `interface CompositePanel { id: string; boardId: string; crosscut: CrosscutSpec }`; `CompositeBoard.panels: CompositePanel[]`.
  - `interface Piece { panelId: string; index: number; widthMm: number; heightMm: number; thicknessMm: number; bySpecies: Record<string, number>; construction: 'edge' | 'end' }`.
  - `panelPieces(panel: CompositePanel, boards: readonly BoardProject[]): Piece[]`.
  - `assembledSize(board: CompositeBoard, boards: readonly BoardProject[]): { lengthMm; widthMm; thicknessMm }`.
  - `boardVolumeBySpecies(board, boards): Record<string, number>`; `materialBySpecies(board, boards): { speciesId; boardFeet }[]`.
  - Removed: `RipPanel`, `DerivedPanel`, `SourcePanel`, `BoardRegistry`, `derivedPanelPieces`, `boardDependsOn`, `buildRegistry`, `selectableSourceBoardIds`.

- [ ] **Step 1: Update `src/types.ts`.** Replace the `RipPanel`/`DerivedPanel`/`SourcePanel` block with:

```ts
export interface CompositePanel {
  id: string
  boardId: string
  crosscut: CrosscutSpec
}
```
Change `CompositeBoard.panels` to `CompositePanel[]`. Keep `CrosscutSpec` and `AssemblyCell` unchanged.

- [ ] **Step 2: Rewrite `tests/compositeBoard.test.ts`** to the new model (board-backed panels). Replace its helpers/tests with:

```ts
import { describe, expect, it } from 'vitest'
import { panelPieces, placedFootprint, assembledSize, boardVolumeBySpecies, materialBySpecies } from '../src/domain/compositeBoard'
import { CUBIC_MM_PER_BOARD_FOOT } from '../src/domain/units'
import type { BoardProject, CompositeBoard, CompositePanel, AssemblyCell } from '../src/types'

const board = (over: Partial<BoardProject> = {}): BoardProject => ({
  id: 'b1', name: 'Board', length: 300, thickness: 20, construction: 'edge',
  endGrain: { sourceLength: 900, stockThickness: 20, sliceThickness: 45, kerf: 3, trimAllowance: 20, rowFlips: [], rowRotations: [] },
  allowances: { jointing: 0, planing: 0, routerTable: 0, ripAllowance: 0, lengthTrim: 0, widthTrim: 0 },
  strips: [
    { id: 's1', speciesId: 'maple', width: 30, trailingAngle: 0 },
    { id: 's2', speciesId: 'walnut', width: 10, trailingAngle: 0 },
  ],
  updatedAt: '2026-06-26T00:00:00.000Z', ...over,
})
const panel = (over: Partial<CompositePanel> = {}): CompositePanel => ({ id: 'A', boardId: 'b1', crosscut: { stripWidthMm: 25, kerfMm: 3, count: 4 }, ...over })
const cell = (over: Partial<AssemblyCell> = {}): AssemblyCell => ({ panelId: 'A', pieceIndex: 0, rotate: 0, flip: false, ...over })
const composite = (over: Partial<CompositeBoard> = {}): CompositeBoard => ({
  id: 'c1', name: 'Composite', panels: [panel()], rows: 2, cols: 1,
  cells: [cell({ pieceIndex: 0 }), cell({ pieceIndex: 1 })], updatedAt: '2026-06-26T00:00:00.000Z', ...over,
})

describe('panelPieces (board-backed)', () => {
  it('crosscuts an edge board into N pieces with the strip-stack cross-section', () => {
    const pieces = panelPieces(panel(), [board()])
    expect(pieces).toHaveLength(4)
    expect(pieces[0]).toMatchObject({ panelId: 'A', index: 0, widthMm: 25, heightMm: 40, thicknessMm: 20, construction: 'edge' })
    expect(pieces[0]?.bySpecies).toEqual({ maple: 30 * 25 * 20, walnut: 10 * 25 * 20 })
  })
  it('returns [] when the referenced board is missing', () => {
    expect(panelPieces(panel({ boardId: 'gone' }), [board()])).toEqual([])
  })
  it('marks pieces from an end-grain board with construction "end"', () => {
    const pieces = panelPieces(panel(), [board({ construction: 'end' })])
    expect(pieces[0]?.construction).toBe('end')
  })
})

describe('placedFootprint', () => {
  it('swaps width/height for 90/270', () => {
    const [p] = panelPieces(panel(), [board()])
    expect(placedFootprint(p!, cell({ rotate: 0 }))).toEqual({ widthMm: 25, heightMm: 40 })
    expect(placedFootprint(p!, cell({ rotate: 90 }))).toEqual({ widthMm: 40, heightMm: 25 })
  })
})

describe('assembledSize', () => {
  it('stacks a 2x1 grid: length = sum heights, width = max row width', () => {
    expect(assembledSize(composite(), [board()])).toEqual({ lengthMm: 80, widthMm: 25, thicknessMm: 20 })
  })
})

describe('material accounting', () => {
  it('sums placed-piece volume by species', () => {
    expect(boardVolumeBySpecies(composite(), [board()])).toEqual({ maple: 2 * 30 * 25 * 20, walnut: 2 * 10 * 25 * 20 })
  })
  it('reports board-feet per species, sorted', () => {
    expect(materialBySpecies(composite(), [board()])).toEqual([
      { speciesId: 'maple', boardFeet: (2 * 30 * 25 * 20) / CUBIC_MM_PER_BOARD_FOOT },
      { speciesId: 'walnut', boardFeet: (2 * 10 * 25 * 20) / CUBIC_MM_PER_BOARD_FOOT },
    ])
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test compositeBoard` → FAIL (signatures changed / `construction` missing).

- [ ] **Step 4: Rewrite `src/domain/compositeBoard.ts` core.** New imports + `panelPieces` resolving boards, `Piece.construction`, and updated `assembledSize`/`boardVolumeBySpecies`/`materialBySpecies` to take `boards`. Remove `derivedPanelPieces`, `boardDependsOn`, `BoardRegistry`, and the old `RipPanel`/`SourcePanel` imports.

```ts
import type { AssemblyCell, BoardProject, CompositeBoard, CompositePanel } from '../types'
import { CUBIC_MM_PER_BOARD_FOOT, nonNegative } from './units'

export interface Piece {
  panelId: string
  index: number
  widthMm: number
  heightMm: number
  thicknessMm: number
  bySpecies: Record<string, number>
  construction: 'edge' | 'end'
}

export function panelPieces(panel: CompositePanel, boards: readonly BoardProject[]): Piece[] {
  const board = boards.find(b => b.id === panel.boardId)
  if (!board) return []
  const width = nonNegative(panel.crosscut.stripWidthMm)
  const thickness = nonNegative(board.thickness)
  const stackHeight = board.strips.reduce((acc, strip) => acc + nonNegative(strip.width), 0)
  const bySpecies: Record<string, number> = {}
  for (const strip of board.strips) {
    bySpecies[strip.speciesId] = (bySpecies[strip.speciesId] ?? 0) + nonNegative(strip.width) * width * thickness
  }
  const count = Math.max(0, Math.floor(panel.crosscut.count))
  const pieces: Piece[] = []
  for (let index = 0; index < count; index += 1) {
    pieces.push({ panelId: panel.id, index, widthMm: width, heightMm: stackHeight, thicknessMm: thickness, bySpecies: { ...bySpecies }, construction: board.construction })
  }
  return pieces
}

export function placedFootprint(piece: Piece, cell: AssemblyCell): { widthMm: number; heightMm: number } {
  const swap = cell.rotate === 90 || cell.rotate === 270
  return swap ? { widthMm: piece.heightMm, heightMm: piece.widthMm } : { widthMm: piece.widthMm, heightMm: piece.heightMm }
}

export interface AssembledSize { lengthMm: number; widthMm: number; thicknessMm: number }

function pieceMap(board: CompositeBoard, boards: readonly BoardProject[]): Map<string, Piece[]> {
  const map = new Map<string, Piece[]>()
  for (const panel of board.panels) map.set(panel.id, panelPieces(panel, boards))
  return map
}
function pieceFor(cell: AssemblyCell, map: Map<string, Piece[]>): Piece | undefined {
  return map.get(cell.panelId)?.[cell.pieceIndex]
}

export function assembledSize(board: CompositeBoard, boards: readonly BoardProject[]): AssembledSize {
  const map = pieceMap(board, boards)
  let widthMm = 0, lengthMm = 0, thicknessMm = 0
  for (let r = 0; r < board.rows; r += 1) {
    let rowWidth = 0
    for (let c = 0; c < board.cols; c += 1) {
      const placed = board.cells[r * board.cols + c]
      if (!placed) continue
      const piece = pieceFor(placed, map)
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
      const piece = pieceFor(placed, map)
      if (!piece) continue
      colHeight += placedFootprint(piece, placed).heightMm
    }
    lengthMm = Math.max(lengthMm, colHeight)
  }
  return { lengthMm, widthMm, thicknessMm }
}

export function boardVolumeBySpecies(board: CompositeBoard, boards: readonly BoardProject[]): Record<string, number> {
  const map = pieceMap(board, boards)
  const totals: Record<string, number> = {}
  for (const placed of board.cells) {
    if (!placed) continue
    const piece = pieceFor(placed, map)
    if (!piece) continue
    for (const [species, volume] of Object.entries(piece.bySpecies)) totals[species] = (totals[species] ?? 0) + volume
  }
  return totals
}

export interface SpeciesUsage { speciesId: string; boardFeet: number }

export function materialBySpecies(board: CompositeBoard, boards: readonly BoardProject[]): SpeciesUsage[] {
  return Object.entries(boardVolumeBySpecies(board, boards))
    .map(([speciesId, volume]) => ({ speciesId, boardFeet: volume / CUBIC_MM_PER_BOARD_FOOT }))
    .sort((a, b) => a.speciesId.localeCompare(b.speciesId))
}
```

Leave the existing `CutPlanStage`/`CompositeCutPlan`/`compositeCutPlan` for Task 4 (it will be updated there). For this task, update `compositeCutPlan`'s signature to `(board, boards)` and replace its panel-step logic with a minimal board-aware version so the file compiles (Task 4 makes it kerf-aware + tested):

```ts
export interface CutPlanStage { boardId: string; boardName: string; steps: string[] }
export interface CompositeCutPlan { stages: CutPlanStage[] }

export function compositeCutPlan(board: CompositeBoard, boards: readonly BoardProject[]): CompositeCutPlan {
  const steps: string[] = []
  for (const panel of board.panels) {
    const src = boards.find(b => b.id === panel.boardId)
    steps.push(`Panel "${src?.name ?? panel.boardId}": crosscut into ${panel.crosscut.count} pieces (${panel.crosscut.stripWidthMm}mm wide, ${panel.crosscut.kerfMm}mm kerf).`)
  }
  const placed = board.cells.filter((c): c is AssemblyCell => c !== null).length
  steps.push(`Assemble ${board.rows}×${board.cols} grid: place ${placed} pieces, then glue up.`)
  return { stages: [{ boardId: board.id, boardName: board.name, steps }] }
}
```

- [ ] **Step 5: Update `src/domain/compositeAssembly.ts`.** Remove `buildRegistry`, `selectableSourceBoardIds`, and the `import { boardDependsOn, type BoardRegistry }` / `CompositeBoard` import they needed. Keep `emptyCells`, `placeCell`, `clearCell`, `moveCell`, `resizeGrid`, `cellFromPointer`, `cycleTransform`, `pieceKey`. Update `tests/compositeAssembly.test.ts` to delete the `buildRegistry`/`selectableSourceBoardIds` describe blocks (and their imports). Run `pnpm test compositeAssembly` → green.

- [ ] **Step 6: Run tests to verify pass**

Run: `pnpm test compositeBoard compositeAssembly` → PASS.

- [ ] **Step 7: Full gate + commit**

Run: `pnpm test && pnpm lint && pnpm build` (storage.ts will still compile — `normalizeComposite` is reworked in Task 6; if it references removed types, temporarily map panels to `[]` to keep green, noted in Task 6 Step 1).

> If `storage.ts`'s `normalizeComposite` references `SourcePanel`/inline strips and breaks the build now, apply the **Task 6 Step 1 stopgap** (return `panels: []`) in this commit so the gate is green, then Task 6 implements the real migration.

```bash
git add src/types.ts src/domain/compositeBoard.ts src/domain/compositeAssembly.ts tests/compositeBoard.test.ts tests/compositeAssembly.test.ts src/storage.ts
git commit -m "feat(composite): panels reference boards (drop inline strips/derived/registry)"
```

---

### Task 4: Kerf accounting (source length, stock totals, cut plan)

**Files:**
- Modify: `src/domain/compositeBoard.ts`
- Test: `tests/compositeBoard.test.ts`

**Interfaces:**
- Produces:
  - `panelSourceLengthMm(panel: CompositePanel): number` = `count·(stripWidthMm + kerfMm)`.
  - `stockBySpecies(board: CompositeBoard, boards): SpeciesUsage[]` — board-feet of stock to cut (all `count` pieces per panel **plus kerf waste**), by species, sorted. Kerf waste per panel = `count · kerfMm · stackHeight · thickness`, split across species in proportion to the board's strip-volume.
  - `compositeCutPlan` step text includes the required source length incl. kerf.

- [ ] **Step 1: Failing tests** — append to `tests/compositeBoard.test.ts`

```ts
import { panelSourceLengthMm, stockBySpecies, compositeCutPlan } from '../src/domain/compositeBoard'

describe('kerf accounting', () => {
  it('source length per panel = count*(width+kerf)', () => {
    expect(panelSourceLengthMm(panel())).toBe(4 * (25 + 3))   // 112
  })
  it('stock includes all cut pieces plus kerf waste, by species', () => {
    // board strips maple30+walnut10 (height 40), thickness 20, crosscut 25mm x4, kerf 3
    // finished per species: maple 30*25*20=15000, walnut 10*25*20=5000 ; x4 cut pieces
    // kerf waste total = 4*3*40*20 = 9600, split maple:walnut = 30:10 => maple 7200, walnut 2400
    const stock = stockBySpecies(composite(), [board()])
    const cf = CUBIC_MM_PER_BOARD_FOOT
    expect(stock).toEqual([
      { speciesId: 'maple', boardFeet: (4 * 15000 + 7200) / cf },
      { speciesId: 'walnut', boardFeet: (4 * 5000 + 2400) / cf },
    ])
  })
  it('cut plan names the kerf-inclusive source length', () => {
    const plan = compositeCutPlan(composite(), [board()])
    expect(plan.stages[0]?.steps.some(s => /112\s*mm/.test(s))).toBe(true)
  })
})
```

- [ ] **Step 2: Run → FAIL** (`panelSourceLengthMm`/`stockBySpecies` not exported).

- [ ] **Step 3: Implement** — in `src/domain/compositeBoard.ts`

```ts
export function panelSourceLengthMm(panel: CompositePanel): number {
  const count = Math.max(0, Math.floor(panel.crosscut.count))
  return count * (nonNegative(panel.crosscut.stripWidthMm) + nonNegative(panel.crosscut.kerfMm))
}

export function stockBySpecies(board: CompositeBoard, boards: readonly BoardProject[]): SpeciesUsage[] {
  const totals: Record<string, number> = {}
  for (const panel of board.panels) {
    const src = boards.find(b => b.id === panel.boardId)
    if (!src) continue
    const count = Math.max(0, Math.floor(panel.crosscut.count))
    const width = nonNegative(panel.crosscut.stripWidthMm)
    const kerf = nonNegative(panel.crosscut.kerfMm)
    const thickness = nonNegative(src.thickness)
    const stackHeight = src.strips.reduce((a, s) => a + nonNegative(s.width), 0)
    const kerfWaste = count * kerf * stackHeight * thickness
    const stripTotal = stackHeight || 1
    for (const strip of src.strips) {
      const sw = nonNegative(strip.width)
      const finished = count * sw * width * thickness
      const waste = kerfWaste * (sw / stripTotal)
      totals[strip.speciesId] = (totals[strip.speciesId] ?? 0) + finished + waste
    }
  }
  return Object.entries(totals)
    .map(([speciesId, volume]) => ({ speciesId, boardFeet: volume / CUBIC_MM_PER_BOARD_FOOT }))
    .sort((a, b) => a.speciesId.localeCompare(b.speciesId))
}
```
Update `compositeCutPlan`'s per-panel step to include the source length:

```ts
steps.push(`Panel "${src?.name ?? panel.boardId}": rip glue-up, then crosscut into ${panel.crosscut.count} pieces (${panel.crosscut.stripWidthMm}mm wide, ${panel.crosscut.kerfMm}mm kerf) — needs ${panelSourceLengthMm(panel)}mm of source length.`)
```

- [ ] **Step 4: Run → PASS.** `pnpm test compositeBoard`.

- [ ] **Step 5: Gate + commit**

```bash
git add src/domain/compositeBoard.ts tests/compositeBoard.test.ts
git commit -m "feat(composite): kerf-accurate source length, stock totals, and cut plan"
```

---

### Task 5: Explicit transform helpers (free 8-orientation)

**Files:**
- Modify: `src/domain/compositeAssembly.ts`
- Test: `tests/compositeAssembly.test.ts`

**Interfaces:**
- Produces (each returns a new `AssemblyCell`, preserving `panelId`/`pieceIndex`): `rotateRight(cell)` (+90), `rotateLeft(cell)` (−90), `flipX(cell)` (horizontal mirror — toggles `flip`), `flipY(cell)` (vertical mirror — `flip` toggle + 180° rotation). `cycleTransform` stays.

- [ ] **Step 1: Failing tests** — append to `tests/compositeAssembly.test.ts`

```ts
import { rotateLeft, rotateRight, flipX, flipY } from '../src/domain/compositeAssembly'

describe('explicit transforms', () => {
  it('rotateRight/Left step by ±90 and wrap', () => {
    expect(rotateRight(cell({ rotate: 270 })).rotate).toBe(0)
    expect(rotateLeft(cell({ rotate: 0 })).rotate).toBe(270)
  })
  it('flipX toggles the horizontal mirror only', () => {
    expect(flipX(cell({ flip: false, rotate: 90 }))).toMatchObject({ flip: true, rotate: 90 })
  })
  it('flipY mirrors vertically = flip + 180', () => {
    expect(flipY(cell({ flip: false, rotate: 0 }))).toMatchObject({ flip: true, rotate: 180 })
    expect(flipY(cell({ flip: false, rotate: 90 }))).toMatchObject({ flip: true, rotate: 270 })
  })
  it('preserves identity', () => {
    expect(rotateRight(cell({ panelId: 'P', pieceIndex: 3 }))).toMatchObject({ panelId: 'P', pieceIndex: 3 })
  })
})
```
(`cell` helper already defined in this test file.)

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — append to `src/domain/compositeAssembly.ts`

```ts
const ROT: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270]
export function rotateRight(cell: AssemblyCell): AssemblyCell {
  const i = ROT.indexOf(cell.rotate)
  return { ...cell, rotate: ROT[(i + 1) % 4] ?? 0 }
}
export function rotateLeft(cell: AssemblyCell): AssemblyCell {
  const i = ROT.indexOf(cell.rotate)
  return { ...cell, rotate: ROT[(i + 3) % 4] ?? 0 }
}
export function flipX(cell: AssemblyCell): AssemblyCell {
  return { ...cell, flip: !cell.flip }
}
export function flipY(cell: AssemblyCell): AssemblyCell {
  const i = ROT.indexOf(cell.rotate)
  return { ...cell, flip: !cell.flip, rotate: ROT[(i + 2) % 4] ?? 0 }
}
```

- [ ] **Step 4: Run → PASS.** `pnpm test compositeAssembly`.

- [ ] **Step 5: Gate + commit**

```bash
git add src/domain/compositeAssembly.ts tests/compositeAssembly.test.ts
git commit -m "feat(composite): explicit rotate/flip transform helpers"
```

---

### Task 6: Storage — new panel shape + Phase-1 migration

**Files:**
- Modify: `src/storage.ts`
- Test: `tests/storage.test.ts`

**Interfaces:**
- Consumes: existing helpers `records`, `stringValue`, `finiteNumber`, `signedFinite`, `createId`, `isRecord`; `CompositeBoard`, `CompositePanel`, `AssemblyCell`, `BoardProject`.
- Produces: `normalizeData(...).composites` with `panels: CompositePanel[]`. **Migration:** a legacy panel carrying inline `strips` (old `kind:'rip'`) becomes a new `BoardProject` (pushed into `boards`) plus a `{ id, boardId, crosscut }` reference; legacy `kind:'derived'` panels are dropped and their cells nulled; legacy saves with no composites → `[]`.

- [ ] **Step 1 (stopgap, if not already done in Task 3):** ensure `normalizeComposite` compiles against the new types. If reworking incrementally, first make it return `panels: []` and `cells: …` to keep green, then implement the migration below.

- [ ] **Step 2: Failing tests** — append to `tests/storage.test.ts`

```ts
it('keeps composites empty for legacy saves', () => {
  const legacy = { shops: [], boards: [] } as unknown as AtlasData
  expect(normalizeData(legacy).composites).toEqual([])
})

it('migrates a Phase-1 inline-strip composite panel into a board + reference', () => {
  const data = normalizeData({
    shops: [], boards: [],
    composites: [{
      id: 'c', name: 'Old', rows: 1, cols: 1, updatedAt: '2026-06-25T00:00:00.000Z',
      panels: [{ id: 'p', name: 'Base', kind: 'rip', construction: 'edge', thicknessMm: 20,
        strips: [{ id: 's', speciesId: 'walnut', width: 38, trailingAngle: 0 }],
        crosscut: { stripWidthMm: 25, kerfMm: 3, count: 4 } }],
      cells: [{ panelId: 'p', pieceIndex: 0, rotate: 0, flip: false }],
    }],
  } as unknown as Partial<AtlasData>)
  const comp = data.composites[0]!
  expect(comp.panels).toHaveLength(1)
  const ref = comp.panels[0]!
  expect(ref).toMatchObject({ id: 'p', crosscut: { stripWidthMm: 25, count: 4 } })
  const migratedBoard = data.boards.find(b => b.id === ref.boardId)
  expect(migratedBoard?.construction).toBe('edge')
  expect(migratedBoard?.strips[0]).toMatchObject({ speciesId: 'walnut', width: 38 })
  expect(migratedBoard?.thickness).toBe(20)
})

it('drops legacy derived panels and nulls their cells', () => {
  const data = normalizeData({
    shops: [], boards: [],
    composites: [{ id: 'c', name: 'D', rows: 1, cols: 1, updatedAt: '',
      panels: [{ id: 'd', name: 'Recut', kind: 'derived', construction: 'end', sourceBoardId: 'x', crosscut: { stripWidthMm: 20, kerfMm: 3, count: 2 } }],
      cells: [{ panelId: 'd', pieceIndex: 0, rotate: 0, flip: false }] }],
  } as unknown as Partial<AtlasData>)
  expect(data.composites[0]!.panels).toEqual([])
  expect(data.composites[0]!.cells).toEqual([null])
})
```

- [ ] **Step 3: Run → FAIL.** `pnpm test storage`.

- [ ] **Step 4: Implement** — rewrite `normalizeComposite` + add `migratePanel`. Add `CompositePanel`, `BoardProject` to the type imports. New helper (placed near `normalizeComposite`):

```ts
function normalizeComposite(raw: Record<string, unknown>, boardSink: BoardProject[]): CompositeBoard {
  const rows = Math.max(1, Math.floor(finiteNumber(raw['rows'], 1)))
  const cols = Math.max(1, Math.floor(finiteNumber(raw['cols'], 1)))
  const rawCells = Array.isArray(raw['cells']) ? raw['cells'] : []
  const droppedPanelIds = new Set<string>()
  const panels: CompositePanel[] = []
  for (const rawPanel of records(raw['panels'])) {
    const crosscut = (rawPanel['crosscut'] ?? {}) as Record<string, unknown>
    const cc = {
      stripWidthMm: finiteNumber(crosscut['stripWidthMm'], 25),
      kerfMm: finiteNumber(crosscut['kerfMm'], 3),
      count: Math.max(0, Math.floor(finiteNumber(crosscut['count'], 1))),
    }
    const id = stringValue(rawPanel['id'], createId())
    // New shape: a direct board reference.
    if (typeof rawPanel['boardId'] === 'string') {
      panels.push({ id, boardId: rawPanel['boardId'], crosscut: cc })
      continue
    }
    // Legacy 'rip' (inline strips) → create a board + reference it.
    if (rawPanel['kind'] === 'rip') {
      const boardId = createId()
      boardSink.push({
        id: boardId,
        name: stringValue(rawPanel['name'], 'Migrated panel'),
        length: 300,
        thickness: finiteNumber(rawPanel['thicknessMm'], 38),
        construction: rawPanel['construction'] === 'end' ? 'end' : 'edge',
        endGrain: normalizeEndGrain(undefined, finiteNumber(rawPanel['thicknessMm'], 38)),
        allowances: DEFAULT_ALLOWANCES,
        strips: records(rawPanel['strips']).map(s => ({
          id: stringValue(s['id'], createId()),
          speciesId: stringValue(s['speciesId'], 'walnut'),
          width: finiteNumber(s['width'], 38),
          trailingAngle: signedFinite(s['trailingAngle'], 0),
        })),
        updatedAt: new Date().toISOString(),
      })
      panels.push({ id, boardId, crosscut: cc })
      continue
    }
    // Legacy 'derived' (recursion) → dropped; remember to null its cells.
    droppedPanelIds.add(id)
  }
  const cells = Array.from({ length: rows * cols }, (_, i) => {
    const c = normalizeCell(rawCells[i])
    return c && !droppedPanelIds.has(c.panelId) ? c : null
  })
  return {
    id: stringValue(raw['id'], createId()),
    name: stringValue(raw['name'], 'Composite board'),
    rows, cols, panels, cells,
    updatedAt: stringValue(raw['updatedAt'], new Date().toISOString()),
  }
}
```

Wire it in `normalizeData`: build composites with a shared board sink so migrated boards land in `boards`:

```ts
const migratedBoards: BoardProject[] = []
const composites = records(data.composites).map(c => normalizeComposite(c, migratedBoards))
return {
  // …existing…
  boards: [...boards.map(normalizeBoardProject /* existing inline mapper */), ...migratedBoards],
  composites,
}
```
(Adapt to the existing `boards: boards.map(...)` expression — append `...migratedBoards`. `normalizeCell` already exists; reuse it. `DEFAULT_ALLOWANCES` is already imported.)

- [ ] **Step 5: Run → PASS.** `pnpm test storage`.

- [ ] **Step 6: Full gate + commit**

Run: `pnpm test && pnpm lint && pnpm build`.

```bash
git add src/storage.ts tests/storage.test.ts
git commit -m "feat(composite): persist board-ref panels + migrate Phase-1 composites"
```

---

## Phase C — UI (build/lint + manual)

> The repo has no component tests; Phase C tasks verify with `pnpm build && pnpm lint` (0 warnings) + `pnpm test` (existing suite green), and the manual tablet pass in Task 11. Each component imports the engine/assembly functions by their Phase-B signatures.

### Task 7: `CompositePieceFace` (rework) + fit-to-container scale helper

**Files:**
- Create: `src/components/composite/CompositePieceFace.tsx`

**Interfaces:**
- Consumes: `Piece`, `placedFootprint` from `compositeBoard.ts`; `AssemblyCell`, `WoodSpecies` from types; `boardScale.fitPxPerMm`.
- Produces: `CompositePieceFace({ piece, cell }: { piece: Piece; cell: AssemblyCell }): JSX.Element` — an SVG `<g>` sized to the placed footprint; renders the piece's strip bands filled `url(#long-<id>)` when `piece.construction==='edge'`, else `url(#end-<id>)`; applies rotate-about-center + horizontal flip when `cell.flip`. (No `panel` prop — `Piece` now carries `construction` and `bySpecies`; render bands from `bySpecies` proportions in a stable species order.)

- [ ] **Step 1: Implement** — render bands from `piece.bySpecies` (proportional heights, sorted by speciesId for stability), rotate/flip as in the prior version. Fill prefix from `piece.construction`. Use the prior component (git history) as the base; drop the `panel`/`pxPerMm` props and the neutral-derived branch.

```tsx
import type { AssemblyCell, WoodSpecies } from '../../types'
import type { Piece } from '../../domain/compositeBoard'
import { placedFootprint } from '../../domain/compositeBoard'

export function CompositePieceFace({ piece, cell }: { piece: Piece; cell: AssemblyCell }) {
  const fp = placedFootprint(piece, cell)
  const cx = fp.widthMm / 2, cy = fp.heightMm / 2
  const flip = cell.flip ? `translate(${fp.widthMm} 0) scale(-1 1)` : ''
  const rotate = `rotate(${cell.rotate} ${cx} ${cy})`
  const prefix = piece.construction === 'end' ? 'end' : 'long'
  const entries = Object.entries(piece.bySpecies).sort(([a], [b]) => a.localeCompare(b))
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1
  const bands = entries.reduce<{ id: string; y: number; h: number }[]>((acc, [id, v]) => {
    const h = (v / total) * piece.heightMm
    const y = acc.length ? acc[acc.length - 1]!.y + acc[acc.length - 1]!.h : 0
    return [...acc, { id, y, h }]
  }, [])
  return (
    <g transform={`${rotate} ${flip}`}>
      {bands.map(b => <rect key={b.id} x={0} y={b.y} width={piece.widthMm} height={b.h} fill={`url(#${prefix}-${b.id})`} stroke="#0003" strokeWidth={0.3} />)}
    </g>
  )
}
export type { WoodSpecies }   // (remove if it trips noUnusedLocals)
```
(Confirm `fitPxPerMm` exists in `boardScale.ts`; it's used by the canvas in Task 8, not here.)

- [ ] **Step 2: `pnpm build && pnpm lint` (0 warnings); `pnpm test` green. Commit:**

```bash
git add src/components/composite/CompositePieceFace.tsx
git commit -m "feat(composite-ui): piece face renders from piece.construction + bySpecies"
```

---

### Task 8: `PanelRail`, `AssemblyCanvas`, `CompositeSummary` (rework)

**Files:**
- Create: `src/components/composite/PanelRail.tsx`, `AssemblyCanvas.tsx`, `CompositeSummary.tsx`

**Interfaces:**
- Consumes: engine `panelPieces`, `placedFootprint`, `assembledSize`, `materialBySpecies`, `stockBySpecies`, `compositeCutPlan`; assembly `cellFromPointer`, `placeCell`, `clearCell`, `moveCell`, `cycleTransform`, `rotateLeft`, `rotateRight`, `flipX`, `flipY`, `pieceKey`; `boardScale.fitPxPerMm`; `useContainerWidth`/`useElementSize`, `usePinchPan`, `WoodPatterns`, `NumberField`, `CompositePieceFace`; `BoardProject`, `CompositeBoard`, `CompositePanel`, `WoodSpecies`.
- Produces:
  - `PanelRail({ composite, boards, woods, selectedPieceKey, onSelectPiece, onChange, onAddInline, onPickBoard, onEditPanel }): JSX.Element` — one card per panel: **board thumbnail** (reuse the board SVG renderers via the panel's board), name, **crosscut steppers** (count −/+, plus width/kerf `NumberField`s), **tray of piece chips** (`CompositePieceFace` in a small svg with `<WoodPatterns>` `<defs>`), a **remove ✕** (drops panel + nulls referencing cells), and an **edit** affordance (`onEditPanel(boardId)`). A footer **"+ Add panel"** offers **Design new** (`onAddInline()`) and **Pick existing board** (a `<select>` of `boards`, `onPickBoard(boardId)`).
  - `AssemblyCanvas({ composite, boards, woods, selectedPieceKey, onChange, onConsumeSelection }): JSX.Element` — **fit-to-container** grid: compute `pxPerMm = fitPxPerMm(contentW, contentH, boxW, boxH)` (use `useElementSize` for both axes) so the grid fills the area with large cells. Same tap-place / tap-cycle / drag-move(swap) / ✕-clear / `usePinchPan` interactions as before (reuse the prior `AssemblyCanvas`, swapping `resolveScale`→`fitPxPerMm`, `buildRegistry/registry`→`boards`, and `panel`-typed code to the board model). Add an **inline transform toolbar** for the most-recently-placed/selected cell: buttons calling `rotateLeft`/`rotateRight`/`flipX`/`flipY` on that cell via `onChange`.
  - `CompositeSummary({ composite, boards, woods }): JSX.Element` — finished `assembledSize`; **Material** table with **Finished** (`materialBySpecies`) and **Stock incl. kerf** (`stockBySpecies`) columns (species names from `woods`, with a `<thead>`); the staged `compositeCutPlan` steps.

- [ ] **Step 1:** Implement the three components per the interfaces above, porting the prior versions (git history) to the board-ref model and the fit-to-container scale. Key changes vs prior: signatures take `boards` not a composite registry; `panelPieces(panel, boards)`; the canvas uses `fitPxPerMm` and adds the transform toolbar; the summary adds the stock/kerf column; chips embed `<WoodPatterns>` so they show wood fills.

- [ ] **Step 2: Build/lint/test green. Commit:**

```bash
git add src/components/composite/PanelRail.tsx src/components/composite/AssemblyCanvas.tsx src/components/composite/CompositeSummary.tsx
git commit -m "feat(composite-ui): board-ref panel rail, fit-to-container canvas w/ transform toolbar, kerf summary"
```

---

### Task 9: `CompositeScreen` + panel add/edit wiring

**Files:**
- Create: `src/components/composite/CompositeScreen.tsx`

**Interfaces:**
- Consumes: `PanelRail`, `AssemblyCanvas`, `CompositeSummary`; `resizeGrid`, `pieceKey`; `NumberField`; `createId`; `BoardProject`, `CompositeBoard`, `CompositePanel`, `WoodSpecies`.
- Produces: `CompositeScreen({ composite, boards, woods, onChange, onCreateBoardForPanel, onEditBoard, onBack }): JSX.Element`. Local UI state: `selectedPieceKey`. Renders a header (name input, **Rows/Cols count steppers** via `NumberField` using `resizeGrid`), `PanelRail`, `AssemblyCanvas`, `CompositeSummary`. **Add panel inline** → `onCreateBoardForPanel()` (App creates a blank board, returns its id) then append `{ id: createId(), boardId, crosscut: default }`. **Pick existing** → append a panel referencing the chosen board. **Edit panel** → `onEditBoard(boardId)` (App switches to the board designer for that board). **Remove panel** → drop panel + null referencing cells.

- [ ] **Step 1:** Implement per interface (compose the Task-8 components; wire add/edit/remove and grid steppers). Default crosscut: `{ stripWidthMm: 25, kerfMm: 3, count: 4 }`.

- [ ] **Step 2: Build/lint/test green. Commit:**

```bash
git add src/components/composite/CompositeScreen.tsx
git commit -m "feat(composite-ui): composite screen (panels + canvas + summary + grid steppers)"
```

---

### Task 10: Cutting Boards gallery + unified selector + App wiring + "Make composite"

**Files:**
- Create: `src/components/BoardGallery.tsx`
- Modify: `src/App.tsx`, `src/components/BoardDesigner.tsx`

**Interfaces:**
- Consumes: `BoardDesigner`, `CompositeScreen`, `BoardGallery`; `createId`; `BoardProject`, `CompositeBoard`.
- Produces:
  - `BoardGallery({ boards, composites, onOpenBoard, onOpenComposite, onCreateBoard }): JSX.Element` — a card grid of boards (true-to-scale mini preview) and composites (badged "Composite"), plus a **+ New board** card. Cards call `onOpenBoard(id)` / `onOpenComposite(id)`.
  - In `src/App.tsx`: the Cutting Boards section (`view === 'boards'`) shows a small internal mode: **gallery** (default) vs **board designer** vs **composite screen**, tracked by `activeBoard`/`activeComposite` + a `boardsMode` (`'gallery' | 'board' | 'composite'`) local state (no new top-level view). Re-add `activeComposite` state + `composites` create/update/delete callbacks (removed in Task 2) — now scoped to this section. `onCreateBoardForPanel` creates a blank `BoardProject`, returns its id (for inline panels). `onEditBoard(id)` switches to board mode for that board (with a back-to-composite affordance). Brand→Home (Task 1) and the gallery "back" return to the gallery.
  - In `BoardDesigner`: add a **"Make composite board"** button near the build summary → calls a prop `onMakeComposite(board)` that (in App) creates a `CompositeBoard` with one panel `{ id: createId(), boardId: board.id, crosscut: default }`, a 1×1 grid with that piece placed, switches the section to the composite screen.

- [ ] **Step 1:** Implement `BoardGallery`; wire the Cutting Boards section modes + callbacks in `App.tsx`; add the "Make composite" button + `onMakeComposite` prop to `BoardDesigner`. Ensure undo/redo `Snapshot` includes `activeComposite` + `boardsMode` if they affect restored UI (mirror `activeBoard`).

- [ ] **Step 2: Full gate** `pnpm test && pnpm lint && pnpm build` (green, 0 warnings). **Commit:**

```bash
git add src/components/BoardGallery.tsx src/App.tsx src/components/BoardDesigner.tsx
git commit -m "feat(composite-ui): cutting-boards gallery, unified selection, Make-composite entry"
```

---

### Task 11: Manual tablet pass + cleanup

- [ ] **Step 1: Full gate.** `pnpm test && pnpm lint && pnpm build` — all green, 0 warnings.

- [ ] **Step 2: Manual pass** (`pnpm dev`, coarse-pointer / tablet):
  - Cutting Boards opens to the **gallery**; **+ New board** → designer; **Make composite** → composite screen with the board as panel #1.
  - Add a 2nd panel **inline** (opens designer, returns) and by **picking an existing board**; set crosscuts.
  - Place pieces across a multi-cell grid; **rotate ⟲/⟳ and flip-H/flip-V** a placed piece (all 8 orientations reachable); drag to move/swap; ✕ clears.
  - **Canvas fills the area** with large touchable cells; **Rows/Cols are counts** (no "(mm)"); pinch-zoom works.
  - Summary shows finished size + **Finished and Stock-incl-kerf** material; cut plan names the **kerf-inclusive source length**.
  - **Brand → Home** from anywhere; **Preston's Button** in the top bar toggles units; **no Notion** element anywhere.
  - Reload → composites + boards persist; a Phase-1 composite (if present) migrated to board-ref panels without breaking existing boards.

- [ ] **Step 3:** Address anything the manual pass surfaces (small fixes), keep the gate green, commit.

---

## Self-Review

**Spec coverage:**
- Spawn-from-board + separate object under Cutting boards → Task 10 (Make composite, section modes). Panels = board references → Task 3. Both panel sources (inline/pick) → Tasks 9–10. Unified selector + **gallery landing** → Task 10. Free 8-orientation via explicit controls → Task 5 (helpers) + Task 8 (toolbar). **Kerf** in source length + cut plan + material/stock → Task 4 + Task 8 summary. Canvas fit-to-container + count steppers → Task 8. Migration of Phase-1 composites → Task 6. App housekeeping (brand→Home, Preston's Button to top bar, purge Notion) → Task 1.
- **Deferred (spec):** picking an existing *composite* as a panel (recursion); pattern templates; printable build-sheet polish; real-device touch hardening — not in any task, intentionally.

**Placeholder scan:** Domain Tasks 3–6 carry full test + impl code. UI Tasks 7–10 specify exact props/signatures + reuse of named prior components (git history) and are verified by build/lint + the Task 11 manual pass, per the repo's no-component-test convention (Global Constraints) — not placeholders.

**Type consistency:** `CompositePanel { id, boardId, crosscut }`, `Piece { …, construction }`, and the `(board, boards)`/`(panel, boards)` signatures are used identically across Tasks 3–10. `pieceKey`, `placedFootprint`, the transform helpers, and grid ops keep stable names. The old `SourcePanel`/`RipPanel`/`DerivedPanel`/`BoardRegistry`/`boardDependsOn`/`buildRegistry`/`selectableSourceBoardIds` are removed in Tasks 2–3 and referenced nowhere after.
