# BOARD-023: Rip & stock list — Design

Date: 2026-06-28
Plan item: `BOARD-023` (rip and stock requirement calculator). First slice of the
calculator/reference suite; `BOARD-024` (angle/setup calculator) and `BOARD-025`
(printable setup cards) layer on top later.

## Problem

The board designer shows finished dimensions, board-feet by species (wood usage), and a
cut plan, but it never answers the two questions a woodworker actually asks at the lumber
rack and the table saw:

1. **How much do I buy?** — purchased board-feet per species, including waste.
2. **What do I set the rip fence to?** — the rough rip width for each distinct strip, and
   how many of each.

Those numbers already exist inside the domain (`calculateBuildDimensions.stripRoughWidths`,
`roughStripStockWidth`, `calculateWoodUsage`), but they are scattered and not surfaced as
one bench-usable reference with explicit assumptions and units.

## Goals (this slice)

- A **pure aggregator** that bundles the existing computations into a single structured
  "stock requirements" report. No new geometry.
- A **"Rip & stock list" card** in the board designer, inside the printable build-sheet
  region, that reads in the active unit (metric / Preston's imperial).
- An explicit **assumptions** footnote (kerf, rip/width-trim, length-trim, slice
  thickness, surfacing) so the numbers are auditable.

## Non-goals (later slices / other items)

- Angle ↔ setup conversions (`BOARD-024`).
- Standalone printable setup cards beyond inclusion in the existing build sheet (`BOARD-025`).
- Stock inventory, 1D optimizer, offcuts, cost reconciliation (`CUT-003/008/009/013/014`).
- Suggesting *which* purchased board lengths/widths to buy — we report board-feet and rip
  widths, not a purchasing optimizer.

## Current domain inputs (reused as-is)

- `calculateBuildDimensions(project, metrics): BuildDimensions` — `stripRoughWidths[]`
  (finished width + rip allowance, with width-trim split across the outer strips),
  `roughBoardFeet`, `finishedBoardFeet`.
- `roughStripStockWidth(project, stripRoughWidth, trailingAngle)` — adds the angle-induced
  width for end-grain; returns `stripRoughWidth` unchanged for edge-grain.
- `calculateWoodUsage(project, woods, metrics): WoodUsage[]` — per species
  `requiredBoardFeet` (purchased, incl. waste), `usedBoardFeet`, `wasteBoardFeet`.
- `resolveAllowances(project): BuildAllowances` and `project.endGrain` — the assumptions.

## Design

### Domain — `src/domain/boardStock.ts` (pure, tested)

```ts
export interface RipGroup {
  speciesId: string
  speciesName: string
  color: string
  finishedWidthMm: number
  trailingAngle: number
  roughRipWidthMm: number   // fence setting for the rough rip
  count: number             // how many identical strips
}

export interface SpeciesStock {
  speciesId: string
  name: string
  color: string
  purchasedBoardFeet: number  // = WoodUsage.requiredBoardFeet (incl. waste)
  finishedBoardFeet: number   // = WoodUsage.usedBoardFeet
  wasteBoardFeet: number      // = WoodUsage.wasteBoardFeet
}

export interface StockAssumptions {
  construction: 'edge' | 'end'
  kerfMm: number              // end-grain only (crosscut blade); 0 for edge
  ripAllowanceMm: number
  widthTrimMm: number
  lengthTrimMm: number
  surfacingMm: number         // jointing + planing + routerTable
  sliceThicknessMm?: number   // end-grain only
}

export interface StockRequirements {
  ripGroups: RipGroup[]       // sorted by species then finished width
  species: SpeciesStock[]
  assumptions: StockAssumptions
  totalPurchasedBoardFeet: number
}

export function calculateStockRequirements(
  project: BoardProject,
  woods: readonly WoodSpecies[],
  build: BuildDimensions,
  metrics: EndGrainMetrics,
): StockRequirements
```

Behavior:
- **Rip groups:** for each strip `i`, compute
  `roughRipWidthMm = roughStripStockWidth(project, build.stripRoughWidths[i], strip.trailingAngle)`.
  Group strips by `(speciesId, finishedWidthMm, trailingAngle, roughRipWidthMm)` and count.
  Resolve `speciesName`/`color` from `woods` (fallback to the id and a neutral color when a
  strip references an unknown wood, mirroring how the rest of the app degrades). Sort by
  species name then finished width.
- **Species stock:** map `calculateWoodUsage(project, woods, metrics)` straight through to
  `SpeciesStock`. `totalPurchasedBoardFeet` = sum of `purchasedBoardFeet`.
- **Assumptions:** from `resolveAllowances(project)` and `project.endGrain`. `kerfMm` and
  `sliceThicknessMm` are populated only for end-grain (omit slice thickness for edge).
- Millimeters at full precision; rounding happens only in the UI.

### UI — `StockRequirementsCard` in `BoardDesigner`

- Rendered in `.board-canvas-area` (the printed region), after `CutPlanView`, so it prints
  on the build sheet.
- Sections:
  - **Rip list:** one row per `RipGroup` — `Rip to {roughRipWidth} × {count}` with the
    species swatch + name and, for angled strips, the trailing angle.
  - **Buy:** one row per `SpeciesStock` — purchased board-feet (with finished + waste as a
    secondary line), then the total.
  - **Assumptions:** a compact footnote listing kerf / rip / width-trim / length-trim /
    surfacing (+ slice thickness for end-grain), each with units.
- All measurements via `formatLength` / `formatNumber` so the card honors Preston's imperial
  toggle. New CSS lives beside the existing `.cut-plan`/`.wood-usage` styles.

## Testing

- **Unit (`tests/boardStock.test.ts`):**
  - edge-grain: rough rip width = finished + rip allowance (width-trim on the outer strips);
    identical strips group with the right count.
  - end-grain: rough rip width includes the angle-induced shift (> the edge-grain value for
    a non-zero trailing angle).
  - species stock mirrors `calculateWoodUsage`; `totalPurchasedBoardFeet` sums them.
  - assumptions: kerf + slice thickness present for end-grain, absent/zero for edge-grain.
  - unknown wood id degrades to the id + neutral color rather than throwing.
- **e2e (`board.spec.ts`):** the seed board shows a "Rip & stock list" card with a rip row
  and a per-species buy figure.
- Domain module is under the coverage gate — keep it green.

## Files

- Create: `src/domain/boardStock.ts`, `tests/boardStock.test.ts`.
- Modify: `src/components/BoardDesigner.tsx` (compute via memo + render the card),
  `src/styles.css` (card styles), `e2e/board.spec.ts` (render assertion).

## Risks

- Double-counting vs the existing wood-usage card: this card is the *bench reference*
  (rip widths + buy totals + assumptions); the existing "stock by species" panel stays in
  the editor sidebar. They show related numbers from the same source, which is intentional
  (sidebar = live edit; card = printable reference). If it reads redundant in review, fold
  the sidebar usage into this card in a follow-up rather than now.
