# BOARD-024 Angle & Setup Calculator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the shop-setup numbers an end-grain trailing angle implies — saw angle, effective rip-width gain, face offset, and wedge waste — reusing board-generation's exact `tan` math.

**Architecture:** Pure converter `calculateAngleSetup` (+ `angleForOffset` inverse) in the domain; a read-only "Angle & setup" card in the board designer shown only for end-grain boards with angled strips.

**Tech Stack:** TypeScript domain + React card, Vitest, Playwright. Spec: `docs/superpowers/specs/2026-06-28-board-024-angle-setup-design.md`.

## Global Constraints

- Millimeters/degrees at full precision in the domain; round only in the UI.
- Reuse `clampAngle` (±89°) and `toBoardFeet` from `./units` so assumptions never drift.
- `src/domain/**` under the coverage gate.
- Card honors the imperial toggle; never hard-code mm.

---

### Task 1: Domain `calculateAngleSetup` + `angleForOffset`

**Files:**
- Create: `src/domain/boardAngle.ts`, `tests/boardAngle.test.ts`

**Interfaces:**
- Consumes: `clampAngle`, `toBoardFeet` from `./units`.
- Produces: `calculateAngleSetup(input) => AngleSetup`, `angleForOffset(offsetMm, stockThicknessMm) => number`, and the `AngleSetup` interface (per spec).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { calculateAngleSetup, angleForOffset } from '../src/domain/boardAngle'

const setup = (trailingAngleDeg: number, stockThicknessMm = 38, stripLengthMm = 900) =>
  calculateAngleSetup({ trailingAngleDeg, stockThicknessMm, stripLengthMm })

describe('calculateAngleSetup', () => {
  it('offset follows thickness * tan(angle)', () => {
    const r = setup(30, 38)
    expect(r.angleOffsetMm).toBeCloseTo(38 * Math.tan(30 * Math.PI / 180), 4) // ~21.94
    expect(r.effectiveWidthGainMm).toBeCloseTo(r.angleOffsetMm, 6)
    expect(r.sawAngleDeg).toBe(30)
  })

  it('a square strip has zero everything', () => {
    const r = setup(0)
    expect(r.angleOffsetMm).toBe(0)
    expect(r.effectiveWidthGainMm).toBe(0)
    expect(r.wedgeCrossSectionMm2).toBe(0)
    expect(r.wedgeBoardFeet).toBe(0)
  })

  it('a negative angle keeps a signed offset but positive width gain and saw angle', () => {
    const r = setup(-30, 38)
    expect(r.angleOffsetMm).toBeLessThan(0)
    expect(r.effectiveWidthGainMm).toBeGreaterThan(0)
    expect(r.sawAngleDeg).toBe(30)
  })

  it('wedge = half the offset times thickness, scaling with strip length', () => {
    const r = setup(30, 38, 900)
    expect(r.wedgeCrossSectionMm2).toBeCloseTo(0.5 * Math.abs(r.angleOffsetMm) * 38, 4)
    const longer = setup(30, 38, 1800)
    expect(longer.wedgeBoardFeet).toBeCloseTo(r.wedgeBoardFeet * 2, 6)
  })

  it('clamps beyond +/-89 degrees', () => {
    expect(setup(200).sawAngleDeg).toBeLessThanOrEqual(89)
  })

  it('angleForOffset inverts calculateAngleSetup', () => {
    const r = setup(22, 40)
    expect(angleForOffset(r.angleOffsetMm, 40)).toBeCloseTo(22, 4)
    expect(angleForOffset(10, 0)).toBe(0) // guard divide-by-zero
  })
})
```

- [ ] **Step 2: Run, confirm fail**

Run: `npx vitest run tests/boardAngle.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/domain/boardAngle.ts`**

```ts
import { clampAngle, toBoardFeet } from './units'

// BOARD-024: shop-setup numbers implied by an end-grain trailing angle, using the same
// thickness * tan(angle) relation as board generation (boardGeometry rightWidth/faceShift,
// boardAllowances angle shift, the side-trim wedge).

