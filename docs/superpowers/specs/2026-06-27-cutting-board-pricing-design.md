# Cutting Board Pricing — Design

- Date: 2026-06-27
- Status: approved design, ready for an implementation plan
- Scope: sell-price estimation for single cutting boards **and** composite assemblies

## Problem & goal

Today the cutting board designer shows a **material estimate** only — rough purchased
board-feet × price per board-foot — and the build sheet explicitly disclaims that it
"Excludes glue, finish, and consumables." There is no notion of a sell price: no
markup over material, no labor, no consumables, and no minimum.

The goal is a single **price** for each build, derived from four layers on top of the
existing material estimate:

1. **Material** (already computed; includes milling + waste) plus a configurable
   **markup** (default 30%).
2. **Labor**, from a complexity **tier** (Simple / Standard / Complex) → tier hours ×
   a global hourly rate.
3. **Consumables** (glue, finish, abrasives): a flat base plus a per-board-foot rate.
4. A per-construction **price floor** (default $200 end grain, $100 edge grain) applied
   to the grand total.

This applies to both the `BoardDesigner` (single boards) and the `CompositeSummary`
(composite assemblies).

## Current state (what we build on)

- `WoodSpecies.pricePerBoardFoot` is the only price input.
- `BoardDesigner` computes `estimatedCost` (material) two ways, both already inclusive
  of waste (rough/required board-feet):
  - **end grain:** `Σ woodUsage.requiredBoardFeet × pricePerBoardFoot`
  - **edge grain:** `Σ roughWidth × roughLength × roughThickness / CUBIC_MM_PER_BOARD_FOOT × pricePerBoardFoot`
  and surfaces it as the "Material estimate" stat and on the print build sheet.
- `CompositeSummary` computes `estimatedCost = Σ stock.boardFeet × pricePerBoardFoot`
  via `stockBySpecies(composite, boards)` from `src/domain/compositeBoard.ts`.
- Shop-wide settings already have a precedent: `BuildAllowances` lives globally on
  `AtlasData.allowances`, is edited in the `MillingAllowances` screen, and is reachable
  from the sidebar nav (`view === 'allowances'`).

Pricing reuses the existing material numbers verbatim — no change to how material or
board-feet are computed.

## Pricing formula & order of operations

```
material    = existing material estimate (board-feet × price; already includes waste)
markup      = material × (markupPercent / 100)        // default 30%
labor       = tierHours[tier] × laborRatePerHour
consumables = consumablesBase + consumablesPerBoardFoot × roughBoardFeet
─────────────────────────────────────────────────────────────────
subtotal    = material + markup + labor + consumables
price       = max( floor[construction], subtotal )
```

Decisions (confirmed):

- **Markup applies to material only.** Labor and consumables are added at cost, not
  marked up.
- **The floor is applied last**, to the grand total. When the floor is binding
  (`floor > subtotal`), the difference is shown as an explicit line, never hidden.
- `roughBoardFeet` for consumables is the build's total rough board-feet: `build.roughBoardFeet`
  for a single board, and `Σ stock.boardFeet` for a composite.
- `floor[construction]` uses the board's / composite's `construction` (`'edge' | 'end'`).

## Complexity classification (tiers)

Tier is **derived automatically** from the design — never a stored or manual field.
The hours per tier are configurable; the classification rules are domain logic.

| Tier | Rule |
|------|------|
| **Simple** | Edge grain with no bevels (every strip `trailingAngle === 0`). |
| **Standard** | Plain end grain, **or** edge grain with at least one beveled strip. |
| **Complex** | Composite (always); **or** end grain that has any beveled strip, any per-slice rotation/flip/offset in use, **or** slice count ≥ `COMPLEX_SLICE_THRESHOLD` (default 10). |

- **Composites are always Complex**, regardless of their donor boards.
- "Per-slice variation in use" means any `true` in `rowRotations` / `rowFlips`, or any
  non-zero value in `rowOffsets` (read via the existing slice-state helpers /
  `EndGrainSettings` arrays).
