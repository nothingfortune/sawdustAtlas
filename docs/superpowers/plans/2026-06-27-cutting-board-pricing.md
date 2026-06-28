# Cutting Board Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sell-price estimate (material + markup + tier-based labor + consumables, raised to a per-construction minimum) to single cutting boards and composite assemblies.

**Architecture:** A new pure domain module (`src/domain/pricing.ts`) computes a `PriceBreakdown` from the *already-computed* material cost and rough board-feet. Pricing knobs live in one global `AtlasData.pricing` block (mirroring `AtlasData.allowances`), edited in a new "Pricing" settings screen and read at compute time by `BoardDesigner` and `CompositeSummary`. No board stores pricing.

**Tech Stack:** React 19, TypeScript (strict), Vite, Vitest. Package manager: pnpm.

## Global Constraints

- **Money/percent/hours are NOT dimensions.** Never run pricing values through `NumberField`/`LengthInput` (they apply imperial inch conversion + 1/32" snapping). Use a plain numeric `<input type="number">`.
- **Domain stays pure and unrounded.** `src/domain/pricing.ts` does no rounding and imports no React/DOM. Round only at the display edge with `.toFixed(2)`.
- **Coverage gate** (CI `pnpm test:coverage`) includes `src/domain/**`, `src/storage.ts`, `src/data.ts` at lines 90 / functions 85 / branches 75 / statements 88. New domain/storage code must be exercised by tests.
- **Markup applies to material only.** Labor and consumables are added at cost.
- **TypeScript is strict** (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`). Use `import type` for type-only imports.
- **Commits:** conventional-commit style; no AI attribution or co-author footers; end every commit message body with a final line containing exactly `G`.
- Run all commands from the worktree root `.worktrees/feat-cutting-board-pricing`.

## Defaults (verbatim)

| Setting | Default |
|---------|---------|
| `materialMarkupPercent` | 30 |
| `laborRatePerHour` | 60 |
| `tierHours` | `{ simple: 0.75, standard: 1.5, complex: 3 }` |
| `consumablesBase` | 8 |
| `consumablesPerBoardFoot` | 3 |
| `floor` | `{ edge: 100, end: 200 }` |
| `COMPLEX_SLICE_THRESHOLD` | 10 |

---

### Task 1: Pricing settings type, defaults, and persistence

**Files:**
- Modify: `src/types.ts` (add `PricingSettings`; add `pricing` to `AtlasData`)
- Modify: `src/data.ts` (add `DEFAULT_PRICING`; set `starterData.pricing`)
- Modify: `src/storage.ts` (add `normalizePricing`; call it inside `normalizeData`)
- Test: `tests/storage.test.ts`

**Interfaces:**
- Consumes: nothing (foundation task).
- Produces:
  - `export interface PricingSettings { materialMarkupPercent: number; laborRatePerHour: number; tierHours: { simple: number; standard: number; complex: number }; consumablesBase: number; consumablesPerBoardFoot: number; floor: { edge: number; end: number } }`
  - `AtlasData.pricing: PricingSettings`
  - `export const DEFAULT_PRICING: PricingSettings` (in `src/data.ts`)
  - `export function normalizePricing(saved: unknown): PricingSettings` (in `src/storage.ts`)

- [ ] **Step 1: Add the type to `src/types.ts`**

Add after the `BuildAllowances` interface:

```ts
export interface PricingSettings {
  /** Markup added on top of material cost (which already includes waste). */
  materialMarkupPercent: number
  laborRatePerHour: number
  /** Estimated build hours per complexity tier; × laborRatePerHour = labor cost. */
  tierHours: { simple: number; standard: number; complex: number }
  /** Flat consumables fee (glue/finish/abrasives) regardless of size. */
  consumablesBase: number
  /** Additional consumables per rough board-foot. */
  consumablesPerBoardFoot: number
  /** Minimum sell price per construction, applied to the grand total. */
  floor: { edge: number; end: number }
}
```

Add `pricing` to `AtlasData` (place it next to `allowances`):

```ts
export interface AtlasData {
  schemaVersion: number
  shops: ShopProject[]
  boards: BoardProject[]
  woods: WoodSpecies[]
  /** Shop-wide milling allowances (machine setup) applied to every board. */
  allowances: BuildAllowances
  /** Shop-wide pricing knobs (markup, labor, consumables, floor). */
  pricing: PricingSettings
  composites: CompositeBoard[]
}
```

- [ ] **Step 2: Add defaults to `src/data.ts`**

`src/data.ts` already imports `DEFAULT_ALLOWANCES`. Add a pricing default and import the type. At the top, extend the type import:

```ts
import type { AtlasData, PricingSettings, WoodSpecies } from './types'
```

Add the constant (after the `defaultSpecies` block, before `starterData`):

```ts
export const DEFAULT_PRICING: PricingSettings = {
  materialMarkupPercent: 30,
  laborRatePerHour: 60,
  tierHours: { simple: 0.75, standard: 1.5, complex: 3 },
  consumablesBase: 8,
  consumablesPerBoardFoot: 3,
  floor: { edge: 100, end: 200 },
}
```

In the `starterData` object literal, add the field next to `allowances`:

```ts
  allowances: { ...DEFAULT_ALLOWANCES },
  pricing: { ...DEFAULT_PRICING },
```

- [ ] **Step 3: Write the failing tests in `tests/storage.test.ts`**

Add this `describe` block at the end of the file (the file already imports `normalizeData`; add `normalizePricing` to that import from `../src/storage`):

```ts
describe('pricing normalization', () => {
  it('fills the default pricing block when absent', () => {
    const normalized = normalizeData({ shops: [], boards: [] } as unknown as AtlasData)
    expect(normalized.pricing.materialMarkupPercent).toBe(30)
    expect(normalized.pricing.laborRatePerHour).toBe(60)
    expect(normalized.pricing.tierHours).toEqual({ simple: 0.75, standard: 1.5, complex: 3 })
    expect(normalized.pricing.consumablesBase).toBe(8)
    expect(normalized.pricing.consumablesPerBoardFoot).toBe(3)
    expect(normalized.pricing.floor).toEqual({ edge: 100, end: 200 })
  })

  it('merges saved pricing over defaults', () => {
    const result = normalizePricing({ materialMarkupPercent: 45, floor: { end: 250 } })
    expect(result.materialMarkupPercent).toBe(45)
    expect(result.floor.end).toBe(250)
    // unspecified values fall back to defaults
    expect(result.floor.edge).toBe(100)
    expect(result.laborRatePerHour).toBe(60)
  })

  it('coerces garbage values to non-negative defaults', () => {
    const result = normalizePricing({ laborRatePerHour: -10, consumablesBase: 'x', tierHours: null })
    expect(result.laborRatePerHour).toBe(60) // negative rejected → default
    expect(result.consumablesBase).toBe(8)   // non-number → default
    expect(result.tierHours).toEqual({ simple: 0.75, standard: 1.5, complex: 3 })
  })
})
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm test tests/storage.test.ts`
Expected: FAIL — `normalizePricing` is not exported (import is `undefined`), and `normalized.pricing` is `undefined`.

- [ ] **Step 5: Implement `normalizePricing` and wire it into `normalizeData`**

In `src/storage.ts`, add the import of the default (top of file, near the other domain imports):

```ts
import { DEFAULT_PRICING } from './data'
```

> Note: `src/data.ts` already imports from `./domain/boardAllowances`; importing `DEFAULT_PRICING` from `./data` into `storage.ts` is fine — `storage.ts` already imports `defaultSpecies, starterData` from `./data`.

Add the normalizer (near `normalizeAllowances`). It reuses the existing `isRecord` and `finiteNumber` helpers:

```ts
export function normalizePricing(saved: unknown): PricingSettings {
  const s = isRecord(saved) ? saved : {}
  const tiers = isRecord(s['tierHours']) ? s['tierHours'] : {}
  const floor = isRecord(s['floor']) ? s['floor'] : {}
  return {
    materialMarkupPercent: finiteNumber(s['materialMarkupPercent'], DEFAULT_PRICING.materialMarkupPercent),
    laborRatePerHour: finiteNumber(s['laborRatePerHour'], DEFAULT_PRICING.laborRatePerHour),
    tierHours: {
      simple: finiteNumber(tiers['simple'], DEFAULT_PRICING.tierHours.simple),
      standard: finiteNumber(tiers['standard'], DEFAULT_PRICING.tierHours.standard),
      complex: finiteNumber(tiers['complex'], DEFAULT_PRICING.tierHours.complex),
    },
    consumablesBase: finiteNumber(s['consumablesBase'], DEFAULT_PRICING.consumablesBase),
    consumablesPerBoardFoot: finiteNumber(s['consumablesPerBoardFoot'], DEFAULT_PRICING.consumablesPerBoardFoot),
    floor: {
      edge: finiteNumber(floor['edge'], DEFAULT_PRICING.floor.edge),
      end: finiteNumber(floor['end'], DEFAULT_PRICING.floor.end),
    },
  }
}
```

Add the `PricingSettings` type to the existing `import type { ... } from './types'` line in `storage.ts`.

In `normalizeData`, add `pricing` to the returned object (next to `allowances`):

```ts
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    allowances,
    pricing: normalizePricing(data.pricing),
    composites,
    // ...rest unchanged
```

> `normalizeData` takes `Partial<AtlasData>`; reading `data.pricing` (possibly undefined) and passing it to `normalizePricing` is correct.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test tests/storage.test.ts`
Expected: PASS (all three new tests green; existing storage tests still green).

- [ ] **Step 7: Type-check**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/data.ts src/storage.ts tests/storage.test.ts
git commit -m "feat(pricing): pricing settings type, defaults, and persistence

G"
```

---

### Task 2: Pricing domain module (classify + calculate)

**Files:**
- Modify: `src/types.ts` (add `ComplexityTier`, `PriceBreakdown`)
- Create: `src/domain/pricing.ts`
- Test: `tests/pricing.test.ts`

**Interfaces:**
- Consumes: `PricingSettings` (Task 1), `BoardProject`, `EndGrainSettings` (existing).
- Produces:
  - `export type ComplexityTier = 'simple' | 'standard' | 'complex'`
  - `export interface PriceBreakdown { tier: ComplexityTier; laborHours: number; materialCost: number; materialMarkup: number; labor: number; consumables: number; subtotal: number; floor: number; floorAdjustment: number; total: number }`
  - `export const COMPLEX_SLICE_THRESHOLD = 10`
  - `export function classifyBoard(project: BoardProject, sliceCount: number): ComplexityTier`
  - `export function classifyComposite(): ComplexityTier`
  - `export function calculatePrice(input: { materialCost: number; roughBoardFeet: number; construction: 'edge' | 'end'; tier: ComplexityTier; pricing: PricingSettings }): PriceBreakdown`

- [ ] **Step 1: Add the domain types to `src/types.ts`**

```ts
export type ComplexityTier = 'simple' | 'standard' | 'complex'

export interface PriceBreakdown {
  tier: ComplexityTier
  laborHours: number
  materialCost: number
  materialMarkup: number
  labor: number
  consumables: number
  subtotal: number
  floor: number
  /** max(0, floor − subtotal); > 0 only when the minimum is binding. */
  floorAdjustment: number
  total: number
}
```

- [ ] **Step 2: Write the failing tests in `tests/pricing.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { classifyBoard, classifyComposite, calculatePrice, COMPLEX_SLICE_THRESHOLD } from '../src/domain/pricing'
import type { BoardProject, BoardStrip, EndGrainSettings, PricingSettings } from '../src/types'

const pricing: PricingSettings = {
  materialMarkupPercent: 30,
  laborRatePerHour: 60,
  tierHours: { simple: 0.75, standard: 1.5, complex: 3 },
  consumablesBase: 8,
  consumablesPerBoardFoot: 3,
  floor: { edge: 100, end: 200 },
}

const endGrain = (over: Partial<EndGrainSettings> = {}): EndGrainSettings => ({
  sourceLength: 900, stockThickness: 38, sliceThickness: 45, kerf: 3.2, trimAllowance: 20,
  rowFlips: [], rowRotations: [], rowOffsets: [], rowOrder: [], ...over,
})

const board = (construction: 'edge' | 'end', strips: BoardStrip[], eg: Partial<EndGrainSettings> = {}): BoardProject => ({
  id: 'b', name: 'b', length: 450, thickness: 38, construction, strips,
  updatedAt: '2026-01-01T00:00:00.000Z',
  allowances: { jointing: 2, planing: 1, routerTable: 1, ripAllowance: 3, lengthTrim: 10, widthTrim: 6 },
  endGrain: endGrain(eg),
})

const strip = (trailingAngle = 0): BoardStrip => ({ id: 's', speciesId: 'walnut', width: 38, trailingAngle })

describe('classifyBoard', () => {
  it('edge grain with no bevels is simple', () => {
    expect(classifyBoard(board('edge', [strip(), strip()]), 0)).toBe('simple')
  })
  it('edge grain with a beveled strip is standard', () => {
    expect(classifyBoard(board('edge', [strip(0), strip(12)]), 0)).toBe('standard')
  })
  it('plain end grain is standard', () => {
    expect(classifyBoard(board('end', [strip(), strip()]), 4)).toBe('standard')
  })
  it('end grain with a beveled strip is complex', () => {
    expect(classifyBoard(board('end', [strip(0), strip(8)]), 4)).toBe('complex')
  })
  it('end grain with per-slice variation is complex', () => {
    expect(classifyBoard(board('end', [strip()], { rowRotations: [false, true] }), 4)).toBe('complex')
    expect(classifyBoard(board('end', [strip()], { rowFlips: [true] }), 4)).toBe('complex')
    expect(classifyBoard(board('end', [strip()], { rowOffsets: [0, 5] }), 4)).toBe('complex')
  })
  it('end grain at or over the slice threshold is complex', () => {
    expect(classifyBoard(board('end', [strip()]), COMPLEX_SLICE_THRESHOLD)).toBe('complex')
  })
})

describe('classifyComposite', () => {
  it('is always complex', () => {
    expect(classifyComposite()).toBe('complex')
  })
})

describe('calculatePrice', () => {
  it('computes markup, labor, consumables, and subtotal', () => {
    // material 31.25, 2.5 bf, standard tier, end grain
    const p = calculatePrice({ materialCost: 31.25, roughBoardFeet: 2.5, construction: 'end', tier: 'standard', pricing })
    expect(p.materialMarkup).toBeCloseTo(9.375, 6)   // 31.25 * 0.30
    expect(p.laborHours).toBe(1.5)
    expect(p.labor).toBeCloseTo(90, 6)               // 1.5 * 60
    expect(p.consumables).toBeCloseTo(15.5, 6)       // 8 + 3 * 2.5
    expect(p.subtotal).toBeCloseTo(146.125, 6)
  })
  it('raises small builds to the end-grain floor', () => {
    const p = calculatePrice({ materialCost: 31.25, roughBoardFeet: 2.5, construction: 'end', tier: 'standard', pricing })
    expect(p.floor).toBe(200)
    expect(p.floorAdjustment).toBeCloseTo(53.875, 6)
    expect(p.total).toBe(200)
  })
  it('does not raise builds already above the floor', () => {
    const p = calculatePrice({ materialCost: 400, roughBoardFeet: 8, construction: 'end', tier: 'complex', pricing })
    expect(p.floorAdjustment).toBe(0)
    expect(p.total).toBeCloseTo(p.subtotal, 6)
    expect(p.total).toBeGreaterThan(200)
  })
  it('uses the edge floor for edge-grain builds', () => {
    const p = calculatePrice({ materialCost: 5, roughBoardFeet: 1, construction: 'edge', tier: 'simple', pricing })
    expect(p.floor).toBe(100)
    expect(p.total).toBe(100)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test tests/pricing.test.ts`
Expected: FAIL — cannot resolve `../src/domain/pricing` (module not created yet).

- [ ] **Step 4: Implement `src/domain/pricing.ts`**

```ts
import type { BoardProject, ComplexityTier, PriceBreakdown, PricingSettings } from '../types'

// End-grain boards with this many slices or more are treated as Complex labor.
export const COMPLEX_SLICE_THRESHOLD = 10

// Derive a labor complexity tier from a single board's design. Edge grain is
// Simple unless any strip is beveled; end grain is Standard unless it has bevels,
// per-slice variation (rotation/flip/offset), or a high slice count.
export function classifyBoard(project: BoardProject, sliceCount: number): ComplexityTier {
  const hasBevel = project.strips.some(s => s.trailingAngle !== 0)
  if (project.construction === 'edge') return hasBevel ? 'standard' : 'simple'
  const eg = project.endGrain
  const sliceVariation =
    eg.rowRotations.some(Boolean) ||
    eg.rowFlips.some(Boolean) ||
    (eg.rowOffsets?.some(offset => offset !== 0) ?? false)
  if (hasBevel || sliceVariation || sliceCount >= COMPLEX_SLICE_THRESHOLD) return 'complex'
  return 'standard'
}

// Composites are multi-panel assemblies; always the Complex tier.
export function classifyComposite(): ComplexityTier {
  return 'complex'
}

// Pure price math. Markup applies to material only; labor and consumables are
// added at cost; the per-construction floor is applied last to the grand total.
export function calculatePrice(input: {
  materialCost: number
  roughBoardFeet: number
  construction: 'edge' | 'end'
  tier: ComplexityTier
  pricing: PricingSettings
}): PriceBreakdown {
  const { materialCost, roughBoardFeet, construction, tier, pricing } = input
  const materialMarkup = materialCost * (pricing.materialMarkupPercent / 100)
  const laborHours = pricing.tierHours[tier]
  const labor = laborHours * pricing.laborRatePerHour
  const consumables = pricing.consumablesBase + pricing.consumablesPerBoardFoot * roughBoardFeet
  const subtotal = materialCost + materialMarkup + labor + consumables
  const floor = construction === 'end' ? pricing.floor.end : pricing.floor.edge
  const floorAdjustment = Math.max(0, floor - subtotal)
  return {
    tier, laborHours, materialCost, materialMarkup, labor, consumables,
    subtotal, floor, floorAdjustment, total: subtotal + floorAdjustment,
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test tests/pricing.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 6: Verify the coverage gate**

Run: `pnpm test:coverage`
Expected: PASS — overall thresholds (lines 90 / functions 85 / branches 75 / statements 88) still met with `pricing.ts` included.

- [ ] **Step 7: Type-check and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/domain/pricing.ts tests/pricing.test.ts
git commit -m "feat(pricing): complexity classification and price breakdown math

G"
```

---

### Task 3: Pricing settings screen and app wiring

**Files:**
- Modify: `src/types.ts` (`View` += `'pricing'`)
- Create: `src/components/PricingSettings.tsx`
- Modify: `src/App.tsx` (import, `updatePricing`, nav button, breadcrumb label, view render)

**Interfaces:**
- Consumes: `PricingSettings` (Task 1), `AtlasData.pricing` (Task 1).
- Produces: `export function PricingSettings(props: { pricing: PricingSettings; onChange: (patch: Partial<PricingSettings>) => void })`; a reachable `'pricing'` view.

- [ ] **Step 1: Extend `View` in `src/types.ts`**

```ts
export type View = 'home' | 'shop' | 'boards' | 'woods' | 'allowances' | 'pricing'
```

- [ ] **Step 2: Create `src/components/PricingSettings.tsx`**

Uses a local plain numeric field (NOT `NumberField` — these are dollars/percent/hours, not lengths):

```tsx
import type { PricingSettings as PricingSettingsValue } from '../types'

interface Props {
  pricing: PricingSettingsValue
  onChange: (patch: Partial<PricingSettingsValue>) => void
}

// Plain non-negative number input. Deliberately not the length-aware NumberField:
// money/percent/hours must never be unit-converted or snapped to 1/32".
function PriceField({ label, value, step = 1, onChange }: { label: string; value: number; step?: number; onChange: (value: number) => void }) {
  return <label className="field">
    <span>{label}</span>
    <input type="number" min={0} step={step} value={value}
      onChange={event => onChange(Math.max(0, Number(event.target.value)))} />
  </label>
}

// Shop-wide pricing module. Markup, labor rate, per-tier hours, consumables, and
// per-construction minimums live once at the workspace level and apply to every
// board and composite at compute time.
export function PricingSettings({ pricing, onChange }: Props) {
  return <div className="page module-page">
    <div className="module-head">
      <span className="eyebrow">SHOP DEFAULTS · APPLIES TO EVERY BOARD</span>
      <h1>Pricing</h1>
      <p>Markup, labor, consumables, and the minimum price applied to every cutting board build.</p>
    </div>
    <div className="module-card">
      <div className="field-row">
        <PriceField label="Material markup (%)" value={pricing.materialMarkupPercent} step={1} onChange={value => onChange({ materialMarkupPercent: value })}/>
        <PriceField label="Labor rate ($/hr)" value={pricing.laborRatePerHour} step={1} onChange={value => onChange({ laborRatePerHour: value })}/>
      </div>
      <div className="field-row">
        <PriceField label="Simple labor (hr)" value={pricing.tierHours.simple} step={0.25} onChange={value => onChange({ tierHours: { ...pricing.tierHours, simple: value } })}/>
        <PriceField label="Standard labor (hr)" value={pricing.tierHours.standard} step={0.25} onChange={value => onChange({ tierHours: { ...pricing.tierHours, standard: value } })}/>
        <PriceField label="Complex labor (hr)" value={pricing.tierHours.complex} step={0.25} onChange={value => onChange({ tierHours: { ...pricing.tierHours, complex: value } })}/>
      </div>
      <div className="field-row">
        <PriceField label="Consumables base ($)" value={pricing.consumablesBase} step={0.5} onChange={value => onChange({ consumablesBase: value })}/>
        <PriceField label="Consumables ($/bf)" value={pricing.consumablesPerBoardFoot} step={0.5} onChange={value => onChange({ consumablesPerBoardFoot: value })}/>
      </div>
      <div className="field-row">
        <PriceField label="End-grain minimum ($)" value={pricing.floor.end} step={5} onChange={value => onChange({ floor: { ...pricing.floor, end: value } })}/>
        <PriceField label="Edge-grain minimum ($)" value={pricing.floor.edge} step={5} onChange={value => onChange({ floor: { ...pricing.floor, edge: value } })}/>
      </div>
    </div>
  </div>
}
```

- [ ] **Step 3: Wire into `src/App.tsx`**

(a) Add `DollarSign` to the lucide import (first import line) and import the screen + type:

```ts
import { Boxes, DollarSign, Grid2X2, Home, Import, Menu, PanelLeftClose, Redo2, Ruler, Save, TriangleAlert, Trees, Undo2, Upload, Wrench } from 'lucide-react'
```
```ts
import { PricingSettings } from './components/PricingSettings'
```

Add `PricingSettings` to the `import type { ... } from './types'` line (so the handler can type its patch):

```ts
import type { AtlasData, BoardProject, BuildAllowances, CompositeBoard, PricingSettings, ShopProject, View, WoodSpecies } from './types'
```

(b) Add the handler next to `updateAllowances`:

```ts
  // Pricing is shop-wide: update the single global block. Unlike allowances it is
  // read at compute time, so there is no write-through to individual boards.
  const updatePricing = (patch: Partial<PricingSettings>) => commitData(current => ({
    ...current,
    pricing: { ...current.pricing, ...patch },
  }))
```

(c) Add the nav button under LIBRARY, right after the "Milling allowances" `NavButton`:

```tsx
        <NavButton active={view === 'pricing'} icon={<DollarSign />} label="Pricing" open={sidebarOpen} onClick={() => setView('pricing')} />
```

(d) Extend the breadcrumb label ternary (in the `.breadcrumb` `<strong>`), inserting `pricing` before the final `'Cutting boards'`:

```tsx
{view === 'home' ? 'Home' : view === 'shop' ? 'Workshop layout' : view === 'woods' ? 'Wood library' : view === 'allowances' ? 'Milling allowances' : view === 'pricing' ? 'Pricing' : 'Cutting boards'}
```

(e) Add the view render, right after the `allowances` line:

```tsx
        {view === 'pricing' && <PricingSettings pricing={data.pricing} onChange={updatePricing} />}
```

- [ ] **Step 4: Type-check, lint, build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: no errors; build succeeds.

- [ ] **Step 5: Manual smoke check**

Run: `pnpm dev`, open the app, click **Pricing** in the sidebar. Confirm the screen renders with all fields, editing a value sticks, and switching away/back retains it. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/components/PricingSettings.tsx src/App.tsx
git commit -m "feat(pricing): pricing settings screen and global wiring

G"
```

---

### Task 4: Shared price-breakdown card + BoardDesigner integration

**Files:**
- Create: `src/components/board/PriceBreakdownCard.tsx`
- Modify: `src/styles.css` (append `.price-breakdown` block)
- Modify: `src/components/BoardDesigner.tsx` (Props += `pricing`; compute price in `derived`; Price stat; render card; print header; disclaimer)
- Modify: `src/App.tsx` (pass `pricing={data.pricing}` to `<BoardDesigner>`)

**Interfaces:**
- Consumes: `calculatePrice`, `classifyBoard`, `PriceBreakdown`, `PricingSettings` (Tasks 1–2).
- Produces: `export function PriceBreakdownCard(props: { price: PriceBreakdown; roughBoardFeet: number; construction: 'edge' | 'end' })`.

- [ ] **Step 1: Create `src/components/board/PriceBreakdownCard.tsx`**

```tsx
import type { PriceBreakdown } from '../../types'
import { formatNumber } from '../../domain/lengthUnits'

const TIER_LABEL: Record<PriceBreakdown['tier'], string> = { simple: 'Simple', standard: 'Standard', complex: 'Complex' }
const money = (value: number) => `$${value.toFixed(2)}`

// Shared, presentational price breakdown used by the single-board designer and the
// composite summary. The "Minimum" row appears only when the floor is binding.
export function PriceBreakdownCard({ price, roughBoardFeet, construction }: { price: PriceBreakdown; roughBoardFeet: number; construction: 'edge' | 'end' }) {
  return <section className="price-breakdown" aria-label="Price breakdown">
    <h4>Price breakdown</h4>
    <dl>
      <div><dt>Material ({formatNumber(roughBoardFeet)} bf)</dt><dd>{money(price.materialCost)}</dd></div>
      <div><dt>Markup</dt><dd>+ {money(price.materialMarkup)}</dd></div>
      <div><dt>Labor — {TIER_LABEL[price.tier]}, {formatNumber(price.laborHours)} hr</dt><dd>+ {money(price.labor)}</dd></div>
      <div><dt>Consumables</dt><dd>+ {money(price.consumables)}</dd></div>
      <div className="price-subtotal"><dt>Subtotal</dt><dd>{money(price.subtotal)}</dd></div>
      {price.floorAdjustment > 0 && (
        <div className="price-floor"><dt>Minimum ({construction === 'end' ? 'end grain' : 'edge grain'})</dt><dd>+ {money(price.floorAdjustment)}</dd></div>
      )}
      <div className="price-total"><dt>Price</dt><dd>{money(price.total)}</dd></div>
    </dl>
  </section>
}
```

- [ ] **Step 2: Append the card styles to `src/styles.css`**

```css
.price-breakdown { max-width:780px;margin:20px auto 0;border:1px solid #c4c4bd;background:#f3f1ea;padding:14px 16px; }
.price-breakdown h4 { margin:0 0 10px;font:8px 'DM Mono';text-transform:uppercase;letter-spacing:.08em;color:#737970; }
.price-breakdown dl { margin:0;display:flex;flex-direction:column; }
.price-breakdown dl > div { display:grid;grid-template-columns:1fr auto;gap:12px;padding:6px 0;border-bottom:1px solid #e4e2da; }
.price-breakdown dt { font-size:11px;color:#4f574f; }
.price-breakdown dd { margin:0;font:11px 'DM Mono';text-align:right; }
.price-breakdown .price-subtotal { border-top:1px solid #c4c4bd;border-bottom:0;margin-top:4px;padding-top:9px; }
.price-breakdown .price-subtotal dt,.price-breakdown .price-subtotal dd { font-weight:600; }
.price-breakdown .price-floor dd { color:#9a6242; }
.price-breakdown .price-total { border:0;background:#ece9e1;margin-top:4px;padding:9px 10px; }
.price-breakdown .price-total dt { font-weight:700; }
.price-breakdown .price-total dd { color:#9a6242;font-weight:700;font-size:13px; }
```

- [ ] **Step 3: Integrate into `src/components/BoardDesigner.tsx`**

(a) Add imports near the other domain imports:

```ts
import { calculatePrice, classifyBoard } from '../domain/pricing'
import { PriceBreakdownCard } from './board/PriceBreakdownCard'
```

Add `PricingSettings` and `PriceBreakdown` to the `import type { ... } from '../types'` line.

(b) Extend the `Props` interface and destructure — add `pricing: PricingSettings`:

```ts
interface Props { projects: BoardProject[]; project: BoardProject | undefined; woods: WoodSpecies[]; pricing: PricingSettings; onSelect: (id: string) => void; onCreate: () => void; onChange: (project: BoardProject) => void; onDelete: (id: string) => void; onMakeComposite: (board: BoardProject) => void; onBack: () => void }
```
```ts
export function BoardDesigner({ projects, project, woods, pricing, onSelect, onCreate, onChange, onDelete, onMakeComposite, onBack }: Props) {
```

(c) In the `derived` `useMemo`, after `estimatedCost` is computed, add the price and return it; add `pricing` to the dependency array:

```ts
    const tier = classifyBoard(project, end.sliceCount)
    const price = calculatePrice({ materialCost: estimatedCost, roughBoardFeet: build.roughBoardFeet, construction: project.construction, tier, pricing })
    return { end, sliceStates, build, template, cutPlan, woodUsage, width, boardFeet, finishedSize, estimatedCost, price }
  }, [lengthUnit, project, woods, pricing])
```

Add `price` to the destructure of `derived!`:

```ts
  const { end, sliceStates, build, template, cutPlan, woodUsage, width, boardFeet, finishedSize, estimatedCost, price } = derived!
```

(d) Replace the existing "Material estimate" `Stat` line in `.board-stats` so the row shows both material and price (keep 4 columns):

Find:
```tsx
          <Stat label="Material estimate" value={`$${estimatedCost.toFixed(2)}`}/>
```
Replace with:
```tsx
          <Stat label="Material" value={`$${estimatedCost.toFixed(2)}`}/>
          <Stat label="Price" value={`$${price.total.toFixed(2)}`}/>
```

Then remove the now-surplus "Rough stock" or "Glue joints"/"Total waste" stat to keep four columns. Specifically, drop the "Rough stock" `Stat` (the bf figure also appears in the cut plan and the print header):

Find and delete:
```tsx
          <Stat label="Rough stock" value={`${formatNumber(boardFeet)} bf`}/>
```

The four stats are now: Finished size · Material · Price · (Total waste / Glue joints).

(e) Render the breakdown card. Immediately after the closing `</div>` of `.board-stats`, before `<BuildSummary build={build}/>`, add:

```tsx
        <PriceBreakdownCard price={price} roughBoardFeet={boardFeet} construction={project.construction}/>
```

(f) Update the print header `BuildSheetHeader` to include the price. Change its signature and body:

```tsx
function BuildSheetHeader({ project, build, boardFeet, estimatedCost, price }: { project: BoardProject; build: BuildDimensions; boardFeet: number; estimatedCost: number; price: PriceBreakdown }) {
```
Add a Price fact after the Material estimate fact:
```tsx
      <div><dt>Material estimate</dt><dd>${estimatedCost.toFixed(2)}</dd></div>
      <div><dt>Price</dt><dd>${price.total.toFixed(2)}</dd></div>
```
And update the call site (in the canvas area):
```tsx
        <BuildSheetHeader project={project} build={build} boardFeet={boardFeet} estimatedCost={estimatedCost} price={price}/>
```

(g) Update the stale disclaimer in `BuildAssumptions`. Replace the `Cost basis` row:

Find:
```ts
  rows.push(['Cost basis', 'Estimated from rough purchased board-feet × price per board foot. Excludes glue, finish, and consumables.'])
```
Replace with:
```ts
  rows.push(['Pricing', 'Price = material (rough board-feet × price per board foot, including milling waste) + markup + labor by complexity tier + consumables, raised to the configured per-construction minimum. Estimates exclude defects, wood movement, and final surfacing.'])
```

- [ ] **Step 4: Pass the prop from `src/App.tsx`**

In the `<BoardDesigner ... />` render, add `pricing={data.pricing}`:

```tsx
          <BoardDesigner
            projects={data.boards}
            project={data.boards.find(p => p.id === activeBoard) ?? data.boards[0]}
            woods={data.woods}
            pricing={data.pricing}
            onSelect={setActiveBoard}
```

- [ ] **Step 5: Type-check, lint, build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: no errors; build succeeds.

- [ ] **Step 6: Manual smoke check**

Run: `pnpm dev`, open a cutting board design. Confirm the "Price" stat and the "Price breakdown" card show; create a small end-grain board and confirm the "Minimum (end grain)" row appears and Price reads `$200.00`. Use **Print build sheet** and confirm the Price appears in the print header. Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add src/components/board/PriceBreakdownCard.tsx src/styles.css src/components/BoardDesigner.tsx src/App.tsx
git commit -m "feat(pricing): price breakdown in the board designer

G"
```

---

### Task 5: Composite price breakdown

**Files:**
- Modify: `src/components/composite/CompositeSummary.tsx` (Props += `pricing`; compute price; Price stat; render card)
- Modify: `src/components/composite/CompositeScreen.tsx` (Props += `pricing`; pass to `CompositeSummary`)
- Modify: `src/App.tsx` (pass `pricing={data.pricing}` to `<CompositeScreen>`)

**Interfaces:**
- Consumes: `calculatePrice`, `classifyComposite`, `PriceBreakdownCard` (Tasks 2 & 4), `PricingSettings` (Task 1), existing `stockBySpecies`.
- Produces: composite build sheet showing the full price breakdown.

- [ ] **Step 1: Integrate into `src/components/composite/CompositeSummary.tsx`**

(a) Add imports:

```ts
import { calculatePrice, classifyComposite } from '../../domain/pricing'
import { PriceBreakdownCard } from '../board/PriceBreakdownCard'
import type { PricingSettings } from '../../types'
```

(b) Extend `CompositeSummaryProps` and the function signature:

```ts
export interface CompositeSummaryProps {
  composite: CompositeBoard
  boards: BoardProject[]
  woods: WoodSpecies[]
  pricing: PricingSettings
}
```
```ts
export function CompositeSummary({ composite, boards, woods, pricing }: CompositeSummaryProps) {
```

(c) After the existing `estimatedCost` line, compute total board-feet and the price:

```ts
  const totalBoardFeet = stock.reduce((sum, s) => sum + s.boardFeet, 0)
  const price = calculatePrice({ materialCost: estimatedCost, roughBoardFeet: totalBoardFeet, construction: composite.construction, tier: classifyComposite(), pricing })
```

(d) Add a Price entry to the `summary-stats` `<dl>` (after the Material estimate `div`):

```tsx
        <div><dt>Price</dt><dd>${price.total.toFixed(2)}</dd></div>
```

(e) Render the card after the `</dl>` closing the `summary-stats`, before the `<h4>Material by species</h4>`:

```tsx
      <PriceBreakdownCard price={price} roughBoardFeet={totalBoardFeet} construction={composite.construction}/>
```

- [ ] **Step 2: Thread the prop through `src/components/composite/CompositeScreen.tsx`**

(a) Add `pricing` to `CompositeScreenProps`:

```ts
export interface CompositeScreenProps {
  composite: CompositeBoard
  boards: BoardProject[]
  woods: WoodSpecies[]
  pricing: PricingSettings
  onChange: (composite: CompositeBoard) => void
  onCreateBoardForPanel: (construction: 'edge' | 'end') => string
  onEditBoard: (boardId: string) => void
  onBack: () => void
}
```

Add the type import:
```ts
import type { BoardProject, CompositeBoard, PricingSettings, WoodSpecies } from '../../types'
```

(b) Destructure `pricing` and pass it to `CompositeSummary`:

```ts
export function CompositeScreen({ composite, boards, woods, pricing, onChange, onCreateBoardForPanel, onEditBoard, onBack }: CompositeScreenProps) {
```
```tsx
          <CompositeSummary composite={composite} boards={boards} woods={woods} pricing={pricing} />
```

- [ ] **Step 3: Pass the prop from `src/App.tsx`**

In the `<CompositeScreen ... />` render, add `pricing={data.pricing}`:

```tsx
              <CompositeScreen
                composite={composite}
                boards={data.boards}
                woods={data.woods}
                pricing={data.pricing}
                onChange={updateComposite}
```

- [ ] **Step 4: Type-check, lint, build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: no errors; build succeeds.

- [ ] **Step 5: Manual smoke check**

Run: `pnpm dev`. Open a board, **Make composite**, place a wafer or two, and confirm the composite build sheet shows the "Price" stat and "Price breakdown" card, always at the Complex tier, with the end/edge minimum applied. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/components/composite/CompositeSummary.tsx src/components/composite/CompositeScreen.tsx src/App.tsx
git commit -m "feat(pricing): price breakdown in the composite summary

G"
```

---

## Final verification (after all tasks)

- [ ] Run the full gate: `pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm build` — all green.
- [ ] `git status` clean; review `git log --oneline develop..HEAD` shows the five feature commits (plus the earlier spec/ignore commits).

## Self-review notes

- **Spec coverage:** formula (Task 2 `calculatePrice`), tiers (Task 2 `classifyBoard`/`classifyComposite`), settings model (Task 1), persistence/normalization (Task 1), settings screen + nav (Task 3), board breakdown + print + disclaimer (Task 4), composite breakdown (Task 5). All spec sections map to a task.
- **Correction vs. spec:** the spec text said the settings screen "mirrors `MillingAllowances` with `NumberField` rows"; this plan deliberately uses a plain numeric input instead, because `NumberField` is length-aware (imperial conversion + 1/32" snapping) and would corrupt money/percent/hours. Structure/styling still mirror `MillingAllowances`.
- **Type consistency:** `PricingSettings`, `ComplexityTier`, `PriceBreakdown`, `calculatePrice`, `classifyBoard`, `classifyComposite`, `COMPLEX_SLICE_THRESHOLD`, `PriceBreakdownCard` names are used identically across tasks.
- **Board-stats column count:** Task 4 keeps four stat columns (Finished size · Material · Price · Waste/Joints) by dropping the "Rough stock" stat (still shown in the cut plan and print header).
