# Composite Assembly Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the rows×cols composite grid with a row-based "Lego parts-bag" assembly: panels are boards sliced into strips (X/Y), wafers fill rows, and the finished board is the cropped 4-sided rectangle — with live both-axis trim markings, a centered/responsive cropped preview, placed-wafers-only material accounting, single-construction enforcement, and an imperial whole/½″ stepping fix.

**Architecture:** Pure domain (`compositeBoard.ts` geometry/crop/material, `compositeAssembly.ts` row/wafer ops) is reworked and TDD'd; React components are thin and reuse the board SVG renderers, `usePinchPan`, and the board designer. Data model moves from `{panels{boardId,crosscut}, rows, cols, cells}` to `{construction, panels{boardId,cut{axis,…}}, rows:[{wafers}]}` with a migration.

**Tech Stack:** TypeScript (strict), React 19, Vitest 4, pnpm. No new deps.

**Spec:** `docs/plans/COMPOSITE_ASSEMBLY_DESIGN.md`.

## Global Constraints

- pnpm; `pnpm test`, `pnpm lint` (**0 warnings**), `pnpm build` green before every commit.
- Pure logic in `src/domain/`, no React/DOM; tests in `tests/*.test.ts` (imports at top of file). Repo has **no React component tests** — components verified by build/lint + the manual pass.
- Strict TS: `verbatimModuleSyntax` (`import type`), `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`; ESLint honors `^_` and flags in-render mutation (build accumulations functionally).
- All dimensions mm; px only via `pxPerMm`; 1 SVG unit = 1 mm. Touch-first: reuse `@media (pointer:coarse)` sizing; canvas wrappers `touch-action:none`.
- Additive/migration-safe: existing boards/shops/woods unaffected; existing composites migrate.
- IDs from `createId` in `src/id`.
- **Crop rule:** finished board = per-row Y-crop to shortest wafer + X-crop to narrowest row, both centered; overhang = waste. Material counts **placed wafers only** (finished = cropped, waste = trim + kerf). **One construction** per composite (no edge/end mixing).

---

## File Structure

- **Modify** `src/types.ts` — `CompositePanel.cut{axis,stripWidthMm,kerfMm,count}`; `PlacedWafer`; `CompositeRow`; `CompositeBoard{construction, panels, rows}` (drop `rows:number/cols/cells`).
- **Modify** `src/domain/compositeBoard.ts` — `panelPieces(panel,boards)` per axis; `Piece{…,strips}`; `croppedLayout`; `assembledSize`; `materialBySpecies`/`stockBySpecies`; `compositeCutPlan`. Drop grid helpers.
- **Modify** `src/domain/compositeAssembly.ts` — row/wafer ops (`addRow`,`removeRow`,`moveRow`,`insertRowFromMiddle`; `addWafer`,`removeWafer`,`moveWafer`,`transformWafer`); keep `rotateLeft/Right/flipX/flipY/cycleTransform`,`pieceKey`. Drop `emptyCells/placeCell/clearCell/moveCell/resizeGrid/cellFromPointer`.
- **Modify** `src/domain/lengthUnits.ts` — imperial snapping to whole/½″.
- **Modify** `src/storage.ts` — `normalizeComposite` new shape + grid→rows migration.
- **Create** `src/components/composite/PartsBag.tsx`, `AssemblyDesk.tsx`, `FinalPreview.tsx`, `WaferFace.tsx` (rename of `CompositePieceFace`); **rewrite** `CompositeScreen.tsx`, `CompositeSummary.tsx`; **delete** `PanelRail.tsx`, `AssemblyCanvas.tsx`.
- **Modify** `src/App.tsx` — composite create/make uses `construction` + `rows`; pass through.
- **Modify** `src/styles.css` — desk/parts-bag/preview/trim styles.
- **Tests:** `tests/compositeBoard.test.ts`, `tests/compositeAssembly.test.ts`, `tests/storage.test.ts`, `tests/lengthUnits.test.ts` (rework/extend).

---

## Phase A — Imperial stepping fix (standalone)

### Task 1: Preston's Button snaps imperial to whole/½″

**Files:** Modify `src/domain/lengthUnits.ts`; Test `tests/lengthUnits.test.ts`.

**Interfaces:** Produces `snapLengthMm(mm: number, unit: LengthUnit): number` — metric returns `mm` unchanged; imperial snaps to the nearest **½ inch** (12.7 mm) grid. Consumed by `LengthInput` commit + steppers so imperial values don't overflow/overlap.

- [ ] **Step 1: Failing test** — add to `tests/lengthUnits.test.ts` (create if absent):