- `COMPLEX_SLICE_THRESHOLD` is a named constant in `pricing.ts` (not user-configurable
  in this version).

## Data model

New types in `src/types.ts`:

```ts
export interface PricingSettings {
  materialMarkupPercent: number        // 30
  laborRatePerHour: number             // 60
  tierHours: { simple: number; standard: number; complex: number } // 0.75 / 1.5 / 3
  consumablesBase: number              // 8
  consumablesPerBoardFoot: number      // 3
  floor: { edge: number; end: number } // 100 / 200
}

export type ComplexityTier = 'simple' | 'standard' | 'complex'

export interface PriceBreakdown {
  tier: ComplexityTier
  laborHours: number
  materialCost: number
  materialMarkup: number
  labor: number
  consumables: number
  subtotal: number          // material + markup + labor + consumables
  floor: number             // the applicable floor for this construction
  floorAdjustment: number   // max(0, floor - subtotal); 0 when not binding
  total: number             // max(subtotal, floor)
}
```

`AtlasData` gains one field:

```ts
export interface AtlasData {
  // ...existing fields...
  pricing: PricingSettings
}
```

Pricing is **global and read at compute time** — unlike `allowances`, it is NOT
written through onto each board (boards never store pricing). This keeps the model
simpler: there is exactly one source of truth.

## Domain module — `src/domain/pricing.ts` (new, pure, unit-tested)

```ts
export const COMPLEX_SLICE_THRESHOLD = 10

// Single board. Reads construction, strips (bevels), endGrain (slice variation),
// and slice count to pick a tier.
export function classifyBoard(project: BoardProject, sliceCount: number): ComplexityTier

// Composites are always 'complex'.
export function classifyComposite(): ComplexityTier  // returns 'complex'

// Pure price math. Given the already-computed material cost and rough board-feet,
// the construction, the tier, and the global settings, return the full breakdown.
export function calculatePrice(input: {
  materialCost: number
  roughBoardFeet: number
  construction: 'edge' | 'end'
  tier: ComplexityTier
  pricing: PricingSettings
}): PriceBreakdown
```

`calculatePrice` is intentionally agnostic about *where* `materialCost` and
`roughBoardFeet` came from, so the single-board and composite call sites both reuse it
with their existing numbers. Rounding stays out of the domain (display-only), per the
repo's mm/float precision policy.

## Persistence & normalization

- `src/data.ts`: add `DEFAULT_PRICING: PricingSettings` and set `starterData.pricing`.
- `src/storage.ts`: add `normalizePricing(saved): PricingSettings`, merging saved values
  over `DEFAULT_PRICING` with the existing `finiteNumber` coercion (non-negative), and
  call it inside `normalizeData` so older backups without a `pricing` block load with
  defaults.
- No `CURRENT_SCHEMA_VERSION` bump required: the change is purely additive and every
  field has a default, matching how `allowances` defaults are already handled.

## App wiring & settings screen

- `src/App.tsx`:
  - thread `data.pricing` to the designer and composite screens,
  - add an `updatePricing(patch: Partial<PricingSettings>)` handler using `commitData`
    (global update; no write-through to boards),
  - add a `'pricing'` value to the `View` type and a sidebar nav item under LIBRARY
    (next to "Milling allowances"), rendering the new settings screen.
- `src/components/PricingSettings.tsx` (new): mirrors `MillingAllowances.tsx` — a
  `module-page` with `NumberField` rows for markup %, hourly rate, the three tier
  hours, consumables base, consumables per-bf, and the two floors. Header eyebrow:
  "SHOP DEFAULTS · APPLIES TO EVERY BOARD".
- `View` is defined in `src/types.ts`; update it there.

## UI — price breakdown

A **Price breakdown** card rendered in both `BoardDesigner` and `CompositeSummary`,
plus a top-line **Price** stat alongside the existing "Material estimate":

```
Price breakdown
  Material (2.5 bf)          $31.25
  Markup (30%)              + $9.38
  Labor — Standard, 1.5 hr  + $90.00
  Consumables (8 + 3×2.5)   + $15.50
  ───────────────────────────────
  Subtotal                  $146.13
  Minimum (end grain)       + $53.87     ← only shown when the floor is binding
  ═══════════════════════════════
  Price                     $200.00
```

