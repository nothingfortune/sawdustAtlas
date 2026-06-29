# BOARD-025 Bench Setup Card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A concise, glanceable "Bench setup" card (rip fence widths, saw angles, crosscut stop + counts, key allowances) high in the board build region, reusing the existing 023/024 calculators.

**Architecture:** Pure `summarizeBenchSetup` delegates to `calculateStockRequirements` + `calculateAngleSetup` and reads crosscut counts from metrics; a presentational card renders it above the detailed cards.

**Tech Stack:** TypeScript domain + React, Vitest, Playwright. Spec: `docs/superpowers/specs/2026-06-28-board-025-bench-setup-design.md`.

## Global Constraints

- No new geometry — delegate to existing calculators (single source of truth).
- mm/degrees at full precision in the domain; round only in the UI; honor the unit toggle.
- `src/domain/**` under the coverage gate.

---

### Task 1: Domain `summarizeBenchSetup`

**Files:**
- Create: `src/domain/boardBench.ts`, `tests/boardBench.test.ts`

**Interfaces:**
- Consumes: `calculateStockRequirements`/`RipGroup`/`StockAssumptions` from `./boardStock`, `calculateAngleSetup` from `./boardAngle`, `EndGrainMetrics` from `./boardGeometry`, `BuildDimensions` from `./boardAllowances`.
- Produces: `summarizeBenchSetup(project, woods, build, metrics) => BenchSetup` and `BenchSetup`/`BenchAngle`/`BenchCrosscut`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { summarizeBenchSetup } from '../src/domain/boardBench'
import { DEFAULT_ALLOWANCES, calculateBuildDimensions } from '../src/domain/boardAllowances'
import { calculateEndGrainMetrics } from '../src/domain/boardGeometry'
import { calculateStockRequirements } from '../src/domain/boardStock'
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
const benchOf = (project: BoardProject) => {
  const metrics = calculateEndGrainMetrics(project)
  return summarizeBenchSetup(project, woods, calculateBuildDimensions(project, metrics), metrics)
}

describe('summarizeBenchSetup', () => {
  it('end-grain angled board: rip groups, distinct saw angles, and a crosscut summary', () => {
    const project = base({ construction: 'end', strips: [
      { id: '1', speciesId: 'walnut', width: 40, trailingAngle: 30 },
      { id: '2', speciesId: 'maple', width: 40, trailingAngle: 30 },
      { id: '3', speciesId: 'walnut', width: 40, trailingAngle: -30 },
    ] })
    const metrics = calculateEndGrainMetrics(project)
    const bench = benchOf(project)
    expect(bench.ripGroups.length).toBeGreaterThan(0)
    expect(bench.angles.map(a => a.sawAngleDeg)).toContain(30)
    const plus30 = bench.angles.find(a => a.trailingAngleDeg === 30)!
    expect(plus30.count).toBe(2)
    expect(bench.crosscut).toEqual({ stopBlockMm: 45, slices: metrics.sliceCount, passes: metrics.crosscutCount })
  })

  it('edge-grain board: no crosscut, no angles, but rip groups present', () => {
    const bench = benchOf(base({ construction: 'edge', strips: [
      { id: '1', speciesId: 'walnut', width: 40, trailingAngle: 0 },
      { id: '2', speciesId: 'maple', width: 50, trailingAngle: 0 },
    ] }))
    expect(bench.crosscut).toBeNull()
    expect(bench.angles).toEqual([])
    expect(bench.ripGroups.length).toBeGreaterThan(0)
  })

  it('delegates rip groups and assumptions to calculateStockRequirements (no duplication)', () => {
    const project = base({ construction: 'end', strips: [{ id: '1', speciesId: 'walnut', width: 40, trailingAngle: 0 }] })
    const metrics = calculateEndGrainMetrics(project)
    const stock = calculateStockRequirements(project, woods, calculateBuildDimensions(project, metrics), metrics)
    const bench = summarizeBenchSetup(project, woods, calculateBuildDimensions(project, metrics), metrics)
    expect(bench.ripGroups).toEqual(stock.ripGroups)
    expect(bench.assumptions).toEqual(stock.assumptions)
  })
})
```

- [ ] **Step 2: Run, confirm fail**

Run: `npx vitest run tests/boardBench.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/domain/boardBench.ts`**

```ts
import type { BoardProject, WoodSpecies } from '../types'
import type { BuildDimensions } from './boardAllowances'
import type { EndGrainMetrics } from './boardGeometry'
import { calculateStockRequirements } from './boardStock'
import type { RipGroup, StockAssumptions } from './boardStock'
import { calculateAngleSetup } from './boardAngle'

