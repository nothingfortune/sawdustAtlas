# BOARD-023 Rip & Stock List — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface a bench-usable "Rip & stock list" — rough rip widths per strip group, per-species purchased board-feet, and explicit assumptions — in the board designer's printable region.

**Architecture:** A pure aggregator (`calculateStockRequirements`) bundles existing domain math (`calculateBuildDimensions`, `roughStripStockWidth`, `calculateWoodUsage`); a presentational card renders it. No new geometry.

**Tech Stack:** TypeScript domain module + React card, Vitest, Playwright. Spec: `docs/superpowers/specs/2026-06-28-board-023-rip-stock-list-design.md`.

## Global Constraints

- Millimeters at full precision in the domain; round only in the UI (`formatLength`/`formatNumber`).
- Strict TS: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` (omit `sliceThicknessMm` for edge-grain, don't set `undefined`).
- Card honors the imperial toggle (use the unit helpers, never hard-code mm).
- `src/domain/**` is under the coverage gate — keep it green.

---

### Task 1: Domain aggregator `calculateStockRequirements`

**Files:**
- Create: `src/domain/boardStock.ts`
- Test: `tests/boardStock.test.ts`

**Interfaces:**
- Consumes: `calculateBuildDimensions`/`roughStripStockWidth` from `./boardAllowances`, `calculateWoodUsage`/`EndGrainMetrics` from `./boardGeometry`, `resolveAllowances` from `./boardAllowances`.
- Produces: `calculateStockRequirements(project, woods, build, metrics) => StockRequirements` and the `RipGroup`/`SpeciesStock`/`StockAssumptions`/`StockRequirements` interfaces (shapes per the spec).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { calculateStockRequirements } from '../src/domain/boardStock'
import { calculateBuildDimensions } from '../src/domain/boardAllowances'
import { calculateEndGrainMetrics } from '../src/domain/boardGeometry'
import { DEFAULT_ALLOWANCES } from '../src/domain/boardAllowances'
import type { BoardProject, WoodSpecies } from '../src/types'

const woods: WoodSpecies[] = [
  { id: 'walnut', name: 'Walnut', color: '#5a3828', accent: '#87614a', pricePerBoardFoot: 12 },
  { id: 'maple', name: 'Maple', color: '#dbc59b', accent: '#f0dfb9', pricePerBoardFoot: 8 },
]
const base = (over: Partial<BoardProject> = {}): BoardProject => ({
  id: 'b', name: 'B', length: 450, thickness: 38, construction: 'edge', updatedAt: '',
  endGrain: { sourceLength: 900, stockThickness: 38, sliceThickness: 45, kerf: 3.2, trimAllowance: 20, rowFlips: [], rowRotations: [] },
  allowances: { ...DEFAULT_ALLOWANCES }, strips: [], ...over,
})
const reqOf = (project: BoardProject) => {
  const metrics = calculateEndGrainMetrics(project)
  return calculateStockRequirements(project, woods, calculateBuildDimensions(project, metrics), metrics)
}

describe('calculateStockRequirements', () => {
  it('groups identical edge-grain strips and adds the rip allowance to the rough width', () => {
    const project = base({ strips: [
      { id: '1', speciesId: 'walnut', width: 40, trailingAngle: 0 },
      { id: '2', speciesId: 'walnut', width: 40, trailingAngle: 0 },
      { id: '3', speciesId: 'maple', width: 60, trailingAngle: 0 },
    ] })
    const r = reqOf(project)
    const walnut = r.ripGroups.find(g => g.speciesId === 'walnut' && g.finishedWidthMm === 40)!
    expect(walnut.count).toBe(2)
    expect(walnut.roughRipWidthMm).toBeGreaterThan(40) // finished + rip/width-trim allowance
    expect(r.ripGroups.some(g => g.speciesId === 'maple' && g.finishedWidthMm === 60)).toBe(true)
  })

  it('end-grain angled strips need a wider rough rip than the same edge-grain strip', () => {
    const strip = { id: '1', speciesId: 'walnut', width: 40, trailingAngle: 30 }
    const edge = reqOf(base({ construction: 'edge', strips: [strip] })).ripGroups[0]!
    const end = reqOf(base({ construction: 'end', strips: [strip] })).ripGroups[0]!
    expect(end.roughRipWidthMm).toBeGreaterThan(edge.roughRipWidthMm)
  })

  it('reports per-species purchased board-feet that sum to the total', () => {
    const project = base({ strips: [
      { id: '1', speciesId: 'walnut', width: 40, trailingAngle: 0 },
      { id: '2', speciesId: 'maple', width: 40, trailingAngle: 0 },
    ] })
    const r = reqOf(project)
    expect(r.species.length).toBe(2)
    const sum = r.species.reduce((t, s) => t + s.purchasedBoardFeet, 0)
    expect(r.totalPurchasedBoardFeet).toBeCloseTo(sum, 6)
    expect(r.species.every(s => s.purchasedBoardFeet >= s.finishedBoardFeet)).toBe(true)
  })

  it('includes kerf + slice thickness in assumptions only for end-grain', () => {
    const strips = [{ id: '1', speciesId: 'walnut', width: 40, trailingAngle: 0 }]
    expect(reqOf(base({ construction: 'end', strips })).assumptions.sliceThicknessMm).toBeGreaterThan(0)
    expect(reqOf(base({ construction: 'edge', strips })).assumptions).not.toHaveProperty('sliceThicknessMm')
  })

  it('degrades an unknown wood id to the id and a neutral color instead of throwing', () => {
    const r = reqOf(base({ strips: [{ id: '1', speciesId: 'ghost', width: 40, trailingAngle: 0 }] }))
    const group = r.ripGroups.find(g => g.speciesId === 'ghost')!
    expect(group.speciesName).toBe('ghost')
    expect(typeof group.color).toBe('string')
  })
})
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `npx vitest run tests/boardStock.test.ts`
Expected: FAIL — "Cannot find module '../src/domain/boardStock'".

- [ ] **Step 3: Implement `src/domain/boardStock.ts`**

```ts
import type { BoardProject, WoodSpecies } from '../types'
import type { BuildDimensions } from './boardAllowances'
import { resolveAllowances, roughStripStockWidth } from './boardAllowances'
import type { EndGrainMetrics } from './boardGeometry'
import { calculateWoodUsage } from './boardGeometry'

// BOARD-023: aggregate the existing build/usage math into one bench-usable reference —
// what to rip each strip to and how much stock to buy. No new geometry here.

export interface RipGroup {
  speciesId: string
  speciesName: string
  color: string
  finishedWidthMm: number
  trailingAngle: number
  roughRipWidthMm: number
  count: number
}

export interface SpeciesStock {
  speciesId: string
  name: string
  color: string
  purchasedBoardFeet: number
  finishedBoardFeet: number
  wasteBoardFeet: number
}

export interface StockAssumptions {
  construction: 'edge' | 'end'
  kerfMm: number
  ripAllowanceMm: number
  widthTrimMm: number
  lengthTrimMm: number
  surfacingMm: number
  sliceThicknessMm?: number
}

export interface StockRequirements {
  ripGroups: RipGroup[]
  species: SpeciesStock[]
  assumptions: StockAssumptions
  totalPurchasedBoardFeet: number
}

const NEUTRAL = '#8c6a48'

export function calculateStockRequirements(
  project: BoardProject,
  woods: readonly WoodSpecies[],
  build: BuildDimensions,
  metrics: EndGrainMetrics,
): StockRequirements {
  const woodById = new Map(woods.map(wood => [wood.id, wood]))
  const groups = new Map<string, RipGroup>()
  project.strips.forEach((strip, index) => {
    const wood = woodById.get(strip.speciesId)
    const roughRipWidthMm = roughStripStockWidth(project, build.stripRoughWidths[index] ?? strip.width, strip.trailingAngle)
    const key = `${strip.speciesId}|${strip.width}|${strip.trailingAngle}|${roughRipWidthMm}`
    const existing = groups.get(key)
    if (existing) { existing.count += 1; return }
    groups.set(key, {
      speciesId: strip.speciesId,
      speciesName: wood?.name ?? strip.speciesId,
      color: wood?.color ?? NEUTRAL,
      finishedWidthMm: strip.width,
      trailingAngle: strip.trailingAngle,
      roughRipWidthMm,
      count: 1,
    })
  })
  const ripGroups = [...groups.values()].sort((a, b) =>
    a.speciesName.localeCompare(b.speciesName) || a.finishedWidthMm - b.finishedWidthMm)

  const species: SpeciesStock[] = calculateWoodUsage(project, woods, metrics).map(usage => ({
    speciesId: usage.speciesId,
    name: usage.name,
    color: usage.color,
    purchasedBoardFeet: usage.requiredBoardFeet,
    finishedBoardFeet: usage.usedBoardFeet,
    wasteBoardFeet: usage.wasteBoardFeet,
  }))
  const totalPurchasedBoardFeet = species.reduce((t, s) => t + s.purchasedBoardFeet, 0)

  const allowance = resolveAllowances(project)
  const isEnd = project.construction === 'end'
  const assumptions: StockAssumptions = {
    construction: project.construction,
    kerfMm: isEnd ? Math.max(0, project.endGrain.kerf) : 0,
    ripAllowanceMm: Math.max(0, allowance.ripAllowance),
    widthTrimMm: Math.max(0, allowance.widthTrim),
    lengthTrimMm: Math.max(0, allowance.lengthTrim),
    surfacingMm: Math.max(0, allowance.jointing) + Math.max(0, allowance.planing) + Math.max(0, allowance.routerTable),
    ...(isEnd ? { sliceThicknessMm: Math.max(0, project.endGrain.sliceThickness) } : {}),
  }

  return { ripGroups, species, assumptions, totalPurchasedBoardFeet }
}
```

- [ ] **Step 4: Run the tests, confirm green**

Run: `npx vitest run tests/boardStock.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/boardStock.ts tests/boardStock.test.ts
git commit -m "feat(board-023): calculateStockRequirements aggregator"
```

---

### Task 2: "Rip & stock list" card in the board designer

**Files:**
- Modify: `src/components/BoardDesigner.tsx` (compute in the derived memo; render a `StockRequirementsCard` in `.board-canvas-area` after `CutPlanView`).
- Modify: `src/styles.css` (card styles, beside `.cut-plan`).

**Interfaces:**
- Consumes: `calculateStockRequirements` + its types from `../domain/boardStock`; `formatLength`/`formatNumber` + `useUnitSystem`; the already-derived `build`, `end` (metrics), `woods`.

- [ ] **Step 1: Compute it in the derived pipeline.** In `BoardDesigner`'s `derived` memo (where `build`, `woodUsage` are computed), add:
```ts
const stock = calculateStockRequirements(project, woods, build, end)
```
and include `stock` in the memo's returned object and the destructure (`const { ..., stock } = derived!`). Add the import:
```ts
import { calculateStockRequirements } from '../domain/boardStock'
```

- [ ] **Step 2: Render the card after the cut plan** (inside `.board-canvas-area`, after `<CutPlanView plan={cutPlan}/>`):
```tsx
<StockRequirementsCard stock={stock} />
```

- [ ] **Step 3: Add the `StockRequirementsCard` component** (near the other small components in `BoardDesigner.tsx`):
```tsx
function StockRequirementsCard({ stock }: { stock: StockRequirements }) {
  const { lengthUnit } = useUnitSystem()
  const a = stock.assumptions
  return <section className="stock-card">
    <h3>Rip &amp; stock list</h3>
    <div className="stock-rip">
      <span className="eyebrow">RIP EACH STRIP TO</span>
      {stock.ripGroups.map(g => <div key={`${g.speciesId}-${g.finishedWidthMm}-${g.trailingAngle}`} className="stock-rip-row">
        <i style={{ background: g.color }}/>
        <b>{formatLength(g.roughRipWidthMm, lengthUnit)}</b>
        <span>× {g.count} · {g.speciesName}{g.trailingAngle ? ` · ${g.trailingAngle}°` : ''} <small>(finished {formatLength(g.finishedWidthMm, lengthUnit)})</small></span>
      </div>)}
    </div>
    <div className="stock-buy">
      <span className="eyebrow">BUY (BOARD FEET)</span>
      {stock.species.map(s => <div key={s.speciesId} className="stock-buy-row">
        <i style={{ background: s.color }}/><span>{s.name}</span><b>{formatNumber(s.purchasedBoardFeet)} bf</b>
        <small>{formatNumber(s.finishedBoardFeet)} used · {formatNumber(s.wasteBoardFeet)} waste</small>
      </div>)}
      <div className="stock-buy-total"><span>Total purchased</span><b>{formatNumber(stock.totalPurchasedBoardFeet)} bf</b></div>
    </div>
    <p className="stock-assumptions">Assumes rip allowance {formatLength(a.ripAllowanceMm, lengthUnit)} · width trim {formatLength(a.widthTrimMm, lengthUnit)} · length trim {formatLength(a.lengthTrimMm, lengthUnit)} · surfacing {formatLength(a.surfacingMm, lengthUnit)}{a.construction === 'end' ? ` · kerf ${formatLength(a.kerfMm, lengthUnit)} · slice ${formatLength(a.sliceThicknessMm ?? 0, lengthUnit)}` : ''}.</p>
  </section>
}
```
Add `StockRequirements` to the `boardStock` type import.

- [ ] **Step 4: Add CSS** in `src/styles.css` (near `.cut-plan`):
```css
.stock-card { border:1px solid var(--line); background:#fbfaf5; padding:16px; margin-top:18px; }
.stock-card h3 { margin:0 0 12px; }
.stock-card .eyebrow { display:block; margin-bottom:7px; }
.stock-rip-row, .stock-buy-row { display:flex; align-items:center; gap:9px; padding:5px 0; font-size:13px; }
.stock-rip-row i, .stock-buy-row i { width:13px; height:13px; border-radius:2px; flex:none; }
.stock-rip-row b, .stock-buy-row b { font-variant-numeric:tabular-nums; }
.stock-rip-row small, .stock-buy-row small { color:#8a8d85; }
.stock-buy { margin-top:14px; }
.stock-buy-row small { margin-left:auto; }
.stock-buy-total { display:flex; justify-content:space-between; border-top:1px solid var(--line); margin-top:6px; padding-top:8px; font-size:13px; }
.stock-assumptions { margin:14px 0 0; color:#7b827a; font-size:12px; line-height:1.5; }
```

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/BoardDesigner.tsx src/styles.css
git commit -m "feat(board-023): rip & stock list card in the board designer"
```

---

### Task 3: e2e — the card renders on the seed board

**Files:**
- Modify: `e2e/board.spec.ts`

- [ ] **Step 1: Add the test** (inside the existing `cutting board designer` describe):
```ts
test('shows a rip & stock list with rip widths and per-species board feet', async ({ page }) => {
  const card = page.locator('.stock-card')
  await expect(card).toBeVisible()
  await expect(card).toContainText(/Rip & stock list/i)
  await expect(card.locator('.stock-rip-row').first()).toBeVisible()
  await expect(card).toContainText(/bf/)
})
```

- [ ] **Step 2: Run e2e + full suite**

Run: `pnpm exec playwright test e2e/board.spec.ts` then `pnpm test && pnpm exec playwright test`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/board.spec.ts
git commit -m "test(board-023): e2e for the rip & stock list card"
```

---

## Self-Review

- **Spec coverage:** aggregator → Task 1; printable card honoring units → Task 2; render e2e → Task 3. Assumptions, rip grouping, per-species buy, end-vs-edge all covered by Task 1 tests.
- **Placeholders:** none — full code in each step.
- **Type consistency:** `calculateStockRequirements(project, woods, build, metrics)` and `StockRequirements`/`RipGroup`/`SpeciesStock`/`StockAssumptions` are used identically across tasks; `sliceThicknessMm` is conditionally spread (exactOptional-safe) and read with `?? 0` in the card.