export interface AngleSetup {
  trailingAngleDeg: number
  sawAngleDeg: number
  angleOffsetMm: number
  effectiveWidthGainMm: number
  wedgeCrossSectionMm2: number
  wedgeBoardFeet: number
}

const radians = (deg: number) => deg * Math.PI / 180

export function calculateAngleSetup(input: { trailingAngleDeg: number, stockThicknessMm: number, stripLengthMm: number }): AngleSetup {
  const angle = clampAngle(input.trailingAngleDeg)
  const thickness = Math.max(0, input.stockThicknessMm)
  const length = Math.max(0, input.stripLengthMm)
  const angleOffsetMm = thickness * Math.tan(radians(angle))
  const effectiveWidthGainMm = Math.abs(angleOffsetMm)
  const wedgeCrossSectionMm2 = 0.5 * effectiveWidthGainMm * thickness
  return {
    trailingAngleDeg: angle,
    sawAngleDeg: Math.abs(angle),
    angleOffsetMm,
    effectiveWidthGainMm,
    wedgeCrossSectionMm2,
    wedgeBoardFeet: toBoardFeet(wedgeCrossSectionMm2 * length),
  }
}

export function angleForOffset(offsetMm: number, stockThicknessMm: number): number {
  if (!(stockThicknessMm > 0)) return 0
  return clampAngle(Math.atan(offsetMm / stockThicknessMm) * 180 / Math.PI)
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `npx vitest run tests/boardAngle.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/boardAngle.ts tests/boardAngle.test.ts
git commit -m "feat(board-024): calculateAngleSetup + angleForOffset"
```

---

### Task 2: "Angle & setup" card in the board designer

**Files:**
- Modify: `src/components/BoardDesigner.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `calculateAngleSetup`/`AngleSetup` from `../domain/boardAngle`; `formatLength`/`formatNumber` + `useUnitSystem`; the live `project`.

- [ ] **Step 1: Import** in `BoardDesigner.tsx`:
```ts
import { calculateAngleSetup } from '../domain/boardAngle'
import type { AngleSetup } from '../domain/boardAngle'
```

- [ ] **Step 2: Build the per-angle rows in the derived memo.** Inside the `derived` useMemo (after `stock`), add:
```ts
const angleRows = project.construction === 'end'
  ? [...new Map(project.strips
      .filter(strip => Math.abs(strip.trailingAngle) > 0.001)
      .map(strip => [Math.round(strip.trailingAngle * 100) / 100, strip] as const)).entries()]
      .map(([angle, strip]) => ({
        angle,
        count: project.strips.filter(s => Math.round(s.trailingAngle * 100) / 100 === angle).length,
        setup: calculateAngleSetup({ trailingAngleDeg: strip.trailingAngle, stockThicknessMm: project.endGrain.stockThickness, stripLengthMm: project.endGrain.sourceLength }),
      }))
      .sort((a, b) => a.angle - b.angle)
  : []
```
Include `angleRows` in the memo's return object and destructure: `const { ..., angleRows } = derived!`.

- [ ] **Step 3: Render the card** after `<StockRequirementsCard stock={stock}/>`:
```tsx
{angleRows.length > 0 && <AngleSetupCard rows={angleRows} thicknessMm={project.endGrain.stockThickness} lengthMm={project.endGrain.sourceLength}/>}
```

- [ ] **Step 4: Add the component** (near `StockRequirementsCard`):
```tsx
function AngleSetupCard({ rows, thicknessMm, lengthMm }: { rows: { angle: number, count: number, setup: AngleSetup }[], thicknessMm: number, lengthMm: number }) {
  const { lengthUnit } = useUnitSystem()
  return <section className="stock-card angle-card">
    <h3>Angle &amp; setup</h3>
    <div className="angle-rows">
      <div className="angle-head"><span>Saw angle</span><span>+ Width</span><span>Offset</span><span>Wedge waste</span></div>
      {rows.map(row => <div key={row.angle} className="angle-row">
        <b>{formatNumber(row.setup.sawAngleDeg)}°</b>
        <span>{formatLength(row.setup.effectiveWidthGainMm, lengthUnit)}</span>
        <span>{formatLength(Math.abs(row.setup.angleOffsetMm), lengthUnit)}</span>
        <span>{formatNumber(row.setup.wedgeBoardFeet)} bf <small>×{row.count}</small></span>
      </div>)}
    </div>
    <p className="stock-assumptions">Across {formatLength(thicknessMm, lengthUnit)} stock over {formatLength(lengthMm, lengthUnit)} length. Offset = thickness × tan(angle); wedge is the triangular trim per strip.</p>
  </section>
}
```

- [ ] **Step 5: Add CSS** in `src/styles.css` (beside `.stock-card`):
```css
.angle-rows { display:grid; gap:2px; }
.angle-head, .angle-row { display:grid; grid-template-columns:1fr 1fr 1fr 1.3fr; gap:8px; align-items:center; font-size:13px; padding:6px 0; }
.angle-head { color:#737970; font:12px 'DM Mono'; text-transform:uppercase; border-bottom:1px solid var(--line); }
.angle-row { border-bottom:1px solid #ece9e0; }
.angle-row b { font-variant-numeric:tabular-nums; }
.angle-row small { color:#8a8d85; }
```

- [ ] **Step 6: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/BoardDesigner.tsx src/styles.css
git commit -m "feat(board-024): angle & setup card in the board designer"
```

---

### Task 3: e2e — card shows for an angled end-grain board, hidden otherwise

**Files:**
- Modify: `e2e/board.spec.ts`

- [ ] **Step 1: Add a negative assertion in the existing describe** (the seed board has no angles after switching to end grain), inside the `cutting board designer` describe:
```ts
test('no angle & setup card when no strip is angled', async ({ page }) => {
  await expect(page.locator('.angle-card')).toHaveCount(0)
})
```

- [ ] **Step 2: Add a positive test with a seeded angled board** (new describe at end of file):
```ts
test.describe('angle & setup card', () => {
  test('shows saw setup numbers for an angled end-grain board', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('sawdust-atlas:onboarded', '1')
      window.localStorage.setItem('sawdust-atlas:v1', JSON.stringify({
        schemaVersion: 2, shops: [],
        boards: [{ id: 'a', name: 'Chevron', construction: 'end', thickness: 38,
          strips: [{ id: '1', speciesId: 'walnut', width: 40, trailingAngle: 30 }, { id: '2', speciesId: 'maple', width: 40, trailingAngle: -30 }],
          endGrain: { sourceLength: 900, stockThickness: 38, sliceThickness: 45, kerf: 3.2, trimAllowance: 20, rowFlips: [], rowRotations: [] } }],
      }))
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Cutting boards' }).click()
    await page.getByRole('button', { name: /Chevron/ }).click()
    const card = page.locator('.angle-card')
    await expect(card).toBeVisible()
    await expect(card).toContainText('Angle & setup')
    await expect(card).toContainText('30°')
  })
})
```

- [ ] **Step 3: Run e2e + full suite**

Run: `pnpm exec playwright test e2e/board.spec.ts` then `pnpm test && pnpm exec playwright test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add e2e/board.spec.ts
git commit -m "test(board-024): e2e for the angle & setup card"
```

---

## Self-Review

- **Spec coverage:** converter + inverse → Task 1; conditional unit-aware card → Task 2; show/hide e2e → Task 3. tan relation, zero/negative angle, wedge, clamp, inverse all in Task 1.
- **Placeholders:** none.
- **Type consistency:** `calculateAngleSetup({ trailingAngleDeg, stockThicknessMm, stripLengthMm })` and `AngleSetup` fields are identical across tasks; `angleForOffset(offsetMm, stockThicknessMm)` matches its test.