// BOARD-025: the glanceable bench reference — what you set at the saw. Delegates to the
// 023/024 calculators (single source of truth) and adds the crosscut summary from metrics.

export interface BenchAngle { trailingAngleDeg: number; sawAngleDeg: number; count: number }
export interface BenchCrosscut { stopBlockMm: number; slices: number; passes: number }

export interface BenchSetup {
  ripGroups: RipGroup[]
  angles: BenchAngle[]
  crosscut: BenchCrosscut | null
  assumptions: StockAssumptions
}

export function summarizeBenchSetup(
  project: BoardProject,
  woods: readonly WoodSpecies[],
  build: BuildDimensions,
  metrics: EndGrainMetrics,
): BenchSetup {
  const stock = calculateStockRequirements(project, woods, build, metrics)
  const isEnd = project.construction === 'end'

  const byAngle = new Map<number, number>()
  if (isEnd) {
    for (const strip of project.strips) {
      const angle = Math.round(strip.trailingAngle * 100) / 100
      if (Math.abs(angle) <= 0.001) continue
      byAngle.set(angle, (byAngle.get(angle) ?? 0) + 1)
    }
  }
  const angles: BenchAngle[] = [...byAngle.entries()]
    .map(([trailingAngleDeg, count]) => ({
      trailingAngleDeg,
      sawAngleDeg: calculateAngleSetup({ trailingAngleDeg, stockThicknessMm: project.endGrain.stockThickness, stripLengthMm: project.endGrain.sourceLength }).sawAngleDeg,
      count,
    }))
    .sort((a, b) => a.trailingAngleDeg - b.trailingAngleDeg)

  const crosscut: BenchCrosscut | null = isEnd
    ? { stopBlockMm: Math.max(0, project.endGrain.sliceThickness), slices: metrics.sliceCount, passes: metrics.crosscutCount }
    : null

  return { ripGroups: stock.ripGroups, angles, crosscut, assumptions: stock.assumptions }
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `npx vitest run tests/boardBench.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/boardBench.ts tests/boardBench.test.ts
git commit -m "feat(board-025): summarizeBenchSetup aggregator"
```

---

### Task 2: "Bench setup" card high in the board designer

**Files:**
- Modify: `src/components/BoardDesigner.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `summarizeBenchSetup`/`BenchSetup` from `../domain/boardBench`; `formatLength`/`formatNumber` + `useUnitSystem`; the live `build`, `end` (metrics).

- [ ] **Step 1: Import** in `BoardDesigner.tsx`:
```ts
import { summarizeBenchSetup } from '../domain/boardBench'
import type { BenchSetup } from '../domain/boardBench'
```

- [ ] **Step 2: Compute in the derived memo.** After `const stock = calculateStockRequirements(...)`, add:
```ts
const bench = summarizeBenchSetup(project, woods, build, end)
```
Add `bench` to the memo's returned object and the destructure (`const { ..., bench } = derived!`).

- [ ] **Step 3: Render high in the region.** Insert immediately after the `<div className="board-stats">…</div>` block (and before `<PriceBreakdownCard .../>`):
```tsx
<BenchSetupCard bench={bench}/>
```

- [ ] **Step 4: Add the component** (near `StockRequirementsCard`):
```tsx
function BenchSetupCard({ bench }: { bench: BenchSetup }) {
  const { lengthUnit } = useUnitSystem()
  const a = bench.assumptions
  return <section className="bench-card">
    <h3>Bench setup</h3>
    <div className="bench-grid">
      <div className="bench-block">
        <span className="eyebrow">RIP FENCE</span>
        {bench.ripGroups.map(group => <div key={`${group.speciesId}-${group.finishedWidthMm}-${group.trailingAngle}-${group.roughRipWidthMm}`} className="bench-line">
          <b>{formatLength(group.roughRipWidthMm, lengthUnit)}</b><small>×{group.count} {group.speciesName}</small>
        </div>)}
      </div>
      {bench.angles.length > 0 && <div className="bench-block">
        <span className="eyebrow">SAW ANGLE</span>
        {bench.angles.map(angle => <div key={angle.trailingAngleDeg} className="bench-line">
          <b>{formatNumber(angle.sawAngleDeg)}°</b><small>×{angle.count}</small>
        </div>)}
      </div>}
      {bench.crosscut && <div className="bench-block">
        <span className="eyebrow">CROSSCUT</span>
        <div className="bench-line"><b>{formatLength(bench.crosscut.stopBlockMm, lengthUnit)}</b><small>stop block</small></div>
        <div className="bench-line"><b>{bench.crosscut.slices}</b><small>slices · {bench.crosscut.passes} passes</small></div>
      </div>}
    </div>
    <p className="bench-assumptions">Allowances: rip {formatLength(a.ripAllowanceMm, lengthUnit)} · width trim {formatLength(a.widthTrimMm, lengthUnit)} · length trim {formatLength(a.lengthTrimMm, lengthUnit)}{a.construction === 'end' ? ` · kerf ${formatLength(a.kerfMm, lengthUnit)}` : ''}.</p>
  </section>
}
```
Import `BenchSetup` type (Step 1).

- [ ] **Step 5: Add CSS** in `src/styles.css` (beside `.stock-card`):
```css
.bench-card { max-width:820px; margin:24px auto; background:#f3efe6; border:1px solid #c4c0b4; border-left:4px solid var(--orange); padding:18px 20px; }
.bench-card h3 { margin:0 0 14px; font-size:18px; }
.bench-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:20px; }
.bench-block .eyebrow { display:block; margin-bottom:9px; }
.bench-line { display:flex; align-items:baseline; gap:8px; padding:4px 0; }
.bench-line b { font-size:18px; font-variant-numeric:tabular-nums; }
.bench-line small { color:#7d827b; font-size:12px; }
.bench-assumptions { margin:16px 0 0; color:#7b827a; font-size:12px; line-height:1.5; }
```

- [ ] **Step 6: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/BoardDesigner.tsx src/styles.css
git commit -m "feat(board-025): bench setup card high in the board designer"
```

---

### Task 3: e2e — bench card shows the saw numbers

**Files:**
- Modify: `e2e/board.spec.ts`

- [ ] **Step 1: Add a test in the existing `cutting board designer` describe** (seed board, end grain → has rip fence + crosscut):
```ts
test('shows a bench setup card with rip fence and crosscut numbers', async ({ page }) => {
  const card = page.locator('.bench-card')
  await expect(card).toBeVisible()
  await expect(card).toContainText('Bench setup')
  await expect(card).toContainText(/RIP FENCE/i)
  await expect(card).toContainText(/CROSSCUT/i)
})
```

- [ ] **Step 2: Add a saw-angle assertion to the seeded angled board test** (in the `angle & setup card` describe, after the existing `.angle-card` checks):
```ts
    await expect(page.locator('.bench-card')).toContainText(/SAW ANGLE/i)
    await expect(page.locator('.bench-card')).toContainText('30°')
```

- [ ] **Step 3: Run e2e + full suite**

Run: `pnpm exec playwright test e2e/board.spec.ts` then `pnpm test && pnpm exec playwright test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add e2e/board.spec.ts
git commit -m "test(board-025): e2e for the bench setup card"
```

---

## Self-Review

- **Spec coverage:** aggregator delegating to 023/024 + crosscut → Task 1; concise card high in the region → Task 2; e2e for rip/crosscut/angle → Task 3.
- **Placeholders:** none.
- **Type consistency:** `summarizeBenchSetup(project, woods, build, metrics)` and `BenchSetup`/`BenchAngle`/`BenchCrosscut` identical across tasks; `ripGroups`/`assumptions` reuse `boardStock` types.
