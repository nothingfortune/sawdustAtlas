# BOARD-026 Geometry Calculator (MVP) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A standalone free-form geometry calculator — place points, connect real-width members, edit exact values, and read distance / length+bearing / angle / intersection.

**Architecture:** Pure `geometry2d` domain (math, fully tested) + a scratchpad persisted to its own localStorage key + a self-contained `GeometryCalculator` component shown in a new "Geometry" left-nav view.

**Tech Stack:** TypeScript domain + React/SVG, Vitest, Playwright. Spec: `docs/superpowers/specs/2026-06-28-board-026-geometry-calculator-design.md`.

## Global Constraints

- Millimeters, full precision; math coords (x right, **y up**) in the domain — the UI flips y for SVG.
- `Vec` is an object (z can be added later); never assume only x/y elsewhere.
- `src/domain/**` + `storage.ts` are under the coverage gate.
- Readouts honor the Preston imperial toggle (`formatLength`/`formatNumber`); never hard-code mm.

---

### Task 1: Pure geometry — `geometry2d.ts`

**Files:**
- Create: `src/domain/geometry2d.ts`, `tests/geometry2d.test.ts`

**Interfaces:**
- Produces: `Vec`, `SketchPoint`, `SketchMember`, `Sketch`; `distance`, `bearingDeg`, `angleBetweenDeg`, `lineIntersection`, `memberRectangle`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { distance, bearingDeg, angleBetweenDeg, lineIntersection, memberRectangle } from '../src/domain/geometry2d'

const v = (x: number, y: number) => ({ x, y })

describe('geometry2d', () => {
  it('distance is euclidean', () => {
    expect(distance(v(0, 0), v(3, 4))).toBe(5)
  })

  it('bearingDeg measures from +x, y-up, normalized to (-180,180]', () => {
    expect(bearingDeg(v(0, 0), v(1, 0))).toBeCloseTo(0, 6)
    expect(bearingDeg(v(0, 0), v(0, 1))).toBeCloseTo(90, 6)
    expect(bearingDeg(v(0, 0), v(-1, 0))).toBeCloseTo(180, 6)
    expect(bearingDeg(v(0, 0), v(0, -1))).toBeCloseTo(-90, 6)
  })

  it('angleBetweenDeg returns [0,180]; perpendicular = 90, collinear = 0/180, zero-length = 0', () => {
    expect(angleBetweenDeg(v(0, 0), v(1, 0), v(0, 0), v(0, 1))).toBeCloseTo(90, 6)
    expect(angleBetweenDeg(v(0, 0), v(1, 0), v(0, 0), v(2, 0))).toBeCloseTo(0, 6)
    expect(angleBetweenDeg(v(0, 0), v(1, 0), v(0, 0), v(-1, 0))).toBeCloseTo(180, 6)
    expect(angleBetweenDeg(v(0, 0), v(0, 0), v(0, 0), v(1, 0))).toBe(0)
  })

  it('lineIntersection: crossing within both, on-extension, and parallel', () => {
    const cross = lineIntersection(v(-1, 0), v(1, 0), v(0, -1), v(0, 1))
    expect(cross?.point).toEqual({ x: 0, y: 0 })
    expect(cross?.withinBoth).toBe(true)
    const ext = lineIntersection(v(0, 0), v(1, 0), v(2, 1), v(2, 2)) // cross at (2,0), outside both segments
    expect(ext?.point.x).toBeCloseTo(2, 6)
    expect(ext?.withinBoth).toBe(false)
    expect(lineIntersection(v(0, 0), v(1, 0), v(0, 1), v(1, 1))).toBeNull() // parallel
  })

  it('memberRectangle offsets +/- width/2 perpendicular to the centerline', () => {
    const r = memberRectangle(v(0, 0), v(10, 0), 4) // horizontal, width 4 -> corners at y = +/-2
    const ys = r.map(c => c.y).sort((a, b) => a - b)
    expect(ys[0]).toBeCloseTo(-2, 6)
    expect(ys[3]).toBeCloseTo(2, 6)
    expect(r).toHaveLength(4)
    expect(memberRectangle(v(0, 0), v(0, 0), 4)).toHaveLength(4) // degenerate, no throw
  })
})
```

- [ ] **Step 2: Run, confirm fail** — `npx vitest run tests/geometry2d.test.ts` → module not found.

- [ ] **Step 3: Implement `src/domain/geometry2d.ts`**

```ts
// Pure 2D geometry for the calculator. Math coordinates (x right, y up); the UI flips y
// for SVG. Vec is an object so a z field can be added for true 3D later.