```ts
import { describe, expect, it } from 'vitest'
import { snapLengthMm } from '../src/domain/lengthUnits'
const IN = 25.4
describe('snapLengthMm', () => {
  it('leaves metric untouched', () => { expect(snapLengthMm(123.4, 'metric')).toBe(123.4) })
  it('snaps imperial to the nearest half inch', () => {
    expect(snapLengthMm(1.1 * IN, 'imperial')).toBeCloseTo(1.0 * IN, 5)   // 1.1" → 1"
    expect(snapLengthMm(1.3 * IN, 'imperial')).toBeCloseTo(1.5 * IN, 5)   // 1.3" → 1½"
    expect(snapLengthMm(0.2 * IN, 'imperial')).toBeCloseTo(0.5 * IN, 5)   // never 0 for a positive value? round-to-nearest gives 0; allow it
  })
})
```

- [ ] **Step 2: Run → FAIL** `pnpm test lengthUnits`.

- [ ] **Step 3: Implement** in `src/domain/lengthUnits.ts`:

```ts
export function snapLengthMm(mm: number, unit: LengthUnit): number {
  if (unit !== 'imperial') return mm
  const half = 25.4 / 2
  return Math.round(mm / half) * half
}
```

- [ ] **Step 4: Wire it** — in `src/components/fields.tsx` `LengthInput.commit`, snap the parsed value in imperial before `onChange`: `const next = clamp(snapLengthMm(parsed, lengthUnit), min, max)`. Import `snapLengthMm`. (Metric path unchanged.)

- [ ] **Step 5: Run → PASS**; `pnpm test && pnpm lint && pnpm build`. **Commit:** `fix(units): snap imperial inputs to whole/half inch (Preston's Button)`.

---

## Phase B — Domain rework (TDD)

### Task 2: New data model (types) + storage migration

**Files:** Modify `src/types.ts`, `src/storage.ts`; Test `tests/storage.test.ts`.

**Interfaces:** Produces the types in the spec's "Data model" block. `normalizeComposite(raw, boardSink, allowances)` → new shape; migrates legacy `{panels{boardId,crosscut}, rows, cols, cells}` → `{construction, panels{boardId,cut{axis:'x',…}}, rows:[{id,wafers}]}` (group non-null cells by grid row; `construction` from first panel's board, else `'edge'`); legacy inline-strip panels still convert to a board (as today) then reference; empty → `[]`.

