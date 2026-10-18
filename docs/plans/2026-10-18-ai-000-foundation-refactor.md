# AI-000 Foundation Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move workspace changes, screen state, and import normalizers out of `App.tsx`, `BoardDesigner.tsx`, and `storage.ts` into small, pure, tested modules, with no user-visible behavior change.

**Architecture:** Three PRs to `develop`, each green on its own. PR 1 splits `storage.ts`'s normalizers into `src/normalize/` behind one `normalizeData` funnel. PR 2 adds pure workspace actions (`src/domain/workspace/`) and board edits (`src/domain/boardEditing.ts`), and the UI calls them through `commitData`. PR 3 replaces the loose navigation `useState`s with one reducer (`src/navigation.ts`) and a history hook.

**Tech Stack:** React 19, TypeScript (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`), Vitest, Playwright, pnpm 11.5.3, Node 24.

**Spec:** [`docs/specs/2026-10-18-ai-000-foundation-refactor-design.md`](../specs/2026-10-18-ai-000-foundation-refactor-design.md)

## Global Constraints

- No user-visible behavior change. All unit tests, the golden plans in `tests/__golden__/`, and both e2e projects (desktop and tablet) pass at every commit.
- Existing tests change only their import paths.
- Millimeters at full float precision; no rounding added anywhere.
- `finiteNumber` clamps to non-negative; `signedFinite` keeps the sign; `nonNegativeFinite` rejects negatives. Never swap one for another while moving code.
- Domain code (`src/domain/**`) has no React or DOM, and never calls `new Date()` or `createId()` itself; ids and time arrive in a context argument.
- Coverage thresholds stay as they are (lines 90 / functions 85 / branches 75 / statements 88) and stay green.
- Comments: one line stating why. Code moved verbatim keeps its existing comments.
- Use `import type` for type-only imports.
- PRs target `develop`. No attribution footers in commits or PR bodies.
- Test files stay flat in `tests/`, named after the module (`normalizeBoards.test.ts`, `workspaceBoards.test.ts`), matching the repo's existing `furnitureEditing.test.ts` style.

## Review Focus

1. A legacy backup whose composite has inline-strip (`kind: 'rip'`) panels must still produce real boards that the composite references, with the end-grain donor thickness carried over. Test in Task 4.
2. Negative trailing angles and row offsets must keep their sign through the split (a `finiteNumber`/`signedFinite` mix-up silently breaks chevrons). Test in Task 3.
3. Deleting the open board, shop, or furniture project must fall back exactly as today; deleting one that is not open must leave the selection alone. Test in Task 10.
4. Browser Back must keep moving composite → gallery → home: the `history.state` shape written by `pushState` must not change. Test in Task 10 (round trip) and the existing e2e back-button specs in Task 11.
5. Shrinking the end-grain slice count must clamp per-slice transforms so they cannot come back when the count grows again. Test in Task 8.

---

## PR 1: Normalizer split

Branch: `git switch develop && git pull --ff-only && git switch -c refactor/ai-000-normalize`

### Task 1: Shared context, coercers, and test helper

**Files:**
- Create: `src/domain/workspace/context.ts`
- Create: `src/normalize/context.ts`
- Create: `src/normalize/coerce.ts`
- Create: `tests/fixtures/context.ts`
- Test: `tests/normalizeCoerce.test.ts`
- Modify: `vite.config.ts:95` (coverage include)
- Modify: `tsconfig.test.json:9` (include)

**Interfaces:**
- Produces: `WorkspaceContext { createId: () => string; now: string }`, `Created { data: AtlasData; id: string }` (workspace/context.ts); `NormalizeContext` (alias of `WorkspaceContext`) and `defaultNormalizeContext(): NormalizeContext` (normalize/context.ts); `records`, `isRecord`, `stringValue`, `finiteNumber`, `signedFinite`, `nonNegativeFinite`, `validColor` (normalize/coerce.ts); `fixedContext(now?)` test helper.

- [ ] **Step 1: Write the failing test**

`tests/fixtures/context.ts`:

```ts
import type { WorkspaceContext } from '../../src/domain/workspace/context'

export const FIXED_NOW = '2026-10-18T00:00:00.000Z'

/** Deterministic ids (id-1, id-2, ...) and a fixed clock for domain tests. */
export function fixedContext(now = FIXED_NOW): WorkspaceContext {
  let next = 0
  return { createId: () => `id-${++next}`, now }
}
```

`tests/normalizeCoerce.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { finiteNumber, isRecord, nonNegativeFinite, records, signedFinite, stringValue, validColor } from '../src/normalize/coerce'
import { defaultNormalizeContext } from '../src/normalize/context'

describe('coercers', () => {
  it('finiteNumber clamps negatives to 0 and falls back on non-finite input', () => {
    expect(finiteNumber(-5, 9)).toBe(0)
    expect(finiteNumber(12.5, 9)).toBe(12.5)
    expect(finiteNumber(Number.NaN, 9)).toBe(9)
    expect(finiteNumber(Infinity, 9)).toBe(9)
    expect(finiteNumber('12', 9)).toBe(9)
  })

  it('signedFinite keeps the sign', () => {
    expect(signedFinite(-7.5, 0)).toBe(-7.5)
    expect(signedFinite(Number.NaN, 3)).toBe(3)
  })

  it('nonNegativeFinite rejects negatives outright instead of clamping', () => {
    expect(nonNegativeFinite(-1, 4)).toBe(4)
    expect(nonNegativeFinite(0, 4)).toBe(0)
  })

  it('stringValue rejects blank strings and non-strings', () => {
    expect(stringValue('  ', 'x')).toBe('x')
    expect(stringValue(3, 'x')).toBe('x')
    expect(stringValue('Walnut', 'x')).toBe('Walnut')
  })

  it('validColor accepts only #rrggbb', () => {
    expect(validColor('#A1b2C3', '#000000')).toBe('#A1b2C3')
    expect(validColor('red', '#000000')).toBe('#000000')
  })

  it('records keeps objects only; isRecord accepts arrays as today', () => {
    expect(records([{ a: 1 }, null, 3, 'x'])).toEqual([{ a: 1 }])
    expect(records('nope')).toEqual([])
    expect(isRecord([])).toBe(true)
    expect(isRecord(null)).toBe(false)
  })
})

describe('defaultNormalizeContext', () => {
  it('stamps an ISO time and issues distinct ids', () => {
    const ctx = defaultNormalizeContext()
    expect(Number.isNaN(Date.parse(ctx.now))).toBe(false)
    expect(ctx.createId()).not.toBe(ctx.createId())
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test tests/normalizeCoerce.test.ts`
Expected: FAIL, cannot resolve `../src/normalize/coerce`.

- [ ] **Step 3: Implement**

`src/domain/workspace/context.ts`:

```ts
import type { AtlasData } from '../../types'

/** Ids and time for a workspace change; the domain never reads the clock or random ids itself. */
export interface WorkspaceContext {
  createId: () => string
  now: string
}

/** A change that made something, plus the id of what it made so the UI can open it. */
export interface Created {
  data: AtlasData
  id: string
}
```

`src/normalize/context.ts`:

```ts
import type { WorkspaceContext } from '../domain/workspace/context'
import { createId } from '../id'

export type NormalizeContext = WorkspaceContext

export function defaultNormalizeContext(): NormalizeContext {
  return { createId, now: new Date().toISOString() }
}
```

`src/normalize/coerce.ts`: move these functions **verbatim, with their comments**, from `src/storage.ts:386-415` and add `export` to each: `records`, `isRecord`, `stringValue`, `finiteNumber`, `signedFinite`, `nonNegativeFinite`, `validColor`. Add one line above `isRecord`:

```ts
// Arrays pass too (unlike projectPackage's isRecord); callers only read named keys.
```

Leave the originals in `storage.ts` for now; Task 6 deletes them.

`vite.config.ts:95`: change the coverage include to

```ts
        include: ['src/domain/**', 'src/normalize/**', 'src/storage.ts', 'src/projectPackage.ts', 'src/data.ts', 'src/id.ts'],
```

`tsconfig.test.json:9`: add `"src/normalize"` after `"src/domain"` in `include`.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm test tests/normalizeCoerce.test.ts && pnpm typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/domain/workspace/context.ts src/normalize tests/fixtures/context.ts tests/normalizeCoerce.test.ts vite.config.ts tsconfig.test.json
git commit -m "refactor(normalize): shared coercers and id/clock context"
```

### Task 2: Wood and settings normalizers

**Files:**
- Create: `src/normalize/woods.ts`
- Create: `src/normalize/settings.ts`
- Test: `tests/normalizeWoods.test.ts`, `tests/normalizeSettings.test.ts`

**Interfaces:**
- Consumes: Task 1 coercers and `NormalizeContext`.
- Produces: `normalizeWood(wood: Partial<WoodSpecies>, ctx: NormalizeContext): WoodSpecies`; `normalizeWoodLibrary(raw: unknown, ctx: NormalizeContext): WoodSpecies[]`; `placeholderWoods(rawBoards: readonly Record<string, unknown>[], library: readonly WoodSpecies[], ctx: NormalizeContext): WoodSpecies[]`; `normalizeAllowances(saved: (BuildAllowances & { drumSanding?: number }) | undefined): BuildAllowances`; `normalizePricing(saved: unknown): PricingSettings`.

- [ ] **Step 1: Write the failing tests**

`tests/normalizeWoods.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { defaultSpecies } from '../src/data'
import { normalizeWood, normalizeWoodLibrary, placeholderWoods } from '../src/normalize/woods'
import { fixedContext } from './fixtures/context'

describe('normalizeWood', () => {
  it('fills defaults and keeps a trimmed availableAt', () => {
    expect(normalizeWood({ id: 'oak', availableAt: '  Shop A ' }, fixedContext())).toEqual({
      id: 'oak', name: 'oak', color: '#8c6a48', accent: '#b18a5e', pricePerBoardFoot: 0, availableAt: 'Shop A',
    })
  })

  it('drops a blank availableAt and issues an id from the context when missing', () => {
    const wood = normalizeWood({ name: 'Cherry', availableAt: '   ' }, fixedContext())
    expect(wood.id).toBe('id-1')
    expect('availableAt' in wood).toBe(false)
  })
})

describe('normalizeWoodLibrary', () => {
  it('falls back to the default species when none are saved', () => {
    expect(normalizeWoodLibrary([], fixedContext()).map(wood => wood.id)).toEqual(defaultSpecies.map(wood => wood.id))
  })

  it('keeps saved woods when present', () => {
    expect(normalizeWoodLibrary([{ id: 'ash', name: 'Ash' }], fixedContext()).map(wood => wood.id)).toEqual(['ash'])
  })
})

describe('placeholderWoods', () => {
  it('adds one placeholder per unknown strip species, deduplicated', () => {
    const library = normalizeWoodLibrary([{ id: 'ash' }], fixedContext())
    const rawBoards = [{ strips: [{ speciesId: 'ash' }, { speciesId: 'zebra' }, { speciesId: 'zebra' }, {}] }]
    expect(placeholderWoods(rawBoards, library, fixedContext())).toEqual([
      { id: 'zebra', name: 'zebra', color: '#8c6a48', accent: '#b18a5e', pricePerBoardFoot: 0 },
    ])
  })
})
```

`tests/normalizeSettings.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_PRICING } from '../src/data'
import { DEFAULT_ALLOWANCES } from '../src/domain/boardAllowances'
import { normalizeAllowances, normalizePricing } from '../src/normalize/settings'

describe('normalizeAllowances', () => {
  it('migrates legacy drumSanding to routerTable', () => {
    expect(normalizeAllowances({ ...DEFAULT_ALLOWANCES, routerTable: undefined as unknown as number, drumSanding: 1.5 }).routerTable).toBe(1.5)
  })

  it('falls back per field on invalid values', () => {
    expect(normalizeAllowances(undefined)).toEqual(DEFAULT_ALLOWANCES)
    expect(normalizeAllowances({ ...DEFAULT_ALLOWANCES, planing: Infinity }).planing).toBe(DEFAULT_ALLOWANCES.planing)
  })
})

describe('normalizePricing', () => {
  it('rejects negative rates instead of clamping them', () => {
    expect(normalizePricing({ laborRatePerHour: -10 }).laborRatePerHour).toBe(DEFAULT_PRICING.laborRatePerHour)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test tests/normalizeWoods.test.ts tests/normalizeSettings.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/normalize/woods.ts`:

```ts
import { defaultSpecies } from '../data'
import type { WoodSpecies } from '../types'
import { finiteNumber, records, stringValue, validColor } from './coerce'
import type { NormalizeContext } from './context'

export function normalizeWood(wood: Partial<WoodSpecies>, ctx: NormalizeContext): WoodSpecies {
  const base: WoodSpecies = {
    id: stringValue(wood.id, ctx.createId()),
    name: stringValue(wood.name, stringValue(wood.id, 'Custom wood')),
    color: validColor(wood.color, '#8c6a48'),
    accent: validColor(wood.accent, '#b18a5e'),
    pricePerBoardFoot: finiteNumber(wood.pricePerBoardFoot, 0),
  }
  const availableAt = typeof wood.availableAt === 'string' ? wood.availableAt.trim() : ''
  return availableAt ? { ...base, availableAt } : base
}

/** Saved woods, or the default library when none are saved. */
export function normalizeWoodLibrary(raw: unknown, ctx: NormalizeContext): WoodSpecies[] {
  const saved: Partial<WoodSpecies>[] = records(raw).length > 0 ? records(raw) : defaultSpecies
  return saved.map(wood => normalizeWood(wood, ctx))
}

/** Placeholder species for strip references missing from the library, so colors and prices stay visible. */
export function placeholderWoods(rawBoards: readonly Record<string, unknown>[], library: readonly WoodSpecies[], ctx: NormalizeContext): WoodSpecies[] {
  const known = new Set(library.map(wood => wood.id))
  const missing = rawBoards
    .flatMap(board => records(board['strips']).map(strip => String(strip['speciesId'] ?? '')))
    .filter(id => id && !known.has(id))
  return [...new Set(missing)].map(id => normalizeWood({ id, name: id, color: '#8c6a48', accent: '#b18a5e', pricePerBoardFoot: 0 }, ctx))
}
```

`src/normalize/settings.ts`: move `normalizeAllowances` (`storage.ts:334-351`, with its comment block) and `normalizePricing` (`storage.ts:353-372`) verbatim, both exported. Imports:

```ts
import { DEFAULT_PRICING } from '../data'
import { DEFAULT_ALLOWANCES } from '../domain/boardAllowances'
import type { BuildAllowances, PricingSettings } from '../types'
import { finiteNumber, isRecord, nonNegativeFinite } from './coerce'
```

- [ ] **Step 4: Run tests**

Run: `pnpm test tests/normalizeWoods.test.ts tests/normalizeSettings.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/normalize/woods.ts src/normalize/settings.ts tests/normalizeWoods.test.ts tests/normalizeSettings.test.ts
git commit -m "refactor(normalize): wood library and settings normalizers"
```

### Task 3: Board normalizer

**Files:**
- Create: `src/normalize/boards.ts`
- Test: `tests/normalizeBoards.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces: `normalizeStrip(raw: Record<string, unknown>, fallbackSpeciesId: string, ctx: NormalizeContext): BoardStrip`; `normalizeEndGrain(value: unknown, stockThickness: number): EndGrainSettings`; `normalizeBoard(raw: Record<string, unknown>, options: { allowances: BuildAllowances; fallbackSpeciesId: string }, ctx: NormalizeContext): BoardProject`.

- [ ] **Step 1: Write the failing test**

`tests/normalizeBoards.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_ALLOWANCES } from '../src/domain/boardAllowances'
import { normalizeBoard, normalizeEndGrain, normalizeStrip } from '../src/normalize/boards'
import { FIXED_NOW, fixedContext } from './fixtures/context'

const options = { allowances: DEFAULT_ALLOWANCES, fallbackSpeciesId: 'walnut' }

describe('normalizeBoard', () => {
  it('fills defaults for an empty record from the context', () => {
    const board = normalizeBoard({}, options, fixedContext())
    expect(board).toMatchObject({ id: 'id-1', name: 'Imported cutting board', length: 450, thickness: 38, construction: 'edge', updatedAt: FIXED_NOW, strips: [] })
    expect(board.allowances).toBe(DEFAULT_ALLOWANCES)
  })

  it('keeps negative trailing angles and row offsets (load-bearing for chevrons)', () => {
    const board = normalizeBoard({
      construction: 'end',
      strips: [{ id: 's', speciesId: 'oak', width: 30, trailingAngle: -22.5 }],
      endGrain: { rowOffsets: [-0.25, 0.5] },
    }, options, fixedContext())
    expect(board.strips[0]?.trailingAngle).toBe(-22.5)
    expect(board.endGrain.rowOffsets).toEqual([-0.25, 0.5])
  })

  it('clamps negative dimensions to 0', () => {
    expect(normalizeBoard({ length: -10 }, options, fixedContext()).length).toBe(0)
  })
})

describe('normalizeStrip', () => {
  it('uses the fallback species when none is given', () => {
    expect(normalizeStrip({}, 'maple', fixedContext())).toEqual({ id: 'id-1', speciesId: 'maple', width: 38, trailingAngle: 0 })
  })
})

describe('normalizeEndGrain', () => {
  it('seeds stock thickness from the board and truncates row order', () => {
    const settings = normalizeEndGrain({ rowOrder: [2.9, 'x'] }, 40)
    expect(settings.stockThickness).toBe(40)
    expect(settings.rowOrder).toEqual([2, 0])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test tests/normalizeBoards.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/normalize/boards.ts`:

```ts
import type { BoardProject, BoardStrip, BuildAllowances, EndGrainSettings } from '../types'
import { finiteNumber, isRecord, signedFinite, stringValue } from './coerce'
import type { NormalizeContext } from './context'

export function normalizeStrip(raw: Record<string, unknown>, fallbackSpeciesId: string, ctx: NormalizeContext): BoardStrip {
  return {
    id: stringValue(raw['id'], ctx.createId()),
    speciesId: stringValue(raw['speciesId'], fallbackSpeciesId),
    width: finiteNumber(raw['width'], 38),
    trailingAngle: signedFinite(raw['trailingAngle'], 0),
  }
}

export function normalizeBoard(raw: Record<string, unknown>, options: { allowances: BuildAllowances; fallbackSpeciesId: string }, ctx: NormalizeContext): BoardProject {
  const strips = records(raw['strips']).map(strip => normalizeStrip(strip, options.fallbackSpeciesId, ctx))
  const endGrain = normalizeEndGrain(raw['endGrain'], finiteNumber(raw['thickness'], 38))
  return {
    id: stringValue(raw['id'], ctx.createId()),
    name: stringValue(raw['name'], 'Imported cutting board'),
    length: finiteNumber(raw['length'], 450),
    thickness: finiteNumber(raw['thickness'], 38),
    updatedAt: stringValue(raw['updatedAt'], ctx.now),
    construction: raw['construction'] === 'end' ? 'end' : 'edge',
    allowances: options.allowances,
    strips,
    endGrain,
  }
}
```

Add `records` to the coerce import. Then move `normalizeEndGrain` verbatim from `storage.ts:319-332`, exported.

Note the evaluation order: strips are normalized before the board id, exactly as in `normalizeData` today (`storage.ts:63-79`), so ids issue in the same order.

- [ ] **Step 4: Run tests**

Run: `pnpm test tests/normalizeBoards.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/normalize/boards.ts tests/normalizeBoards.test.ts
git commit -m "refactor(normalize): board, strip, and end-grain normalizers"
```

### Task 4: Composite normalizer

**Files:**
- Create: `src/normalize/composites.ts`
- Test: `tests/normalizeComposites.test.ts`

**Interfaces:**
- Consumes: Tasks 1 and 3 (`normalizeStrip`, `normalizeEndGrain`).
- Produces: `normalizeComposite(raw: Record<string, unknown>, options: { boardSink: BoardProject[]; allowances: BuildAllowances; boards: readonly BoardProject[] }, ctx: NormalizeContext): CompositeBoard`.

- [ ] **Step 1: Write the failing test**

`tests/normalizeComposites.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_ALLOWANCES } from '../src/domain/boardAllowances'
import { normalizeBoard } from '../src/normalize/boards'
import { normalizeComposite } from '../src/normalize/composites'
import type { BoardProject } from '../src/types'
import { FIXED_NOW, fixedContext } from './fixtures/context'

const allowances = DEFAULT_ALLOWANCES

describe('normalizeComposite', () => {
  it('turns a legacy inline-strip panel into a real board it references', () => {
    const sink: BoardProject[] = []
    const composite = normalizeComposite({
      id: 'c', panels: [{ id: 'p', kind: 'rip', construction: 'end', thicknessMm: 52, strips: [{ speciesId: 'oak', width: 20, trailingAngle: -10 }] }],
      rows: [{ id: 'r', wafers: [{ panelId: 'p', pieceIndex: 0, rotate: 90, flip: true }] }],
    }, { boardSink: sink, allowances, boards: [] }, fixedContext())
    expect(sink).toHaveLength(1)
    const board = sink[0]!
    expect(composite.panels[0]?.boardId).toBe(board.id)
    expect(board).toMatchObject({ construction: 'end', thickness: 52, updatedAt: FIXED_NOW })
    expect(board.endGrain.sliceThickness).toBe(52)
    expect(board.strips[0]?.trailingAngle).toBe(-10)
    expect(composite.construction).toBe('end')
    expect(composite.rows[0]?.wafers).toEqual([{ panelId: 'p', pieceIndex: 0, rotate: 90, flip: true }])
  })

  it('drops legacy derived panels and their wafers', () => {
    const composite = normalizeComposite({
      panels: [{ id: 'd', kind: 'derived' }],
      rows: [{ wafers: [{ panelId: 'd', pieceIndex: 0 }] }],
    }, { boardSink: [], allowances, boards: [] }, fixedContext())
    expect(composite.panels).toEqual([])
    expect(composite.rows[0]?.wafers).toEqual([])
  })

  it('infers construction from a referenced board and converts a legacy grid to rows', () => {
    const boards = [normalizeBoard({ id: 'b', construction: 'end' }, { allowances, fallbackSpeciesId: 'walnut' }, fixedContext())]
    const composite = normalizeComposite({
      panels: [{ id: 'p', boardId: 'b', crosscut: { stripWidthMm: 30 } }],
      rows: 2, cols: 1, cells: [{ panelId: 'p', pieceIndex: 1 }, null],
    }, { boardSink: [], allowances, boards }, fixedContext())
    expect(composite.construction).toBe('end')
    expect(composite.panels[0]?.cut).toEqual({ axis: 'x', stripWidthMm: 30, kerfMm: 3, count: 1 })
    expect(composite.rows.map(row => row.wafers.length)).toEqual([1, 0])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test tests/normalizeComposites.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `src/normalize/composites.ts` by moving `normalizeComposite`, `normalizeCut`, `normalizeWafers`, `normalizeRows`, and `normalizeCell` from `storage.ts:201-317`, with their comments, and applying exactly these edits:

1. Signature: `export function normalizeComposite(raw: Record<string, unknown>, options: { boardSink: BoardProject[]; allowances: BuildAllowances; boards: readonly BoardProject[] }, ctx: NormalizeContext): CompositeBoard`. Inside, `boardSink` becomes `options.boardSink`, `allowances` becomes `options.allowances`, and `normalizedBoards` becomes `options.boards`.
2. Every `createId()` becomes `ctx.createId()`. `normalizeRows` takes a third argument, `ctx: NormalizeContext`, and passes it through.
3. Both `new Date().toISOString()` (the migrated board's `updatedAt` and the composite's fallback `updatedAt`) become `ctx.now`.
4. The migrated board's strips call `normalizeStrip(s, 'walnut', ctx)` instead of the inline object (identical fields and fallbacks).

Imports:

```ts
import type { AssemblyCell, BoardProject, BuildAllowances, CompositeBoard, CompositeCut, CompositePanel, CompositeRow } from '../types'
import { normalizeEndGrain, normalizeStrip } from './boards'
import { finiteNumber, isRecord, records, stringValue } from './coerce'
import type { NormalizeContext } from './context'
```

Only `normalizeComposite` is exported.

- [ ] **Step 4: Run tests**

Run: `pnpm test tests/normalizeComposites.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/normalize/composites.ts tests/normalizeComposites.test.ts
git commit -m "refactor(normalize): composite normalizer with legacy panel migration"
```

### Task 5: Shop normalizer

**Files:**
- Create: `src/normalize/shops.ts`
- Test: `tests/normalizeShops.test.ts`

**Interfaces:**
- Produces: `normalizeShop(raw: Record<string, unknown>, ctx: NormalizeContext): ShopProject`.

- [ ] **Step 1: Write the failing test**

`tests/normalizeShops.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeShop } from '../src/normalize/shops'
import { FIXED_NOW, fixedContext } from './fixtures/context'

describe('normalizeShop', () => {
  it('fills defaults and replaces a zero grid with 300', () => {
    expect(normalizeShop({ gridSize: 0 }, fixedContext())).toMatchObject({
      id: 'id-1', name: 'Imported workshop', width: 6000, depth: 6000, gridSize: 300, blockedZones: [], items: [], updatedAt: FIXED_NOW,
    })
  })

  it('gives a blocked zone at least 1 mm of size', () => {
    const shop = normalizeShop({ blockedZones: [{ id: 'z', width: 0, depth: -4 }] }, fixedContext())
    expect(shop.blockedZones[0]).toMatchObject({ id: 'z', name: 'No-go zone', width: 1, depth: 1 })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test tests/normalizeShops.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Move `normalizeShop` and `normalizeBlockedZone` from `storage.ts:177-199` into `src/normalize/shops.ts`. `normalizeShop` gains `ctx: NormalizeContext` and passes it to `normalizeBlockedZone(zone, ctx)`; `createId()` becomes `ctx.createId()`; `new Date().toISOString()` becomes `ctx.now`. Export `normalizeShop` only.

```ts
import { normalizeShopItem } from '../domain/shopObjects'
import type { ShopBlockedZone, ShopItem, ShopProject } from '../types'
import { finiteNumber, records, stringValue } from './coerce'
import type { NormalizeContext } from './context'
```

- [ ] **Step 4: Run tests**

Run: `pnpm test tests/normalizeShops.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/normalize/shops.ts tests/normalizeShops.test.ts
git commit -m "refactor(normalize): shop normalizer"
```

### Task 6: Compose `normalizeData` from the domain normalizers

**Files:**
- Modify: `src/storage.ts:1-108` (imports and `normalizeData`), `src/storage.ts:177-415` (delete moved code)
- Test: existing `tests/storage.test.ts`, `tests/importRobustness.test.ts`, `tests/migrations.test.ts`, `tests/projectPackage.test.ts` (unchanged)

**Interfaces:**
- Consumes: Tasks 1-5.
- Produces: `normalizeData(input: Partial<AtlasData>, ctx?: NormalizeContext): AtlasData` (same behavior; `ctx` defaults to `defaultNormalizeContext()`); `normalizePricing` stays importable from `src/storage`.

- [ ] **Step 1: Replace `normalizeData`**

```ts
export function normalizeData(input: Partial<AtlasData>, ctx: NormalizeContext = defaultNormalizeContext()): AtlasData {
  // Upgrade the raw shape through the named migration steps first, then coerce.
  const data = migrate(input as Record<string, unknown>).data as Partial<AtlasData>
  const rawBoards = records(data.boards)
  const library = normalizeWoodLibrary(data.woods, ctx)
  const fallbackSpeciesId = library[0]?.id ?? 'walnut'
  // Milling allowances are shop-wide: seed from the saved global, else a legacy board's own.
  const allowances = normalizeAllowances((data.allowances ?? rawBoards[0]?.['allowances']) as (BuildAllowances & { drumSanding?: number }) | undefined)
  const boards = rawBoards.map(raw => normalizeBoard(raw, { allowances, fallbackSpeciesId }, ctx))
  // Composites read the boards list and may append boards migrated from legacy inline panels.
  const migratedBoards: BoardProject[] = []
  const composites = records(data.composites).map(raw => normalizeComposite(raw, { boardSink: migratedBoards, allowances, boards }, ctx))
  const furniture = records(data.furniture)
    .map(raw => normalizeFurnitureProject(raw, { createId: ctx.createId, now: ctx.now, fallbackSpeciesId }))
    .filter((project): project is FurnitureProject => project !== null)
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    allowances,
    pricing: normalizePricing(data.pricing),
    composites,
    woods: [...library, ...placeholderWoods(rawBoards, library, ctx)],
    shops: records(data.shops).map(shop => normalizeShop(shop, ctx)),
    boards: [...boards, ...migratedBoards],
    furniture,
  }
}
```

Behavior note: `updatedAt` fallbacks inside one `normalizeData` call now share one timestamp instead of differing by microseconds. Nothing reads them as distinct.

- [ ] **Step 2: Delete the moved code and fix imports**

Delete from `storage.ts`: `normalizeShop`, `normalizeBlockedZone`, `normalizeComposite`, `normalizeCut`, `normalizeWafers`, `normalizeRows`, `normalizeCell`, `normalizeEndGrain`, `normalizeAllowances`, `normalizePricing`, `normalizeWood`, `records`, `isRecord`, `stringValue`, `finiteNumber`, `signedFinite`, `nonNegativeFinite`, `validColor`. Keep `importData`, `collectImportWarnings`, `collectUnknownKeys`, the `*_KEYS` sets, load and save, the pre-import snapshot, onboarding, sketch storage (`normalizeSketch` keeps using the coercers through the new import), and `downloadData`.

New imports at the top of `storage.ts`:

```ts
import type { AtlasData, BoardProject, BuildAllowances } from './types'
import { defaultSpecies, starterData } from './data'
import { LATEST_SCHEMA_VERSION, migrate } from './domain/migrations'
import { normalizeFurnitureProject } from './domain/furniture/project'
import type { FurnitureProject } from './domain/furniture/types'
import type { Sketch, SketchMember, SketchPoint } from './domain/geometry2d'
import { normalizeBoard } from './normalize/boards'
import { finiteNumber, isRecord, records, signedFinite, stringValue } from './normalize/coerce'
import { normalizeComposite } from './normalize/composites'
import { defaultNormalizeContext } from './normalize/context'
import type { NormalizeContext } from './normalize/context'
import { normalizeAllowances, normalizePricing } from './normalize/settings'
import { normalizeShop } from './normalize/shops'
import { normalizeWoodLibrary, placeholderWoods } from './normalize/woods'

export { normalizePricing }
```

Trim the coerce import to what `normalizeSketch` and `importData` actually use; `pnpm lint` reports unused ones.

- [ ] **Step 3: Run the full unit suite, typecheck, lint, and coverage**

Run: `pnpm typecheck && pnpm lint && pnpm test:coverage`
Expected: every existing test passes unchanged (1,445 before this PR, plus the new ones); coverage thresholds pass. A failing existing test means a behavior change: fix the move, never the test.

- [ ] **Step 4: Run e2e and the production smoke**

Run: `pnpm test:e2e && pnpm test:e2e:prod`
Expected: PASS (desktop and tablet).

- [ ] **Step 5: Commit, push, and open PR 1**

```bash
git add src/storage.ts
git commit -m "refactor(storage): compose normalizeData from per-domain normalizers"
git push -u origin refactor/ai-000-normalize
gh pr create --base develop --title "refactor: AI-000 PR 1, split normalizers per domain" --body "Implements PR 1 of docs/plans/2026-10-18-ai-000-foundation-refactor.md: storage.ts normalizers move to src/normalize/ (shared coercers, one module per domain, ids and time from a context). normalizeData stays the one funnel with the same order and behavior. No behavior change; existing tests pass unchanged."
```

Wait for CI and review. Merge before starting PR 2.

---

## PR 2: Workspace actions and board editing

Branch: `git switch develop && git pull --ff-only && git switch -c refactor/ai-000-workspace-actions`

### Task 7: Workspace actions per collection

**Files:**
- Create: `src/domain/workspace/boards.ts`, `composites.ts`, `furniture.ts`, `shops.ts`, `woods.ts`, `settings.ts`
- Test: `tests/workspaceBoards.test.ts`, `tests/workspaceComposites.test.ts`, `tests/workspaceFurniture.test.ts`, `tests/workspaceShops.test.ts`, `tests/workspaceWoods.test.ts`, `tests/workspaceSettings.test.ts`

**Interfaces:**
- Consumes: `WorkspaceContext`, `Created` (Task 1); `fixedContext` (Task 1).
- Produces:
  - boards: `newBoard(ctx, options: { construction: 'edge' | 'end'; name: string; allowances: BuildAllowances }): BoardProject`; `createBoard(data, ctx): Created`; `createPanelBoard(data, construction: 'edge' | 'end', ctx): Created`; `updateBoard(data, board: BoardProject, ctx): AtlasData`; `deleteBoard(data, id: string): AtlasData`
  - composites: `makeComposite(data, boardId: string, ctx): Created | null`; `updateComposite(data, composite: CompositeBoard, ctx): AtlasData`
  - furniture: `createFurniture(data, request: { templateId?: string; values: Record<string, number> }, ctx): Created`; `duplicateFurniture(data, id: string, ctx): Created | null`; `updateFurniture(data, project: FurnitureProject, ctx): AtlasData`; `deleteFurniture(data, id: string): AtlasData`
  - shops: `createShop(data, ctx): Created`; `updateShop(data, shop: ShopProject, ctx): AtlasData`; `deleteShop(data, id: string): AtlasData`
  - woods: `addWood(data, ctx): Created`; `updateWood(data, id: string, patch: Partial<WoodSpecies>): AtlasData`; `deleteWood(data, id: string): AtlasData`; `type WoodDeleteBlocker = 'in-use' | 'last-wood'`; `woodDeleteBlocker(data, id: string): WoodDeleteBlocker | null`
  - settings: `updateAllowances(data, patch: Partial<BuildAllowances>): AtlasData`; `updatePricing(data, patch: Partial<PricingSettings>): AtlasData`

- [ ] **Step 1: Write the failing tests**

`tests/workspaceBoards.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { starterData } from '../src/data'
import { createBoard, createPanelBoard, deleteBoard, newBoard, updateBoard } from '../src/domain/workspace/boards'
import { FIXED_NOW, fixedContext } from './fixtures/context'

describe('board actions', () => {
  it('newBoard is the single default board', () => {
    const board = newBoard(fixedContext(), { construction: 'edge', name: 'X', allowances: starterData.allowances })
    expect(board).toMatchObject({ id: 'id-1', name: 'X', length: 450, thickness: 38, construction: 'edge', strips: [], updatedAt: FIXED_NOW })
    expect(board.endGrain).toMatchObject({ rowFlips: [], rowRotations: [], rowOffsets: [], rowOrder: [] })
    expect(board.allowances).toEqual(starterData.allowances)
    expect(board.allowances).not.toBe(starterData.allowances)
  })

  it('createBoard appends an end-grain board and returns its id', () => {
    const { data, id } = createBoard(starterData, fixedContext())
    expect(data.boards.at(-1)).toMatchObject({ id, name: 'Untitled cutting board', construction: 'end' })
    expect(data.boards).toHaveLength(starterData.boards.length + 1)
  })

  it('createPanelBoard inherits the requested construction', () => {
    const { data, id } = createPanelBoard(starterData, 'edge', fixedContext())
    expect(data.boards.find(board => board.id === id)).toMatchObject({ name: 'Untitled panel', construction: 'edge' })
  })

  it('updateBoard replaces by id and stamps updatedAt', () => {
    const board = { ...starterData.boards[0]!, name: 'Renamed', updatedAt: 'old' }
    const next = updateBoard(starterData, board, fixedContext())
    expect(next.boards[0]).toMatchObject({ name: 'Renamed', updatedAt: FIXED_NOW })
  })

  it('deleteBoard removes by id only', () => {
    const id = starterData.boards[0]!.id
    expect(deleteBoard(starterData, id).boards.some(board => board.id === id)).toBe(false)
    expect(deleteBoard(starterData, 'missing').boards).toEqual(starterData.boards)
  })
})
```

`tests/workspaceComposites.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_KERF_MM, starterData } from '../src/data'
import { makeComposite, updateComposite } from '../src/domain/workspace/composites'
import { FIXED_NOW, fixedContext } from './fixtures/context'

describe('composite actions', () => {
  it('makeComposite wraps one board in a single-panel composite of the same construction', () => {
    const board = starterData.boards[0]!
    const result = makeComposite(starterData, board.id, fixedContext())!
    const composite = result.data.composites.find(c => c.id === result.id)!
    expect(composite).toMatchObject({ name: `${board.name} composite`, construction: board.construction, updatedAt: FIXED_NOW })
    expect(composite.panels).toEqual([{ id: expect.any(String), boardId: board.id, cut: { axis: 'x', stripWidthMm: 25, kerfMm: DEFAULT_KERF_MM, count: 4 } }])
    expect(composite.rows).toEqual([{ id: expect.any(String), wafers: [] }])
  })

  it('makeComposite returns null for an unknown board', () => {
    expect(makeComposite(starterData, 'missing', fixedContext())).toBeNull()
  })

  it('updateComposite stamps updatedAt', () => {
    const { data, id } = makeComposite(starterData, starterData.boards[0]!.id, fixedContext())!
    const composite = { ...data.composites.find(c => c.id === id)!, name: 'Y' }
    expect(updateComposite(data, composite, fixedContext('2027-01-01T00:00:00.000Z')).composites.find(c => c.id === id)).toMatchObject({ name: 'Y', updatedAt: '2027-01-01T00:00:00.000Z' })
  })
})
```

`tests/workspaceFurniture.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { starterData } from '../src/data'
import { FURNITURE_TEMPLATES } from '../src/domain/furniture/templates'
import { createFurniture, deleteFurniture, duplicateFurniture, updateFurniture } from '../src/domain/workspace/furniture'
import { FIXED_NOW, fixedContext } from './fixtures/context'

describe('furniture actions', () => {
  it('createFurniture with no template makes an empty project', () => {
    const { data, id } = createFurniture(starterData, { values: {} }, fixedContext())
    expect(data.furniture.find(p => p.id === id)).toMatchObject({ name: 'Untitled furniture', updatedAt: FIXED_NOW, parts: [] })
  })

  it('createFurniture from a template remaps species missing from the library', () => {
    const template = FURNITURE_TEMPLATES[0]!
    const data = { ...starterData, woods: [starterData.woods[0]!] }
    const result = createFurniture(data, { templateId: template.id, values: {} }, fixedContext())
    const project = result.data.furniture.find(p => p.id === result.id)!
    expect(project.parts.length).toBeGreaterThan(0)
    expect(project.parts.every(part => part.speciesId === undefined || part.speciesId === data.woods[0]!.id)).toBe(true)
  })

  it('duplicateFurniture keeps internal ids and adds " copy"', () => {
    const created = createFurniture(starterData, { templateId: FURNITURE_TEMPLATES[0]!.id, values: {} }, fixedContext())
    const copy = duplicateFurniture(created.data, created.id, fixedContext())!
    const source = created.data.furniture.find(p => p.id === created.id)!
    const duplicate = copy.data.furniture.find(p => p.id === copy.id)!
    expect(duplicate.name).toBe(`${source.name} copy`)
    expect(duplicate.parts.map(part => part.id)).toEqual(source.parts.map(part => part.id))
    expect(duplicate.parts).not.toBe(source.parts)
    expect(duplicateFurniture(created.data, 'missing', fixedContext())).toBeNull()
  })

  it('updateFurniture stamps updatedAt and deleteFurniture removes by id', () => {
    const { data, id } = createFurniture(starterData, { values: {} }, fixedContext())
    const project = { ...data.furniture.find(p => p.id === id)!, name: 'Z' }
    const updated = updateFurniture(data, project, fixedContext('2027-01-01T00:00:00.000Z'))
    expect(updated.furniture.find(p => p.id === id)).toMatchObject({ name: 'Z', updatedAt: '2027-01-01T00:00:00.000Z' })
    expect(deleteFurniture(updated, id).furniture.some(p => p.id === id)).toBe(false)
  })
})
```

`tests/workspaceShops.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { starterData } from '../src/data'
import { createShop, deleteShop, updateShop } from '../src/domain/workspace/shops'
import { FIXED_NOW, fixedContext } from './fixtures/context'

describe('shop actions', () => {
  it('createShop appends the default workshop', () => {
    const { data, id } = createShop(starterData, fixedContext())
    expect(data.shops.find(shop => shop.id === id)).toEqual({ id, name: 'Untitled workshop', width: 6000, depth: 6000, gridSize: 300, blockedZones: [], items: [], updatedAt: FIXED_NOW })
  })

  it('updateShop stamps updatedAt; deleteShop removes by id', () => {
    const shop = { ...starterData.shops[0]!, name: 'Garage', updatedAt: 'old' }
    const updated = updateShop(starterData, shop, fixedContext())
    expect(updated.shops[0]).toMatchObject({ name: 'Garage', updatedAt: FIXED_NOW })
    expect(deleteShop(updated, shop.id).shops.some(s => s.id === shop.id)).toBe(false)
  })
})
```

`tests/workspaceWoods.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { starterData } from '../src/data'
import { addWood, deleteWood, updateWood, woodDeleteBlocker } from '../src/domain/workspace/woods'
import { fixedContext } from './fixtures/context'

describe('wood actions', () => {
  it('addWood appends a custom wood', () => {
    const { data, id } = addWood(starterData, fixedContext())
    expect(data.woods.at(-1)).toEqual({ id, name: 'Custom wood', color: '#8c6a48', accent: '#b18a5e', pricePerBoardFoot: 8 })
  })

  it('updateWood never changes the id', () => {
    const id = starterData.woods[0]!.id
    expect(updateWood(starterData, id, { id: 'hijack', name: 'N' }).woods[0]).toMatchObject({ id, name: 'N' })
  })

  it('woodDeleteBlocker checks in-use before last-wood, as the UI did', () => {
    const used = starterData.boards[0]!.strips[0]!.speciesId
    expect(woodDeleteBlocker(starterData, used)).toBe('in-use')
    const lone = { ...starterData, boards: [], woods: [starterData.woods[0]!] }
    expect(woodDeleteBlocker(lone, lone.woods[0]!.id)).toBe('last-wood')
    const unused = addWood(starterData, fixedContext())
    expect(woodDeleteBlocker(unused.data, unused.id)).toBeNull()
    expect(deleteWood(unused.data, unused.id).woods.some(w => w.id === unused.id)).toBe(false)
  })
})
```

`tests/workspaceSettings.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { starterData } from '../src/data'
import { updateAllowances, updatePricing } from '../src/domain/workspace/settings'

describe('settings actions', () => {
  it('updateAllowances writes the shop-wide setup through to every board', () => {
    const next = updateAllowances(starterData, { planing: 2.5 })
    expect(next.allowances.planing).toBe(2.5)
    expect(next.boards.every(board => board.allowances.planing === 2.5)).toBe(true)
  })

  it('updatePricing patches only the global block', () => {
    const next = updatePricing(starterData, { laborRatePerHour: 99 })
    expect(next.pricing.laborRatePerHour).toBe(99)
    expect(next.boards).toBe(starterData.boards)
  })
})
```

These tests rely on `starterData` (`src/data.ts:30`) having at least one shop and one board whose first strip uses `walnut`; it does today.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test tests/workspace`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/domain/workspace/boards.ts`:

```ts
import { DEFAULT_END_GRAIN } from '../../data'
import type { AtlasData, BoardProject, BuildAllowances } from '../../types'
import type { Created, WorkspaceContext } from './context'

export function newBoard(ctx: WorkspaceContext, options: { construction: 'edge' | 'end'; name: string; allowances: BuildAllowances }): BoardProject {
  return {
    id: ctx.createId(), name: options.name, length: 450, thickness: 38, construction: options.construction, strips: [], updatedAt: ctx.now,
    endGrain: { ...DEFAULT_END_GRAIN, rowFlips: [], rowRotations: [], rowOffsets: [], rowOrder: [] },
    allowances: { ...options.allowances },
  }
}

function appendBoard(data: AtlasData, board: BoardProject): Created {
  return { data: { ...data, boards: [...data.boards, board] }, id: board.id }
}

export function createBoard(data: AtlasData, ctx: WorkspaceContext): Created {
  return appendBoard(data, newBoard(ctx, { construction: 'end', name: 'Untitled cutting board', allowances: data.allowances }))
}

// A composite is one construction throughout, so its inline panel board inherits it.
export function createPanelBoard(data: AtlasData, construction: 'edge' | 'end', ctx: WorkspaceContext): Created {
  return appendBoard(data, newBoard(ctx, { construction, name: 'Untitled panel', allowances: data.allowances }))
}

export function updateBoard(data: AtlasData, board: BoardProject, ctx: WorkspaceContext): AtlasData {
  return { ...data, boards: data.boards.map(p => p.id === board.id ? { ...board, updatedAt: ctx.now } : p) }
}

export function deleteBoard(data: AtlasData, id: string): AtlasData {
  return { ...data, boards: data.boards.filter(p => p.id !== id) }
}
```

`src/domain/workspace/composites.ts`:

```ts
import { DEFAULT_KERF_MM } from '../../data'
import type { AtlasData, CompositeBoard } from '../../types'
import type { Created, WorkspaceContext } from './context'

export function makeComposite(data: AtlasData, boardId: string, ctx: WorkspaceContext): Created | null {
  const board = data.boards.find(b => b.id === boardId)
  if (!board) return null
  const composite: CompositeBoard = {
    id: ctx.createId(), name: `${board.name} composite`,
    construction: board.construction,
    panels: [{ id: ctx.createId(), boardId: board.id, cut: { axis: 'x', stripWidthMm: 25, kerfMm: DEFAULT_KERF_MM, count: 4 } }],
    rows: [{ id: ctx.createId(), wafers: [] }], updatedAt: ctx.now,
  }
  return { data: { ...data, composites: [...data.composites, composite] }, id: composite.id }
}

export function updateComposite(data: AtlasData, composite: CompositeBoard, ctx: WorkspaceContext): AtlasData {
  return { ...data, composites: data.composites.map(p => p.id === composite.id ? { ...composite, updatedAt: ctx.now } : p) }
}
```

`src/domain/workspace/furniture.ts`:

```ts
import { emptyFurnitureProject, remapMissingSpecies } from '../furniture/project'
import { templateById } from '../furniture/templates'
import type { FurnitureProject } from '../furniture/types'
import type { AtlasData } from '../../types'
import type { Created, WorkspaceContext } from './context'

export interface NewFurnitureOptions {
  templateId?: string
  values: Record<string, number>
}

export function createFurniture(data: AtlasData, request: NewFurnitureOptions, ctx: WorkspaceContext): Created {
  const template = request.templateId ? templateById(request.templateId) : undefined
  const project = template
    ? remapMissingSpecies(template.create(request.values, ctx.createId(), ctx.now), data.woods.map(wood => wood.id))
    : emptyFurnitureProject(ctx.createId(), 'Untitled furniture', ctx.now)
  return { data: { ...data, furniture: [...data.furniture, project] }, id: project.id }
}

// Part, joint, and relationship ids are project-scoped, so a copy keeps them and stays valid.
export function duplicateFurniture(data: AtlasData, id: string, ctx: WorkspaceContext): Created | null {
  const source = data.furniture.find(p => p.id === id)
  if (!source) return null
  const copy: FurnitureProject = { ...structuredClone(source), id: ctx.createId(), name: `${source.name} copy`, updatedAt: ctx.now }
  return { data: { ...data, furniture: [...data.furniture, copy] }, id: copy.id }
}

export function updateFurniture(data: AtlasData, project: FurnitureProject, ctx: WorkspaceContext): AtlasData {
  return { ...data, furniture: data.furniture.map(p => p.id === project.id ? { ...project, updatedAt: ctx.now } : p) }
}

export function deleteFurniture(data: AtlasData, id: string): AtlasData {
  return { ...data, furniture: data.furniture.filter(p => p.id !== id) }
}
```

`src/domain/workspace/shops.ts`:

```ts
import type { AtlasData, ShopProject } from '../../types'
import type { Created, WorkspaceContext } from './context'

export function createShop(data: AtlasData, ctx: WorkspaceContext): Created {
  const shop: ShopProject = { id: ctx.createId(), name: 'Untitled workshop', width: 6000, depth: 6000, gridSize: 300, blockedZones: [], items: [], updatedAt: ctx.now }
  return { data: { ...data, shops: [...data.shops, shop] }, id: shop.id }
}

export function updateShop(data: AtlasData, shop: ShopProject, ctx: WorkspaceContext): AtlasData {
  return { ...data, shops: data.shops.map(p => p.id === shop.id ? { ...shop, updatedAt: ctx.now } : p) }
}

export function deleteShop(data: AtlasData, id: string): AtlasData {
  return { ...data, shops: data.shops.filter(p => p.id !== id) }
}
```

`src/domain/workspace/woods.ts`:

```ts
import type { AtlasData, WoodSpecies } from '../../types'
import type { Created, WorkspaceContext } from './context'

export type WoodDeleteBlocker = 'in-use' | 'last-wood'

export function addWood(data: AtlasData, ctx: WorkspaceContext): Created {
  const wood: WoodSpecies = { id: ctx.createId(), name: 'Custom wood', color: '#8c6a48', accent: '#b18a5e', pricePerBoardFoot: 8 }
  return { data: { ...data, woods: [...data.woods, wood] }, id: wood.id }
}

export function updateWood(data: AtlasData, id: string, patch: Partial<WoodSpecies>): AtlasData {
  return { ...data, woods: data.woods.map(wood => wood.id === id ? { ...wood, ...patch, id: wood.id } : wood) }
}

/** Why a wood cannot be deleted, checked in the order the UI reports them. */
export function woodDeleteBlocker(data: AtlasData, id: string): WoodDeleteBlocker | null {
  if (data.boards.some(board => board.strips.some(strip => strip.speciesId === id))) return 'in-use'
  if (data.woods.length === 1) return 'last-wood'
  return null
}

export function deleteWood(data: AtlasData, id: string): AtlasData {
  return { ...data, woods: data.woods.filter(wood => wood.id !== id) }
}
```

`src/domain/workspace/settings.ts`:

```ts
import type { AtlasData, BuildAllowances, PricingSettings } from '../../types'

// Allowances are shop-wide; boards carry a copy because the domain reads board.allowances.
export function updateAllowances(data: AtlasData, patch: Partial<BuildAllowances>): AtlasData {
  const allowances = { ...data.allowances, ...patch }
  return { ...data, allowances, boards: data.boards.map(board => ({ ...board, allowances })) }
}

export function updatePricing(data: AtlasData, patch: Partial<PricingSettings>): AtlasData {
  return { ...data, pricing: { ...data.pricing, ...patch } }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test tests/workspace && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/workspace tests/workspace*.test.ts
git commit -m "feat(domain): pure workspace actions per collection"
```

### Task 8: Board editing operations

**Files:**
- Create: `src/domain/boardEditing.ts`
- Test: `tests/boardEditing.test.ts`

**Interfaces:**
- Consumes: `WorkspaceContext` (Task 1); existing `clampTransforms` (`src/domain/boardSlices.ts:32`), `calculateEndGrainMetrics` (`src/domain/boardGeometry.ts`).
- Produces (each returns a new `BoardProject` and does not stamp `updatedAt`; `updateBoard` stamps): `addStrip(project, speciesId: string, ctx: Pick<WorkspaceContext, 'createId'>)`, `updateStrip(project, id: string, patch: Partial<BoardStrip>)`, `deleteStrip(project, id: string)`, `reorderStrips(project, orderedIds: readonly string[])`, `duplicatePattern(project, ctx: Pick<WorkspaceContext, 'createId'>)`, `mirrorPattern(project, ctx: Pick<WorkspaceContext, 'createId'>)`, `reverseStrips(project)`, `updateEndGrain(project, patch: Partial<EndGrainSettings>)`, `setRowPattern(project, pattern: RowPattern)`, `cycleSliceRow(project, index: number)`; `type RowPattern = 'same' | 'rotate' | 'flip' | 'invert'`.

- [ ] **Step 1: Write the failing test**

`tests/boardEditing.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { starterData } from '../src/data'
import { calculateEndGrainMetrics } from '../src/domain/boardGeometry'
import { addStrip, cycleSliceRow, deleteStrip, duplicatePattern, mirrorPattern, reorderStrips, reverseStrips, setRowPattern, updateEndGrain, updateStrip } from '../src/domain/boardEditing'
import type { BoardProject } from '../src/types'
import { fixedContext } from './fixtures/context'

const base = (): BoardProject => ({
  ...starterData.boards[0]!,
  construction: 'end',
  strips: [
    { id: 'a', speciesId: 'walnut', width: 30, trailingAngle: 0 },
    { id: 'b', speciesId: 'maple', width: 40, trailingAngle: -15 },
  ],
})

describe('strip edits', () => {
  it('addStrip appends a 38 mm square strip', () => {
    expect(addStrip(base(), 'cherry', fixedContext()).strips.at(-1)).toEqual({ id: 'id-1', speciesId: 'cherry', width: 38, trailingAngle: 0 })
  })

  it('updateStrip patches one strip, deleteStrip removes one', () => {
    expect(updateStrip(base(), 'b', { width: 12 }).strips[1]).toMatchObject({ id: 'b', width: 12, trailingAngle: -15 })
    expect(deleteStrip(base(), 'a').strips.map(s => s.id)).toEqual(['b'])
  })

  it('reorderStrips follows the given ids and drops unknown ones', () => {
    expect(reorderStrips(base(), ['b', 'zzz', 'a']).strips.map(s => s.id)).toEqual(['b', 'a'])
  })

  it('duplicate and mirror append fresh-id copies; reverse flips order', () => {
    expect(duplicatePattern(base(), fixedContext()).strips.map(s => s.id)).toEqual(['a', 'b', 'id-1', 'id-2'])
    const mirrored = mirrorPattern(base(), fixedContext()).strips
    expect(mirrored.map(s => s.speciesId)).toEqual(['walnut', 'maple', 'maple', 'walnut'])
    expect(mirrored[2]?.trailingAngle).toBe(-15)
    expect(reverseStrips(base()).strips.map(s => s.id)).toEqual(['b', 'a'])
  })
})

describe('end-grain edits', () => {
  it('updateEndGrain clamps slice transforms to the new slice count', () => {
    const wide = updateEndGrain(base(), { rowFlips: Array.from({ length: 40 }, () => true) })
    const count = calculateEndGrainMetrics(wide).sliceCount
    expect(wide.endGrain.rowFlips.length).toBeLessThanOrEqual(count)
    const thicker = updateEndGrain(wide, { sliceThickness: wide.endGrain.sliceThickness * 3 })
    expect(thicker.endGrain.rowFlips.length).toBeLessThanOrEqual(calculateEndGrainMetrics(thicker).sliceCount)
    const back = updateEndGrain(thicker, { sliceThickness: wide.endGrain.sliceThickness })
    expect(back.endGrain.rowFlips.length).toBeLessThanOrEqual(calculateEndGrainMetrics(thicker).sliceCount)
  })

  it('setRowPattern flip flips every other slice and clears offsets', () => {
    const project = setRowPattern({ ...base(), endGrain: { ...base().endGrain, rowOffsets: [0.5] } }, 'flip')
    const count = calculateEndGrainMetrics(project).sliceCount
    expect(project.endGrain.rowFlips.slice(0, Math.min(count, 4))).toEqual([false, true, false, true].slice(0, Math.min(count, 4)))
    expect(project.endGrain.rowOffsets).toEqual([])
  })

  it('cycleSliceRow steps none → rotate → flip → both → none', () => {
    let project = base()
    const states: Array<[boolean, boolean]> = []
    for (let i = 0; i < 4; i += 1) {
      project = cycleSliceRow(project, 0)
      states.push([project.endGrain.rowRotations[0] ?? false, project.endGrain.rowFlips[0] ?? false])
    }
    expect(states).toEqual([[true, false], [false, true], [true, true], [false, false]])
  })
})
```

If `starterData.boards[0]` produces `sliceCount < 2`, give `base()` an `endGrain` with `sourceLength: 900` and `sliceThickness: 45` so it has several slices.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test tests/boardEditing.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/domain/boardEditing.ts`:

```ts
import type { BoardProject, BoardStrip, EndGrainSettings } from '../types'
import { calculateEndGrainMetrics } from './boardGeometry'
import { clampTransforms } from './boardSlices'
import type { WorkspaceContext } from './workspace/context'

type Ids = Pick<WorkspaceContext, 'createId'>
export type RowPattern = 'same' | 'rotate' | 'flip' | 'invert'

const withStrips = (project: BoardProject, strips: BoardStrip[]): BoardProject => ({ ...project, strips })

export function addStrip(project: BoardProject, speciesId: string, ctx: Ids): BoardProject {
  return withStrips(project, [...project.strips, { id: ctx.createId(), speciesId, width: 38, trailingAngle: 0 }])
}

export function updateStrip(project: BoardProject, id: string, patch: Partial<BoardStrip>): BoardProject {
  return withStrips(project, project.strips.map(strip => strip.id === id ? { ...strip, ...patch } : strip))
}

export function deleteStrip(project: BoardProject, id: string): BoardProject {
  return withStrips(project, project.strips.filter(strip => strip.id !== id))
}

export function reorderStrips(project: BoardProject, orderedIds: readonly string[]): BoardProject {
  return withStrips(project, orderedIds.map(id => project.strips.find(strip => strip.id === id)).filter((strip): strip is BoardStrip => !!strip))
}

export function duplicatePattern(project: BoardProject, ctx: Ids): BoardProject {
  return withStrips(project, [...project.strips, ...project.strips.map(strip => ({ ...strip, id: ctx.createId() }))])
}

export function mirrorPattern(project: BoardProject, ctx: Ids): BoardProject {
  return withStrips(project, [...project.strips, ...[...project.strips].reverse().map(strip => ({ ...strip, id: ctx.createId() }))])
}

export function reverseStrips(project: BoardProject): BoardProject {
  return withStrips(project, [...project.strips].reverse())
}

// Clamp per-slice transforms to the new count so stale ones cannot return when it grows back.
export function updateEndGrain(project: BoardProject, patch: Partial<EndGrainSettings>): BoardProject {
  const settings = { ...project.endGrain, ...patch }
  const count = calculateEndGrainMetrics({ ...project, endGrain: settings }).sliceCount
  return { ...project, endGrain: { ...settings, ...clampTransforms(settings, count) } }
}

function sliceFlags(project: BoardProject): { flips: boolean[]; rotations: boolean[] } {
  const count = calculateEndGrainMetrics(project).sliceCount
  return {
    flips: Array.from({ length: count }, (_, index) => project.endGrain.rowFlips[index] ?? false),
    rotations: Array.from({ length: count }, (_, index) => project.endGrain.rowRotations[index] ?? false),
  }
}

export function setRowPattern(project: BoardProject, pattern: RowPattern): BoardProject {
  const { flips, rotations } = sliceFlags(project)
  return updateEndGrain(project, {
    rowFlips: flips.map((flipped, index) => pattern === 'flip' ? index % 2 === 1 : pattern === 'invert' ? !flipped : false),
    rowRotations: rotations.map((rotated, index) => pattern === 'rotate' ? index % 2 === 1 : pattern === 'invert' ? !rotated : false),
    rowOffsets: [],
  })
}

export function cycleSliceRow(project: BoardProject, index: number): BoardProject {
  const { flips, rotations } = sliceFlags(project)
  const next = ((rotations[index] ? 1 : 0) + (flips[index] ? 2 : 0) + 1) % 4
  rotations[index] = next === 1 || next === 3
  flips[index] = next === 2 || next === 3
  return updateEndGrain(project, { rowFlips: flips, rowRotations: rotations })
}
```

Before relying on it, confirm `BoardDesigner.tsx:44`'s `end` is `calculateEndGrainMetrics(project)` for the same project (it is: `const end = calculateEndGrainMetrics(project)`), so `sliceFlags` uses the same count the component used.

- [ ] **Step 4: Run tests**

Run: `pnpm test tests/boardEditing.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/boardEditing.ts tests/boardEditing.test.ts
git commit -m "feat(domain): board strip and end-grain edit operations"
```

### Task 9: Wire the UI to the actions

**Files:**
- Modify: `src/App.tsx:159-294` (handlers)
- Modify: `src/components/BoardDesigner.tsx:92-142` (edit wiring)
- Modify: `src/components/ShopPlanner.tsx:65`, `src/components/useShopDrag.ts:87,95` (drop component `updatedAt` stamps)

**Interfaces:**
- Consumes: Tasks 7 and 8.

- [ ] **Step 1: Confirm every board and shop edit already stamps `updatedAt`**

Run: `grep -n "onChange(" src/components/BoardDesigner.tsx src/components/ShopPlanner.tsx src/components/useShopDrag.ts`
Expected: only `BoardDesigner.tsx:92` (`update`), `ShopPlanner.tsx:65` (`update`), and `useShopDrag.ts:87` and `:95`, each passing `updatedAt: new Date().toISOString()`. If any other `onChange(` call skips the stamp, stop: moving the stamp into the action would change behavior for that path. Record it in `TODO.md` under "AI-000" and keep that component stamp in place.

- [ ] **Step 2: Replace the `App.tsx` handlers**

Add near the other imports:

```ts
import { createBoard as createBoardAction, createPanelBoard, deleteBoard as deleteBoardAction, updateBoard as updateBoardAction } from './domain/workspace/boards'
import { makeComposite as makeCompositeAction, updateComposite as updateCompositeAction } from './domain/workspace/composites'
import { createFurniture as createFurnitureAction, deleteFurniture as deleteFurnitureAction, duplicateFurniture as duplicateFurnitureAction, updateFurniture as updateFurnitureAction } from './domain/workspace/furniture'
import { createShop as createShopAction, deleteShop as deleteShopAction, updateShop as updateShopAction } from './domain/workspace/shops'
import { addWood as addWoodAction, deleteWood as deleteWoodAction, updateWood as updateWoodAction, woodDeleteBlocker } from './domain/workspace/woods'
import { updateAllowances as updateAllowancesAction, updatePricing as updatePricingAction } from './domain/workspace/settings'
import type { Created, WorkspaceContext } from './domain/workspace/context'
```

Remove the now-unused imports: `DEFAULT_END_GRAIN`, `DEFAULT_KERF_MM`, `emptyFurnitureProject`, `remapMissingSpecies`, `templateById`.

Inside `App`, after `commitData`:

```ts
  const ctx = (): WorkspaceContext => ({ createId, now: new Date().toISOString() })
  // Creating actions report what they made so the caller can open it.
  const commitCreated = (result: Created | null): string | undefined => {
    if (!result) return undefined
    commitData(() => result.data)
    return result.id
  }
```

Then replace each handler body, keeping every handler's name, prompts, and selection updates:

```ts
  const updateShop = (project: ShopProject) => commitData(current => updateShopAction(current, project, ctx()))
  const updateBoard = (project: BoardProject) => commitData(current => updateBoardAction(current, project, ctx()))
  const addWood = () => { commitCreated(addWoodAction(dataRef.current, ctx())) }
  const updateWood = (id: string, patch: Partial<WoodSpecies>) => commitData(current => updateWoodAction(current, id, patch))
  const updateAllowances = (patch: Partial<BuildAllowances>) => commitData(current => updateAllowancesAction(current, patch))
  const updatePricing = (patch: Partial<AtlasData['pricing']>) => commitData(current => updatePricingAction(current, patch))
  const deleteWood = (id: string) => {
    const wood = data.woods.find(candidate => candidate.id === id)
    if (!wood) return
    const blocker = woodDeleteBlocker(data, id)
    if (blocker === 'in-use') { window.alert(`${wood.name} is used by a cutting board and cannot be deleted.`); return }
    if (blocker === 'last-wood') { window.alert('Keep at least one wood in the library.'); return }
    if (window.confirm(`Delete ${wood.name} from the wood library?`)) commitData(current => deleteWoodAction(current, id))
  }
  const deleteShop = (id: string) => {
    const project = data.shops.find(p => p.id === id)
    if (!project || !window.confirm(`Delete workshop "${project.name}"?`)) return
    const remaining = data.shops.filter(p => p.id !== id)
    commitData(current => deleteShopAction(current, id))
    if (activeShop === id) setActiveShop(remaining[0]?.id ?? '')
  }
  const deleteBoard = (id: string) => {
    const project = data.boards.find(p => p.id === id)
    if (!project || !window.confirm(`Delete board "${project.name}"?`)) return
    const remaining = data.boards.filter(p => p.id !== id)
    commitData(current => deleteBoardAction(current, id))
    if (activeBoard === id) setActiveBoard(remaining[0]?.id ?? '')
  }
  const createShop = () => {
    const id = commitCreated(createShopAction(dataRef.current, ctx()))
    if (id) { setActiveShop(id); setView('shop') }
  }
  const createBoard = () => {
    const id = commitCreated(createBoardAction(dataRef.current, ctx()))
    if (id) { setActiveBoard(id); setView('boards'); setBoardBackTo('gallery'); setBoardsMode('board') }
  }
  const createFurniture = (request: NewFurnitureRequest) => {
    const id = commitCreated(createFurnitureAction(dataRef.current, request, ctx()))
    if (id) openFurniture(id)
  }
  const duplicateFurniture = (id: string) => { commitCreated(duplicateFurnitureAction(dataRef.current, id, ctx())) }
  const updateFurniture = (project: FurnitureProject) => commitData(current => updateFurnitureAction(current, project, ctx()))
  const deleteFurniture = (id: string) => {
    const project = data.furniture.find(p => p.id === id)
    if (!project || !window.confirm(`Delete furniture "${project.name}"?`)) return
    commitData(current => deleteFurnitureAction(current, id))
    if (activeFurniture === id) { setActiveFurniture(''); setFurnitureMode('gallery') }
  }
  const updateComposite = (project: CompositeBoard) => commitData(current => updateCompositeAction(current, project, ctx()))
  const createBoardForPanel = (construction: 'edge' | 'end'): string => commitCreated(createPanelBoard(dataRef.current, construction, ctx())) ?? ''
  const makeComposite = (board: BoardProject) => {
    const id = commitCreated(makeCompositeAction(dataRef.current, board.id, ctx()))
    if (id) { setActiveComposite(id); setBoardsMode('composite') }
  }
```

Keep the existing furniture comment ("The designer's updatedAt and new ids come from here...") as a one-liner above `ctx`: `// The domain never reads the clock or random ids; this is where they come from.` Delete the old one. `NewFurnitureRequest` is structurally assignable to `NewFurnitureOptions`.

- [ ] **Step 3: Wire `BoardDesigner.tsx`**

Add `import * as edit from '../domain/boardEditing'`. Replace lines 92-117 and 125-142:

```ts
  const update = (patch: Partial<BoardProject>) => onChange({ ...project, ...patch })
  const updateEnd = (patch: Partial<EndGrainSettings>) => onChange(edit.updateEndGrain(project, patch))
  const updateStrip = (id: string, patch: Partial<BoardStrip>) => onChange(edit.updateStrip(project, id, patch))
```

```ts
  const ids = { createId }
  const addStrip = (speciesId = woods[0]?.id ?? 'walnut') => onChange(edit.addStrip(project, speciesId, ids))
  const duplicatePattern = () => onChange(edit.duplicatePattern(project, ids))
  const mirrorPattern = () => onChange(edit.mirrorPattern(project, ids))
  const reverseStrips = () => onChange(edit.reverseStrips(project))
  const reorderStrips = (orderedIds: string[]) => onChange(edit.reorderStrips(project, orderedIds))
  const deleteStrip = (id: string) => onChange(edit.deleteStrip(project, id))
```

```ts
  const setRowPattern = (pattern: edit.RowPattern) => onChange(edit.setRowPattern(project, pattern))
  const reorderSlices = (order: number[]) => updateEnd(applySliceOrder(project.endGrain, end.sliceCount, order))
  const cycleRow = (index: number) => onChange(edit.cycleSliceRow(project, index))
```

Keep `alternateArrangement`, `gradientArrangement`, `randomizeArrangement`, and `applyPattern` as they are; they already call domain helpers through `update`. Remove `clampTransforms` from the `boardSlices` import if it is now unused (lint reports it).

- [ ] **Step 4: Drop the shop component stamps**

`ShopPlanner.tsx:65`: `const update = (patch: Partial<ShopProject>) => project && onChange({ ...project, ...patch })`
`useShopDrag.ts:87` and `:95`: delete `, updatedAt: new Date().toISOString()` from each `onChange({...})` object.

- [ ] **Step 5: Run everything**

Run: `pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm test:e2e && pnpm test:e2e:prod`
Expected: PASS. A failing existing unit or e2e test means a behavior change: fix the wiring, never the test.

- [ ] **Step 6: Commit, push, and open PR 2**

```bash
git add src/App.tsx src/components/BoardDesigner.tsx src/components/ShopPlanner.tsx src/components/useShopDrag.ts
git commit -m "refactor(app): route workspace and board edits through domain actions"
git push -u origin refactor/ai-000-workspace-actions
gh pr create --base develop --title "refactor: AI-000 PR 2, pure workspace actions and board edits" --body "Implements PR 2 of docs/plans/2026-10-18-ai-000-foundation-refactor.md: every workspace change in App.tsx and the board strip and end-grain edits in BoardDesigner.tsx become pure, tested domain functions (src/domain/workspace/, src/domain/boardEditing.ts). The UI calls them through commitData. updatedAt is stamped in the update actions instead of the components. No behavior change."
```

Wait for CI and review. Merge before starting PR 3.

---

## PR 3: Navigation reducer

Branch: `git switch develop && git pull --ff-only && git switch -c refactor/ai-000-navigation`

### Task 10: Navigation reducer

**Files:**
- Create: `src/navigation.ts`
- Test: `tests/navigation.test.ts`
- Modify: `vite.config.ts:95` (coverage include), `tsconfig.test.json:9` (include)

**Interfaces:**
- Produces: `NavState`, `NavAction`, `BoardsMode`, `FurnitureMode`, `HistoryNavState`, `initialNav(data: Pick<AtlasData, 'shops' | 'boards'>): NavState`, `navigate(state: NavState, action: NavAction): NavState`, `toHistoryState(nav: NavState): HistoryNavState`.

- [ ] **Step 1: Write the failing test**

`tests/navigation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { initialNav, navigate, toHistoryState } from '../src/navigation'
import type { NavState } from '../src/navigation'

const start = (): NavState => initialNav({ shops: [{ id: 's1' }, { id: 's2' }], boards: [{ id: 'b1' }, { id: 'b2' }] } as never)

describe('initialNav', () => {
  it('opens home with the first shop and board selected', () => {
    expect(start()).toEqual({
      view: 'home', activeShop: 's1', activeBoard: 'b1', activeComposite: '', boardsMode: 'gallery', boardBackTo: 'gallery',
      activeFurniture: '', furnitureMode: 'gallery', furnitureFocus: undefined, furnitureOpens: 0,
    })
  })
})

describe('navigate', () => {
  it('openBoard selects and opens without changing view; boardBack returns to where it came from', () => {
    const opened = navigate(start(), { type: 'openBoard', id: 'b2' })
    expect(opened).toMatchObject({ view: 'home', activeBoard: 'b2', boardsMode: 'board', boardBackTo: 'gallery' })
    const fromPanel = navigate(navigate(start(), { type: 'openComposite', id: 'c1' }), { type: 'editPanelBoard', id: 'b2' })
    expect(fromPanel).toMatchObject({ activeComposite: 'c1', activeBoard: 'b2', boardsMode: 'board', boardBackTo: 'composite' })
    expect(navigate(fromPanel, { type: 'boardBack' }).boardsMode).toBe('composite')
    expect(navigate(fromPanel, { type: 'compositeBack' }).boardsMode).toBe('gallery')
  })

  it('browseBoards and browseFurniture reset to the galleries', () => {
    const deep = navigate(navigate(start(), { type: 'openBoard', id: 'b2' }), { type: 'openFurniture', id: 'f1' })
    expect(navigate(deep, { type: 'browseBoards' })).toMatchObject({ view: 'boards', boardsMode: 'gallery' })
    expect(navigate(deep, { type: 'browseFurniture' })).toMatchObject({ view: 'furniture', furnitureMode: 'gallery' })
  })

  it('openFurniture sets focus and counts opens so the designer remounts', () => {
    const once = navigate(start(), { type: 'openFurniture', id: 'f1', focusId: 'leg' })
    expect(once).toMatchObject({ activeFurniture: 'f1', furnitureFocus: 'leg', furnitureOpens: 1, furnitureMode: 'designer' })
    expect(navigate(once, { type: 'openFurniture', id: 'f1' })).toMatchObject({ furnitureFocus: undefined, furnitureOpens: 2 })
    expect(navigate(once, { type: 'furnitureBack' }).furnitureMode).toBe('gallery')
  })

  it('openShop selects and shows the shop; goTo only changes view', () => {
    expect(navigate(start(), { type: 'openShop', id: 's2' })).toMatchObject({ view: 'shop', activeShop: 's2' })
    expect(navigate(start(), { type: 'goTo', view: 'woods' })).toEqual({ ...start(), view: 'woods' })
  })

  it('projectRemoved falls back only when the open project was removed', () => {
    expect(navigate(start(), { type: 'projectRemoved', kind: 'board', id: 'b1', remainingIds: ['b2'] }).activeBoard).toBe('b2')
    expect(navigate(start(), { type: 'projectRemoved', kind: 'board', id: 'b2', remainingIds: ['b1'] }).activeBoard).toBe('b1')
    expect(navigate(start(), { type: 'projectRemoved', kind: 'shop', id: 's1', remainingIds: [] }).activeShop).toBe('')
    const designing = navigate(start(), { type: 'openFurniture', id: 'f1' })
    expect(navigate(designing, { type: 'projectRemoved', kind: 'furniture', id: 'f1', remainingIds: [] })).toMatchObject({ activeFurniture: '', furnitureMode: 'gallery' })
    expect(navigate(designing, { type: 'projectRemoved', kind: 'furniture', id: 'f2', remainingIds: ['f1'] })).toBe(designing)
  })

  it('restoreSelection restores shop and board only (undo); backupImported also goes home', () => {
    const moved = navigate(navigate(start(), { type: 'openFurniture', id: 'f1' }), { type: 'goTo', view: 'furniture' })
    expect(navigate(moved, { type: 'restoreSelection', activeShop: 's2', activeBoard: 'b2' })).toEqual({ ...moved, activeShop: 's2', activeBoard: 'b2' })
    expect(navigate(moved, { type: 'backupImported', activeShop: 's9', activeBoard: 'b9' })).toMatchObject({
      view: 'home', activeShop: 's9', activeBoard: 'b9', activeFurniture: '', furnitureMode: 'gallery',
    })
  })

  it('round-trips through browser history state', () => {
    const deep = navigate(navigate(navigate(start(), { type: 'goTo', view: 'boards' }), { type: 'openComposite', id: 'c1' }), { type: 'editPanelBoard', id: 'b2' })
    const saved = toHistoryState(deep)
    expect(saved).toEqual({ view: 'boards', boardsMode: 'board', activeBoard: 'b2', activeComposite: 'c1', furnitureMode: 'gallery', activeFurniture: '' })
    const restored = navigate(start(), { type: 'restoreFromHistory', state: saved })
    expect(toHistoryState(restored)).toEqual(saved)
  })

  it('restoreFromHistory with no state returns to home galleries and keeps selections', () => {
    const opened = navigate(start(), { type: 'openBoard', id: 'b2' })
    expect(navigate(opened, { type: 'restoreFromHistory', state: null })).toMatchObject({ view: 'home', boardsMode: 'gallery', furnitureMode: 'gallery', activeBoard: 'b2' })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test tests/navigation.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/navigation.ts`:

```ts
import type { AtlasData, View } from './types'

export type BoardsMode = 'gallery' | 'board' | 'composite'
export type FurnitureMode = 'gallery' | 'designer'

export interface NavState {
  view: View
  activeShop: string
  activeBoard: string
  activeComposite: string
  boardsMode: BoardsMode
  boardBackTo: 'gallery' | 'composite'
  activeFurniture: string
  furnitureMode: FurnitureMode
  /** Part to select when the designer opens from a warning. */
  furnitureFocus: string | undefined
  /** Counts opens so the designer remounts (and re-selects its focus) each time. */
  furnitureOpens: number
}

export type NavAction =
  | { type: 'goTo'; view: View }
  | { type: 'browseBoards' }
  | { type: 'browseFurniture' }
  | { type: 'openShop'; id: string }
  | { type: 'selectShop'; id: string }
  | { type: 'selectBoard'; id: string }
  | { type: 'openBoard'; id: string }
  | { type: 'editPanelBoard'; id: string }
  | { type: 'openComposite'; id: string }
  | { type: 'boardBack' }
  | { type: 'compositeBack' }
  | { type: 'openFurniture'; id: string; focusId?: string | undefined }
  | { type: 'furnitureBack' }
  | { type: 'projectRemoved'; kind: 'shop' | 'board' | 'furniture'; id: string; remainingIds: readonly string[] }
  | { type: 'restoreSelection'; activeShop: string; activeBoard: string }
  | { type: 'backupImported'; activeShop: string; activeBoard: string }
  | { type: 'restoreFromHistory'; state: unknown }

/** The fields mirrored into browser history; this shape must not change (Back depends on it). */
export interface HistoryNavState {
  view: View
  boardsMode: BoardsMode
  activeBoard: string
  activeComposite: string
  furnitureMode: FurnitureMode
  activeFurniture: string
}

export function initialNav(data: Pick<AtlasData, 'shops' | 'boards'>): NavState {
  return {
    view: 'home', activeShop: data.shops[0]?.id ?? '', activeBoard: data.boards[0]?.id ?? '', activeComposite: '',
    boardsMode: 'gallery', boardBackTo: 'gallery', activeFurniture: '', furnitureMode: 'gallery', furnitureFocus: undefined, furnitureOpens: 0,
  }
}

export function toHistoryState(nav: NavState): HistoryNavState {
  return { view: nav.view, boardsMode: nav.boardsMode, activeBoard: nav.activeBoard, activeComposite: nav.activeComposite, furnitureMode: nav.furnitureMode, activeFurniture: nav.activeFurniture }
}

export function navigate(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case 'goTo': return { ...state, view: action.view }
    case 'browseBoards': return { ...state, view: 'boards', boardsMode: 'gallery' }
    case 'browseFurniture': return { ...state, view: 'furniture', furnitureMode: 'gallery' }
    case 'openShop': return { ...state, activeShop: action.id, view: 'shop' }
    case 'selectShop': return { ...state, activeShop: action.id }
    case 'selectBoard': return { ...state, activeBoard: action.id }
    case 'openBoard': return { ...state, activeBoard: action.id, boardBackTo: 'gallery', boardsMode: 'board' }
    case 'editPanelBoard': return { ...state, activeBoard: action.id, boardBackTo: 'composite', boardsMode: 'board' }
    case 'openComposite': return { ...state, activeComposite: action.id, boardsMode: 'composite' }
    case 'boardBack': return { ...state, boardsMode: state.boardBackTo }
    case 'compositeBack': return { ...state, boardsMode: 'gallery' }
    case 'openFurniture': return { ...state, activeFurniture: action.id, furnitureFocus: action.focusId, furnitureOpens: state.furnitureOpens + 1, furnitureMode: 'designer' }
    case 'furnitureBack': return { ...state, furnitureMode: 'gallery' }
    case 'projectRemoved': return removed(state, action)
    case 'restoreSelection': return { ...state, activeShop: action.activeShop, activeBoard: action.activeBoard }
    case 'backupImported': return { ...state, activeShop: action.activeShop, activeBoard: action.activeBoard, activeFurniture: '', furnitureMode: 'gallery', view: 'home' }
    case 'restoreFromHistory': return fromHistory(state, action.state)
  }
}

function removed(state: NavState, action: Extract<NavAction, { type: 'projectRemoved' }>): NavState {
  const fallback = action.remainingIds[0] ?? ''
  if (action.kind === 'shop') return state.activeShop === action.id ? { ...state, activeShop: fallback } : state
  if (action.kind === 'board') return state.activeBoard === action.id ? { ...state, activeBoard: fallback } : state
  return state.activeFurniture === action.id ? { ...state, activeFurniture: '', furnitureMode: 'gallery' } : state
}

// Mirrors the previous popstate handler: missing modes reset, missing ids keep the current selection.
function fromHistory(state: NavState, raw: unknown): NavState {
  const saved = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<HistoryNavState>
  return {
    ...state,
    view: saved.view ?? 'home',
    boardsMode: saved.boardsMode ?? 'gallery',
    activeBoard: typeof saved.activeBoard === 'string' ? saved.activeBoard : state.activeBoard,
    activeComposite: typeof saved.activeComposite === 'string' ? saved.activeComposite : state.activeComposite,
    furnitureMode: saved.furnitureMode ?? 'gallery',
    activeFurniture: typeof saved.activeFurniture === 'string' ? saved.activeFurniture : state.activeFurniture,
  }
}
```

`vite.config.ts:95`: add `'src/navigation.ts'` to the coverage include. `tsconfig.test.json:9`: add `"src/navigation.ts"` to `include`.

- [ ] **Step 4: Run tests**

Run: `pnpm test tests/navigation.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/navigation.ts tests/navigation.test.ts vite.config.ts tsconfig.test.json
git commit -m "feat: navigation reducer with history serialization"
```

### Task 11: History hook and `App.tsx` wiring

**Files:**
- Create: `src/useNavigationHistory.ts`
- Modify: `src/App.tsx` (state at `:46-57`, history effects at `:134-157`, every setter call)

**Interfaces:**
- Consumes: Task 10.
- Produces: `useNavigationHistory(nav: NavState, dispatch: (action: NavAction) => void): void`.

- [ ] **Step 1: Create the hook**

`src/useNavigationHistory.ts` (the two effects from `App.tsx:134-157`, behavior unchanged):

```ts
import { useEffect, useRef } from 'react'
import { toHistoryState } from './navigation'
import type { NavAction, NavState } from './navigation'

// Mirrors screen changes into browser history so Back moves between screens instead of leaving the app.
export function useNavigationHistory(nav: NavState, dispatch: (action: NavAction) => void): void {
  const flags = useRef({ skip: false, first: true })
  const { view, boardsMode, activeBoard, activeComposite, furnitureMode, activeFurniture } = nav
  useEffect(() => {
    const state = toHistoryState(nav)
    if (flags.current.skip) { flags.current.skip = false; return }
    if (flags.current.first) { flags.current.first = false; window.history.replaceState(state, ''); return }
    window.history.pushState(state, '')
    // Only the mirrored fields drive history; nav itself changes on every focus or open count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, boardsMode, activeBoard, activeComposite, furnitureMode, activeFurniture])
  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      flags.current.skip = true
      dispatch({ type: 'restoreFromHistory', state: event.state })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [dispatch])
}
```

- [ ] **Step 2: Replace the navigation state in `App.tsx`**

Replace `App.tsx:46-57` (the `view` through `furnitureOpens` states, keeping `sidebarOpen` and the rest) with:

```ts
  const [nav, dispatch] = useReducer(navigate, data, initialNav)
  const { view, activeShop, activeBoard, activeComposite, boardsMode, activeFurniture, furnitureMode, furnitureFocus, furnitureOpens } = nav
  useNavigationHistory(nav, dispatch)
```

Add `useReducer` to the React import, `import { initialNav, navigate } from './navigation'`, and `import { useNavigationHistory } from './useNavigationHistory'`. Delete the two history effects (`App.tsx:134-157`) and `navRef`.

- [ ] **Step 3: Replace every setter call**

| Today | Becomes |
| --- | --- |
| `setView(x)` alone | `dispatch({ type: 'goTo', view: x })` |
| `setView('boards'); setBoardsMode('gallery')` (nav button) | `dispatch({ type: 'browseBoards' })` |
| `setView('furniture'); setFurnitureMode('gallery')` (nav button), `setFurnitureMode('gallery'); setView('furniture')` (Dashboard) | `dispatch({ type: 'browseFurniture' })` |
| `setActiveShop(id); setView('shop')` | `dispatch({ type: 'openShop', id })` |
| `onSelect={setActiveShop}` (ShopPlanner) | `onSelect={id => dispatch({ type: 'selectShop', id })}` |
| `onSelect={setActiveBoard}` (BoardDesigner) | `onSelect={id => dispatch({ type: 'selectBoard', id })}` |
| `openBoard(id)` | `const openBoard = (id: string) => dispatch({ type: 'openBoard', id })` |
| `openComposite(id)` | `const openComposite = (id: string) => dispatch({ type: 'openComposite', id })` |
| `editPanelBoard(id)` | `const editPanelBoard = (id: string) => dispatch({ type: 'editPanelBoard', id })` |
| `openFurniture(id, focusId?)` | `const openFurniture = (id: string, focusId?: string) => dispatch({ type: 'openFurniture', id, focusId })` |
| `onBack={() => setBoardsMode(boardBackTo)}` | `onBack={() => dispatch({ type: 'boardBack' })}` |
| composite `onBack={() => setBoardsMode('gallery')}` | `onBack={() => dispatch({ type: 'compositeBack' })}` |
| furniture `onBack={() => setFurnitureMode('gallery')}` | `onBack={() => dispatch({ type: 'furnitureBack' })}` |
| `createShop`: `setActiveShop(id); setView('shop')` | `dispatch({ type: 'openShop', id })` |
| `createBoard`: `setActiveBoard(id); setView('boards'); setBoardBackTo('gallery'); setBoardsMode('board')` | `dispatch({ type: 'openBoard', id }); dispatch({ type: 'goTo', view: 'boards' })` |
| `makeComposite`: `setActiveComposite(id); setBoardsMode('composite')` | `dispatch({ type: 'openComposite', id })` |
| `deleteShop`: `if (activeShop === id) setActiveShop(remaining[0]?.id ?? '')` | `dispatch({ type: 'projectRemoved', kind: 'shop', id, remainingIds: remaining.map(p => p.id) })` |
| `deleteBoard`: same pattern | `dispatch({ type: 'projectRemoved', kind: 'board', id, remainingIds: remaining.map(p => p.id) })` |
| `deleteFurniture`: `if (activeFurniture === id) { setActiveFurniture(''); setFurnitureMode('gallery') }` | `dispatch({ type: 'projectRemoved', kind: 'furniture', id, remainingIds: [] })` |
| `importFile` success: five setters | `dispatch({ type: 'backupImported', activeShop: result.data.shops[0]?.id ?? '', activeBoard: result.data.boards[0]?.id ?? '' })` |
| `restorePreImport`: `setActiveShop(...)`, `setActiveBoard(...)` | `dispatch({ type: 'restoreSelection', activeShop: preImport.shops[0]?.id ?? '', activeBoard: preImport.boards[0]?.id ?? '' })` |
| `applyHistory`: `setActiveShop(...)`, `setActiveBoard(...)` | `dispatch({ type: 'restoreSelection', activeShop: result.restored.activeShop, activeBoard: result.restored.activeBoard })` |
| `goToWarning` shop branch: `setActiveShop(id); setView('shop')` | `dispatch({ type: 'openShop', id: location.targetId })` |

`commitData` and the undo snapshot keep reading `activeShop` and `activeBoard` (now from `nav`), so the `Snapshot` type does not change.

- [ ] **Step 4: Confirm no setter is left**

Run: `grep -nE "set(View|ActiveShop|ActiveBoard|ActiveComposite|BoardsMode|BoardBackTo|ActiveFurniture|FurnitureMode|FurnitureFocus|FurnitureOpens)\(" src/App.tsx`
Expected: no output.

- [ ] **Step 5: Run everything**

Run: `pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm test:e2e && pnpm test:e2e:prod`
Expected: PASS, including the existing back-button, composite, furniture, and undo e2e specs.

- [ ] **Step 6: Mark AI-000 done in the roadmap**

In `docs/plans/AI_ASSISTANT_ROADMAP.md`, change the AI-000 row's status to `🟢 Complete` and its Plan cell to `[plan](2026-10-18-ai-000-foundation-refactor.md)`. In `docs/plans/PRODUCT_PLAN.md`, move the AI-000 row to `docs/plans/COMPLETED.md` under a new "AI Design Assistant" table, matching that file's format.

- [ ] **Step 7: Commit, push, and open PR 3**

```bash
git add src/useNavigationHistory.ts src/App.tsx docs/plans/AI_ASSISTANT_ROADMAP.md docs/plans/PRODUCT_PLAN.md docs/plans/COMPLETED.md
git commit -m "refactor(app): navigation through one reducer and a history hook"
git push -u origin refactor/ai-000-navigation
gh pr create --base develop --title "refactor: AI-000 PR 3, navigation reducer" --body "Implements PR 3 of docs/plans/2026-10-18-ai-000-foundation-refactor.md: the ten navigation useStates in App.tsx become one reducer (src/navigation.ts) with named actions, and the pushState/popstate sync moves to useNavigationHistory. The browser history state shape and undo selection are unchanged. Completes AI-000."
```