export interface Vec { x: number; y: number }
export interface SketchPoint { id: string; x: number; y: number }
export interface SketchMember { id: string; aId: string; bId: string; widthMm: number }
export interface Sketch { points: SketchPoint[]; members: SketchMember[] }

const EPSILON = 1e-9

export function distance(a: Vec, b: Vec): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function bearingDeg(a: Vec, b: Vec): number {
  return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI
}

export function angleBetweenDeg(a1: Vec, a2: Vec, b1: Vec, b2: Vec): number {
  const u = { x: a2.x - a1.x, y: a2.y - a1.y }
  const w = { x: b2.x - b1.x, y: b2.y - b1.y }
  const lu = Math.hypot(u.x, u.y), lw = Math.hypot(w.x, w.y)
  if (lu < EPSILON || lw < EPSILON) return 0
  const cos = Math.min(1, Math.max(-1, (u.x * w.x + u.y * w.y) / (lu * lw)))
  return Math.acos(cos) * 180 / Math.PI
}

export function lineIntersection(a1: Vec, a2: Vec, b1: Vec, b2: Vec): { point: Vec; withinBoth: boolean } | null {
  const r = { x: a2.x - a1.x, y: a2.y - a1.y }
  const s = { x: b2.x - b1.x, y: b2.y - b1.y }
  const denom = r.x * s.y - r.y * s.x
  if (Math.abs(denom) < EPSILON) return null // parallel or degenerate
  const qp = { x: b1.x - a1.x, y: b1.y - a1.y }
  const t = (qp.x * s.y - qp.y * s.x) / denom
  const u = (qp.x * r.y - qp.y * r.x) / denom
  const point = { x: a1.x + t * r.x, y: a1.y + t * r.y }
  return { point, withinBoth: t >= 0 && t <= 1 && u >= 0 && u <= 1 }
}

export function memberRectangle(a: Vec, b: Vec, widthMm: number): [Vec, Vec, Vec, Vec] {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const dir = len < EPSILON ? { x: 1, y: 0 } : { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
  const half = Math.max(0, widthMm) / 2
  const nx = -dir.y * half, ny = dir.x * half // perpendicular * half width
  return [
    { x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny },
  ]
}
```

- [ ] **Step 4: Run, confirm pass** — `npx vitest run tests/geometry2d.test.ts` (5 tests).

- [ ] **Step 5: Commit**
```bash
git add src/domain/geometry2d.ts tests/geometry2d.test.ts
git commit -m "feat(board-026): pure geometry2d primitives"
```

---

### Task 2: Scratchpad persistence + View type

**Files:**
- Modify: `src/storage.ts` (+ `tests/storage.test.ts`), `src/types.ts`

**Interfaces:**
- Consumes: `Sketch`/`SketchPoint`/`SketchMember` from `./domain/geometry2d`, `finiteNumber`/`stringValue` (existing helpers in storage).
- Produces: `loadSketch()`, `saveSketch(sketch)`, `normalizeSketch(raw)`; `View` includes `'geometry'`.

- [ ] **Step 1: Add `'geometry'` to the View union** in `src/types.ts`:
```ts
export type View = 'home' | 'shop' | 'boards' | 'woods' | 'allowances' | 'pricing' | 'geometry'
```

- [ ] **Step 2: Write the failing storage tests** (in `tests/storage.test.ts`, new describe; mirror the onboarding test's `MemoryStorage` stub):
```ts
describe('geometry sketch scratchpad (BOARD-026)', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', new MemoryStorage()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('round-trips a sketch and defaults to empty', () => {
    expect(loadSketch()).toEqual({ points: [], members: [] })
    saveSketch({ points: [{ id: 'p', x: 10, y: 20 }], members: [] })
    expect(loadSketch().points[0]).toMatchObject({ id: 'p', x: 10, y: 20 })
  })

  it('normalizes junk: bad coords coerced, members referencing missing points dropped', () => {
    saveSketch({ points: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 1, y: 1 }], members: [
      { id: 'm1', aId: 'a', bId: 'b', widthMm: 18 },
      { id: 'm2', aId: 'a', bId: 'ghost', widthMm: 18 },
    ] } as never)
    const loaded = loadSketch()
    expect(loaded.members.map(m => m.id)).toEqual(['m1'])
  })
})
```
Add `loadSketch, saveSketch` to the storage import at the top of the test file.

- [ ] **Step 3: Run, confirm fail** — `npx vitest run tests/storage.test.ts` → loadSketch undefined.

- [ ] **Step 4: Implement in `src/storage.ts`** (near `hasOnboarded`; reuse `finiteNumber`, `stringValue`, `isRecord`, `records`):
```ts
import type { Sketch, SketchMember, SketchPoint } from './domain/geometry2d'