- [ ] **Step 1** Update `src/types.ts` per spec (CompositePanel.cut, PlacedWafer, CompositeRow, CompositeBoard{construction,panels,rows}; remove rows/cols/cells). Keep `CrosscutSpec` only if still used elsewhere (rename usage to `cut`).
- [ ] **Step 2** Failing storage tests: legacy grid composite → migrated rows; cut.axis defaults 'x'; construction inferred; empty stays []. (Full test code: assert `data.composites[0].rows` length = old non-empty grid rows, each row's `wafers` length = placed cells in that row, `panels[0].cut.axis==='x'`, `construction` set.)
- [ ] **Step 3** Run → FAIL.
- [ ] **Step 4** Implement `normalizeComposite` migration + `normalizeRow`/`normalizeWafer`/`normalizePanelCut`. Keep the board-sink pattern (migrated inline-strip panels still spawn boards).
- [ ] **Step 5** Run → PASS; full gate. **Commit:** `feat(composite): row-based data model + migrate legacy grid composites`.

### Task 3: `panelPieces` per cut axis + `Piece.strips`

**Files:** Modify `src/domain/compositeBoard.ts`; Test `tests/compositeBoard.test.ts`.

**Interfaces:** `interface Piece { panelId; index; widthMm; heightMm; thicknessMm; strips:{speciesId;widthMm}[]; bySpecies:Record<string,number> }`. `panelPieces(panel,boards):Piece[]`:
- **axis 'x' (crosscut, end grain):** `widthMm = Σ strip widths (W)`, `heightMm = board.thickness (T)`, `thicknessMm = cut.stripWidthMm (slice)`, `strips` = board strips ordered (widths = strip widths), `bySpecies[species] += w_i·T·slice`. `count = cut.count`.
- **axis 'y' (rip, long grain):** `widthMm = board.length (L)`, `heightMm = cut.stripWidthMm (rip width)`, `thicknessMm = board.thickness (T)`, `strips = [{speciesId: dominantSpecies, widthMm: L}]` (single long band; dominant = widest strip's species), `bySpecies = { dominant: L·cut.stripWidthMm·T }`. `count = cut.count`.
- Missing board → `[]`.

- [ ] **Step 1** Failing tests for both axes (concrete numbers: board strips maple30+walnut10, T=20, L=300; X cut slice 25×4 → wafer 40×20×25, strips ordered, bySpecies maple 30·20·25 / walnut 10·20·25; Y cut rip 25×4 → wafer 300×25×20, dominant maple).
- [ ] **Step 2** Run → FAIL.
- [ ] **Step 3** Implement `panelPieces` with the axis branch + `placedFootprint` (unchanged: swap on 90/270).
- [ ] **Step 4** Run → PASS; gate. **Commit:** `feat(composite): panelPieces slices a board along X (crosscut) or Y (rip)`.

### Task 4: `croppedLayout` + `assembledSize`

**Files:** Modify `src/domain/compositeBoard.ts`; Test `tests/compositeBoard.test.ts`.

**Interfaces:** `interface RowLayout { wafers:{ wafer:PlacedWafer; piece:Piece; keptWidthMm:number; keptHeightMm:number; trimLeftMm:number; trimRightMm:number; trimTopMm:number; trimBottomMm:number }[]; heightMm:number }`; `croppedLayout(board,boards):{ rows:RowLayout[]; lengthMm:number; widthMm:number }`. Logic: each placed wafer footprint via `placedFootprint`; per row Y-crop = min footprint height (taller wafers trimmed top+bottom, centered); X target = min over rows of (Σ footprint widths in row); each row's wafers trimmed left/right centered to reach target width (trim the overflow off the row ends, centered). `assembledSize(board,boards) = { lengthMm:Σ row.heightMm, widthMm:target, thicknessMm:max slice }`.

- [ ] **Step 1** Failing tests with a 2-row mixed example (row1 widths sum 120 height 20; row2 sum 90 height 30 with one 40-tall wafer): target width=90; row1 trims (120-90)/2 each end; row2 Y-crops the 40-tall to 30; assembledSize length=20+30=50, width=90.
- [ ] **Step 2** Run → FAIL.
- [ ] **Step 3** Implement `croppedLayout` + `assembledSize`.
- [ ] **Step 4** Run → PASS; gate. **Commit:** `feat(composite): cropped 4-sided layout (Y shortest-per-row, X narrowest-row, centered)`.

### Task 5: Material — placed wafers, finished vs trim+kerf waste

**Files:** Modify `src/domain/compositeBoard.ts`; Test `tests/compositeBoard.test.ts`.

**Interfaces:** `materialBySpecies(board,boards):{speciesId;boardFeet}[]` = **finished** (kept/cropped) volume by species, sorted. `stockBySpecies(board,boards):{speciesId;boardFeet}[]` = full placed-wafer volume + kerf, by species. finished ≤ stock; waste = stock − finished. `compositeCutPlan(board,boards)` lists per-panel slice (axis, count, kerf, source length) + assemble + trim step.

- [ ] **Step 1** Failing tests: finished uses cropped fraction of each wafer (kept area / full area × volume); stock uses full wafers + kerf; conservation (finished + computed waste = stock).
- [ ] **Step 2** Run → FAIL.
- [ ] **Step 3** Implement using `croppedLayout` kept dimensions for finished, full `piece` volume + kerf for stock.
- [ ] **Step 4** Run → PASS; gate. **Commit:** `feat(composite): placed-wafer material — finished (cropped) vs trim+kerf waste`.

### Task 6: Row/wafer operations

**Files:** Modify `src/domain/compositeAssembly.ts`; Test `tests/compositeAssembly.test.ts`.

**Interfaces (all immutable, return new `CompositeBoard`):** `addRow(board, where:'above'|'below', refRowId?)`, `removeRow(board,rowId)`, `moveRow(board,rowId,toIndex)`, `addWaferToRow(board,rowId,wafer)` (appends; "build from middle" handled by the active row being the middle by default), `removeWafer(board,rowId,index)`, `moveWafer(board,fromRow,fromIndex,toRow,toIndex)`, `transformWafer(board,rowId,index,fn)` where `fn` ∈ rotateLeft/Right/flipX/flipY/cycleTransform. Keep those transform fns + `pieceKey`. New composites start with one empty middle row.

- [ ] **Step 1** Failing tests for each op (add/remove/move row; add/remove/move/transform wafer; immutability).
- [ ] **Step 2** Run → FAIL. **Step 3** Implement. **Step 4** Run → PASS; gate (drop the deleted grid-op tests). **Commit:** `feat(composite): immutable row + wafer operations`.

---

## Phase C — UI (build/lint + manual)

### Task 7: `WaferFace` (rework `CompositePieceFace`)
Render a wafer's face from `Piece.strips` (ordered columns spanning `widthMm`, full `heightMm`), end-grain fill for X-cut / long-grain for Y-cut (pass a `grain:'end'|'long'` derived from the panel's axis, or carry on `Piece`). Rotate/flip about center. **Commit:** `feat(composite-ui): WaferFace renders a sliced-board wafer`.

### Task 8: `PartsBag`
Panel cards: source board name, construction, **cut control** (axis X/Y toggle + strip width + count steppers), wafer chips (greyed when placed — needs placed-key set from the board), **click card → onEditPanel(boardId)**, **+ Add panel** (design new / pick existing; disable boards whose construction ≠ composite, with reason). Props: `{ composite, boards, woods, placedKeys:Set<string>, onChange, onAddInline, onPickBoard, onEditPanel }`. **Commit:** `feat(composite-ui): parts bag with per-panel slice axis + grey-out`.

### Task 9: `AssemblyDesk`
Rows (top→bottom), **active row** highlighted; **tap chip → addWaferToRow(active)**; **tap placed wafer → cycleTransform**; **drag** to reorder (reuse pointer/slop pattern) within/across rows; **✕** remove; **⋮⋮** grip → moveRow; **+ Add row above/below**; **light both-axis trim markings** computed from `croppedLayout` (overlay the trimLeft/Right/Top/Bottom rects faintly on each wafer). Responsive; `usePinchPan` for zoom. Props: `{ composite, boards, woods, activeRowId, onSelectRow, onChange }`. **Commit:** `feat(composite-ui): row-based desk with tap-fill, reorder, live trim markings`.

### Task 10: `FinalPreview` + `CompositeSummary`
`FinalPreview({composite,boards,woods})`: render `croppedLayout` as the cut-down board — rows butted (no gaps), each wafer drawn at its kept rect, centered, **fully responsive** (fit container via `fitPxPerMm` + `useElementSize`), with a **pop-out** (reuse the board designer's popout pattern / a simple modal). `CompositeSummary`: finished size (`assembledSize`), material (`materialBySpecies` finished / `stockBySpecies` incl. waste), `compositeCutPlan`. **Commit:** `feat(composite-ui): cropped responsive final preview + material/cut-plan summary`.

### Task 11: `CompositeScreen` + App wiring
Rewrite `CompositeScreen` to compose PartsBag | AssemblyDesk | (FinalPreview + Summary), holding `activeRowId` + add/edit/pick handlers; compute `placedKeys`. Update `App.makeComposite`/`createComposite` to the new shape (`construction` from the source board, one empty middle row, panel `cut{axis:'x',…}`). Delete `PanelRail.tsx`/`AssemblyCanvas.tsx`. Add styles. **Full gate.** **Commit:** `feat(composite-ui): row-based composite screen + app wiring`.

### Task 12: Manual tablet pass
`pnpm dev`; verify: slice a board (X and Y), fill rows from the bag (chips grey out), build from middle, reorder rows (⋮⋮), tap rotate/flip, ✕ remove, **live trim on both axes**, cropped centered/responsive preview + pop-out, material finished/waste, no edge/end mixing, Preston's Button no overlap, reload migrates an old composite. Fix anything found; keep gate green.

---

## Self-Review

**Spec coverage:** panel=board sliced X/Y → T3; row model + ops → T2/T6; crop 4-sided (Y shortest/row, X narrowest, centered) → T4; placed-wafer material (finished vs trim+kerf) → T5; parts bag grey-out + edit + construction guard → T8; desk tap-fill/middle/reorder/rotate/flip/remove + both-axis trim → T9; cropped centered responsive preview + popout → T10; screen + wiring + migration → T2/T11; imperial whole/½″ → T1. Deferred (recursion, templates, build-sheet, touch-hardening) — no task, intentional.

**Placeholder scan:** domain Tasks 1–6 carry concrete tests/code; UI Tasks 7–11 give exact props + named reuse and are verified by build/lint + the T12 manual pass (repo convention). Y-axis wafer geometry is concretely specified in T3 (not deferred).

**Type consistency:** `CompositePanel.cut{axis,stripWidthMm,kerfMm,count}`, `PlacedWafer`, `CompositeRow`, `Piece{…,strips}`, `croppedLayout`/`RowLayout` names are used identically across tasks. Transform helpers + `pieceKey` retained; grid helpers/types removed in T2/T6 and referenced nowhere after.
