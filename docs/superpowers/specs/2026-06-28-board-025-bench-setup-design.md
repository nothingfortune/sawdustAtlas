# BOARD-025: Bench setup card — Design

Date: 2026-06-28
Plan item: `BOARD-025` (setup cards and reference outputs). Final slice of the calculator
suite; consolidates `BOARD-023` (rip & stock) and `BOARD-024` (angle & setup) into one
at-a-glance bench reference.

## Problem

The board designer's printable region is thorough (build header, how-it's-built, cut plan,
rip & stock list, angle & setup, assumptions) — but it is *detailed*, not *glanceable*. At
the bench or on a tablet, a maker wants the few numbers they actually dial in: the **rip
fence widths**, the **saw angle(s)**, the **crosscut stop block + how many slices/passes**,
and the **key allowances** — all in one concise card they read first.

All the inputs already exist (`calculateStockRequirements.ripGroups`,
`calculateAngleSetup`, `metrics.sliceCount`/`crosscutCount`, `endGrain.sliceThickness`),
so this is a consolidation + placement task, not new geometry.

## Goals (this slice)

- A pure aggregator `summarizeBenchSetup` that bundles the at-the-saw numbers into one
  structure, reusing the existing calculators.
- A concise, print/tablet-friendly **"Bench setup"** card placed **near the top** of the
  build region (after the quick stats, before the detailed price/plan cards).
- Readable to non-CAD users; honors the unit toggle.

## Non-goals

- Removing or changing the detailed cards (cut plan, `BOARD-023` rip & stock, `BOARD-024`
  angle & setup) — they stay below as the full reference (per the chosen design: concise on
  top, details below).
- A separate print stylesheet / dedicated print route (the card prints with the existing
  build sheet via `window.print()`); deeper print theming is out of scope.
- Shopping/board-feet (`BOARD-023`'s "buy" section) — that's planning, not bench.

## Domain — `src/domain/boardBench.ts` (pure, tested)

```ts
import type { RipGroup, StockAssumptions } from './boardStock'

export interface BenchAngle { trailingAngleDeg: number; sawAngleDeg: number; count: number }
export interface BenchCrosscut { stopBlockMm: number; slices: number; passes: number }

export interface BenchSetup {
  ripGroups: RipGroup[]          // from calculateStockRequirements (rip fence widths + counts)
  angles: BenchAngle[]           // distinct trailing angles -> saw angle + count (end-grain only)
  crosscut: BenchCrosscut | null // end-grain only: stop block = slice thickness, slice + pass counts
  assumptions: StockAssumptions  // reused from calculateStockRequirements
}

export function summarizeBenchSetup(
  project: BoardProject,
  woods: readonly WoodSpecies[],
  build: BuildDimensions,
  metrics: EndGrainMetrics,
): BenchSetup
```

Behavior:
- `const stock = calculateStockRequirements(project, woods, build, metrics)` → take
  `ripGroups` and `assumptions` straight through (single source of truth, no duplication).
- **angles:** for end-grain only, group strips by rounded trailing angle (skip ~0), map each
  to `{ trailingAngleDeg, sawAngleDeg: calculateAngleSetup(...).sawAngleDeg, count }`, sorted
  by angle. Empty for edge-grain or all-square boards.
- **crosscut:** for end-grain only,
  `{ stopBlockMm: endGrain.sliceThickness, slices: metrics.sliceCount, passes: metrics.crosscutCount }`;
  `null` for edge-grain.
- Pure; mm/degrees at full precision; rounding in the UI.

## UI — `BenchSetupCard` in `BoardDesigner`

- Rendered in `.board-canvas-area` **after the `board-stats` block, before `PriceBreakdownCard`**
  (high in the printed/scrolled order so it reads first).
- Always rendered (every board has rip widths). Sections, each omitted when empty:
  - **Rip fence** — each distinct rough rip width × count (compact rows).
  - **Saw angle** — distinct saw angles × count (only when angled).
  - **Crosscut** — `stop block {sliceThickness} · {slices} slices · {passes} passes` (end-grain only).
  - **Allowances** — one concise line (kerf for end-grain, rip, trims).
- Larger, scannable type; uses `formatLength`/`formatNumber` (unit-aware). Distinct styling
  from the dense detail cards (it is the summary).

## Testing

- **Unit (`tests/boardBench.test.ts`):**
  - end-grain angled board: `ripGroups` non-empty; `angles` has the distinct saw angles with
    counts; `crosscut` = `{ stopBlockMm: sliceThickness, slices: sliceCount, passes: crosscutCount }`.
  - edge-grain board: `crosscut` is `null` and `angles` is empty; `ripGroups` still present.
  - `assumptions`/`ripGroups` match `calculateStockRequirements` (delegation, not duplication).
- **e2e (`board.spec.ts`):** the seed board shows a "Bench setup" card with a rip fence row;
  an angled end-grain board additionally shows a saw-angle and a crosscut line.
- Domain under the coverage gate — keep green.

## Files

- Create: `src/domain/boardBench.ts`, `tests/boardBench.test.ts`.
- Modify: `src/components/BoardDesigner.tsx` (memo + render high in the region), `src/styles.css`,
  `e2e/board.spec.ts`.

## Risks

- Visible overlap with the detailed 023/024 cards below. Intentional per the chosen design
  (glance vs detail). If it reads repetitive in review, the follow-up is to collapse the
  detail cards behind a "show details" toggle rather than delete them.