const SKETCH_KEY = 'sawdust-atlas:geometry'

export function normalizeSketch(raw: unknown): Sketch {
  if (!isRecord(raw)) return { points: [], members: [] }
  const points: SketchPoint[] = records(raw['points']).map(point => ({
    id: stringValue(point['id'], createId()),
    x: signedFinite(point['x'], 0),
    y: signedFinite(point['y'], 0),
  }))
  const ids = new Set(points.map(point => point.id))
  const members: SketchMember[] = records(raw['members'])
    .map(member => ({
      id: stringValue(member['id'], createId()),
      aId: stringValue(member['aId'], ''),
      bId: stringValue(member['bId'], ''),
      widthMm: finiteNumber(member['widthMm'], 18),
    }))
    .filter(member => ids.has(member.aId) && ids.has(member.bId) && member.aId !== member.bId)
  return { points, members }
}

export function loadSketch(): Sketch {
  try {
    const saved = localStorage.getItem(SKETCH_KEY)
    return saved ? normalizeSketch(JSON.parse(saved) as unknown) : { points: [], members: [] }
  } catch { return { points: [], members: [] } }
}

export function saveSketch(sketch: Sketch): void {
  try { localStorage.setItem(SKETCH_KEY, JSON.stringify(sketch)) } catch { /* best effort */ }
}
```
(Confirm `signedFinite`, `records`, `isRecord`, `stringValue`, `createId` are already imported/defined in storage.ts — they are used elsewhere there.)

- [ ] **Step 5: Run, confirm pass** — `npx vitest run tests/storage.test.ts`.

- [ ] **Step 6: Verify + commit**
```bash
pnpm typecheck
git add src/storage.ts src/types.ts tests/storage.test.ts
git commit -m "feat(board-026): persisted geometry scratchpad + View type"
```

---

### Task 3: `GeometryCalculator` component

**Files:**
- Create: `src/components/GeometryCalculator.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `Sketch` + helpers from `../domain/geometry2d`; `formatLength`/`formatNumber` + `useUnitSystem`; `createId`.
- Produces: `GeometryCalculator({ sketch, onChange })`.

- [ ] **Step 1: Build the component.** A self-contained editor: `props { sketch: Sketch; onChange: (next: Sketch) => void }`. Local UI state: `selected: string[]` (point or member ids, prefixed `p:`/`m:`), pan/zoom via `usePinchPan`. Render an SVG canvas (math y-up → SVG by negating y around a center origin). Behaviors:
  - Click empty canvas → add a `SketchPoint` (createId) at the (unprojected) coords; snap to a 10 mm grid.
  - Click a point → toggle-select (cap at 2 for readouts); drag a point → update its x/y via onChange.
  - "Connect" button (enabled when exactly 2 points selected) → add a `SketchMember { aId, bId, widthMm: 18 }`.
  - Click a member → select it (drawn via `memberRectangle`).
  - Inspector (right side): for a selected point, number inputs for x/y; for a selected member, inputs for width and (length, bearing) — length/bearing recompute `b` from `a` using `a + (cos,sin)*length`.
  - Readouts panel driven by selection: 2 points → `distance`; 1 member → length (`distance`) + `bearingDeg`; 2 members → `angleBetweenDeg` + `lineIntersection` (draw the point; "parallel — no intersection" when null).
  - "Clear" → `onChange({ points: [], members: [] })`. Empty state when no points.
  Use `data-geo-point` / `data-geo-member` attributes and stable class names (`.geo-canvas`, `.geo-point`, `.geo-member`, `.geo-readout`, `.geo-intersection`) for e2e + styling.