- `BoardDesigner`: compute the breakdown in the existing `derived` `useMemo` from
  `estimatedCost`, `build.roughBoardFeet`, `project.construction`, and
  `classifyBoard(project, end.sliceCount)`. Add the breakdown card near the existing
  `board-stats`, add a "Price" `Stat`, and update `BuildSheetHeader` (print sheet).
- `CompositeSummary`: compute from its existing `estimatedCost`, the summed stock
  board-feet, `composite.construction`, and `classifyComposite()`. Add the breakdown
  card to the build sheet.
- Update the stale build-sheet disclaimer. The current line —
  "Estimated from rough purchased board-feet × price per board foot. Excludes glue,
  finish, and consumables." (`BoardDesigner.tsx`) — becomes a description of the full
  price model (material + markup + labor + consumables, with a minimum), and notes that
  estimates still exclude defects/wood movement/final surfacing per the accuracy policy.
- Money is formatted at the display edge (e.g. `value.toFixed(2)`), consistent with the
  current `$${estimatedCost.toFixed(2)}`.

## Defaults

| Setting | Default |
|---------|---------|
| `materialMarkupPercent` | 30 |
| `laborRatePerHour` | 60 |
| `tierHours` | simple 0.75, standard 1.5, complex 3 |
| `consumablesBase` | 8 |
| `consumablesPerBoardFoot` | 3 |
| `floor.end` | 200 |
| `floor.edge` | 100 |
| `COMPLEX_SLICE_THRESHOLD` | 10 (constant, not user-set) |

## Testing — `tests/pricing.test.ts`

`src/domain/pricing.ts` is under the coverage gate (`src/domain/**` at lines 90 /
functions 85 / branches 75 / statements 88), so it must be thoroughly tested:

- **`classifyBoard`**: edge no-bevel → simple; edge with a beveled strip → standard;
  plain end grain → standard; end grain with a beveled strip → complex; end grain with
  per-slice rotation/flip/offset → complex; end grain at/over the slice threshold →
  complex.
- **`classifyComposite`**: always complex.
- **`calculatePrice`**: markup = material × pct; labor = tierHours × rate; consumables =
  base + perBf × bf; subtotal is the sum; floor binding (small board → `total === floor`,
  `floorAdjustment > 0`); floor not binding (`total === subtotal`, `floorAdjustment === 0`);
  end vs edge floor selected by construction.
- **`normalizePricing`**: missing block → all defaults; partial/garbage values coerced
  (non-negative) over defaults; a legacy backup (no `pricing`) round-trips through
  `normalizeData` with defaults.

## Out of scope (this version)

- Per-board price overrides or a manual labor-hours field (tier is fully derived).
- Marking up labor or consumables (markup is material-only).
- Quantity/batch pricing, taxes, shipping, or currency selection (USD, two decimals).
- A user-editable complexity-threshold or custom tier definitions.
- Persisting computed prices (always derived live from the design + global settings).

## Files touched

- `src/types.ts` — `PricingSettings`, `ComplexityTier`, `PriceBreakdown`,
  `AtlasData.pricing`, `View` += `'pricing'`.
- `src/domain/pricing.ts` — **new**: `classifyBoard`, `classifyComposite`,
  `calculatePrice`, `COMPLEX_SLICE_THRESHOLD`.
- `src/data.ts` — `DEFAULT_PRICING`, `starterData.pricing`.
- `src/storage.ts` — `normalizePricing`, wired into `normalizeData`.
- `src/App.tsx` — pricing state/plumbing, `updatePricing`, `'pricing'` nav + view.
- `src/components/PricingSettings.tsx` — **new** settings screen.
- `src/components/BoardDesigner.tsx` — price breakdown card, Price stat, print header,
  disclaimer.
- `src/components/composite/CompositeSummary.tsx` — price breakdown card.
- `tests/pricing.test.ts` — **new** unit tests.