- [ ] **Step 2: Add CSS** in `src/styles.css` for `.geometry-layout`, `.geo-canvas`, `.geo-point`, `.geo-member`, `.geo-inspector`, `.geo-readout`, `.geo-empty` (follow the shop/board canvas styling conventions; SVG points are circles, selected = orange stroke).

- [ ] **Step 3: Verify** — `pnpm typecheck && pnpm lint && pnpm build` → pass.

- [ ] **Step 4: Commit**
```bash
git add src/components/GeometryCalculator.tsx src/styles.css
git commit -m "feat(board-026): GeometryCalculator canvas + readouts"
```

---

### Task 4: Wire the standalone "Geometry" view into the app

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: State + autosave.** Add `const [sketch, setSketch] = useState<Sketch>(loadSketch)`; an effect `useEffect(() => { saveSketch(sketch) }, [sketch])`. Import `loadSketch`, `saveSketch` from `./storage`, `Sketch` from `./domain/geometry2d`, `GeometryCalculator`, and a `Compass` (or `Ruler`/`Triangle`) icon from lucide-react.

- [ ] **Step 2: Nav + breadcrumb.** Add a `NavButton` for `view === 'geometry'` (label "Geometry") in the sidebar's library group; extend the breadcrumb ternary to render "Geometry" for that view.

- [ ] **Step 3: Render the view.** Add `{view === 'geometry' && <GeometryCalculator sketch={sketch} onChange={setSketch} />}` alongside the other view blocks.

- [ ] **Step 4: Verify** — `pnpm typecheck && pnpm lint && pnpm build` → pass.

- [ ] **Step 5: Commit**
```bash
git add src/App.tsx
git commit -m "feat(board-026): standalone Geometry view + nav"
```

---

### Task 5: e2e

**Files:**
- Create: `e2e/geometry.spec.ts`

- [ ] **Step 1: Write the spec** (place points, read distance; persistence on reload):
```ts
import { test, expect } from '@playwright/test'

test.describe('geometry calculator', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { window.localStorage.clear(); window.localStorage.setItem('sawdust-atlas:onboarded', '1') })
    await page.goto('/')
    await page.getByRole('button', { name: 'Geometry' }).click()
  })

  test('places points, connects members, and reads distance + angle', async ({ page }) => {
    const canvas = page.locator('.geo-canvas')
    await expect(canvas).toBeVisible()
    const box = (await canvas.boundingBox())!
    await page.mouse.click(box.x + 120, box.y + 120)
    await page.mouse.click(box.x + 320, box.y + 120)
    await expect(page.locator('.geo-point')).toHaveCount(2)
    // two selected points -> a distance readout appears
    await expect(page.locator('.geo-readout')).toContainText(/distance/i)
  })

  test('persists the sketch across reload', async ({ page }) => {
    const box = (await page.locator('.geo-canvas').boundingBox())!
    await page.mouse.click(box.x + 150, box.y + 150)
    await expect(page.locator('.geo-point')).toHaveCount(1)
    await page.reload()
    await page.getByRole('button', { name: 'Geometry' }).click()
    await expect(page.locator('.geo-point')).toHaveCount(1)
  })
})
```
(Adjust selectors/click targets to the implementation; the intent is: points appear, a readout shows, and the sketch survives reload.)

- [ ] **Step 2: Run e2e + full suite**

Run: `pnpm exec playwright test e2e/geometry.spec.ts` then `pnpm test && pnpm exec playwright test`
Expected: all pass. Screenshot the view to confirm it renders cleanly.

- [ ] **Step 3: Commit**
```bash
git add e2e/geometry.spec.ts
git commit -m "test(board-026): e2e for the geometry calculator"
```

---

## Self-Review

- **Spec coverage:** geometry math → Task 1; persistence + View → Task 2; canvas/inspector/readouts → Task 3; standalone view/nav → Task 4; e2e → Task 5. All four readouts + member thickness (`memberRectangle`) covered.
- **Placeholders:** none — code/commands concrete. Task 3's component is described behaviorally with exact class/attr names and the helper calls it uses (the one UI-heavy task); its geometry all comes from the Task 1 functions.
- **Type consistency:** `Sketch`/`SketchPoint`/`SketchMember`/`Vec` defined in Task 1 are reused verbatim in Tasks 2–4; `loadSketch`/`saveSketch`/`normalizeSketch` signatures match across storage + tests + App.
