# BOARD-024: Angle & setup calculator — Design

Date: 2026-06-28
Plan item: `BOARD-024` (angle and setup calculator). Second slice of the calculator suite;
follows `BOARD-023` (rip & stock list) and precedes `BOARD-025` (printable setup cards).

## Problem

End-grain strips carry a **trailing angle** (the angled crosscut face that makes chevrons,
herringbone, mirrored bevels). The designer lets you set the angle per strip, but it never
tells you the **shop numbers** that angle implies:

- what bevel/miter to set on the saw,
- how much **wider** the rough rip must be to contain the angled face,
- the **offset** the angle introduces between a strip's two faces (the run across the
  thickness),
- the **wedge of waste** trimmed when the angled panel is squared.

These all derive from the same `thickness · tan(angle)` relation the board generator
already uses (`boardGeometry`'s `rightWidth = width + thickness·tan(angle)` / `faceShift`,
`boardAllowances`' angle shift, and the `sideTrim` wedge). BOARD-024 surfaces them as a
calculator/reference tied to those same assumptions.

## Goals (this slice)

- A **pure converter** (`calculateAngleSetup`) that, from a trailing angle + stock
  thickness + strip length, returns the saw angle, effective width gain, angle offset, and
  wedge loss — using the identical `tan` math as board generation.
- An **inverse helper** (`angleForOffset`) so a target offset maps back to an angle.
- An **"Angle & setup"** reference card in the board designer — one row per distinct angled
  strip — shown only for end-grain boards that have at least one non-zero angle. Honors the
  unit toggle.

## Non-goals (later / other items)

- Printable consolidated setup cards (`BOARD-025`).
- Editing the angle from this card (it reads the existing per-strip trailing angle in the
  strip list; this is a reference, not a second editor).
- New saw-method modeling (blade tilt vs miter gauge specifics) — we report the angle
  magnitude; how it's dialed in is the user's saw.

## Domain — `src/domain/boardAngle.ts` (pure, tested)

```ts
export interface AngleSetup {
  trailingAngleDeg: number       // input, clamped to +/-89
  sawAngleDeg: number            // |trailingAngleDeg| — the bevel/miter magnitude to set
  angleOffsetMm: number          // signed faceShift for one strip = thickness * tan(angle)
  effectiveWidthGainMm: number   // |angleOffsetMm| — extra rough rip width the angle needs
  wedgeCrossSectionMm2: number   // 0.5 * |angleOffsetMm| * thickness (triangular offcut)
  wedgeBoardFeet: number         // toBoardFeet(crossSection * stripLength)
}

export function calculateAngleSetup(input: {
  trailingAngleDeg: number
  stockThicknessMm: number
  stripLengthMm: number
}): AngleSetup

// Inverse: the trailing angle (deg, clamped) that yields a given face offset across a
// thickness. atan(offset / thickness). Returns 0 when thickness <= 0.
export function angleForOffset(offsetMm: number, stockThicknessMm: number): number
```

Behavior:
- `const angle = clampAngle(trailingAngleDeg)`, `offset = thickness * tan(angle·π/180)`.
- `angleOffsetMm = offset` (signed); `effectiveWidthGainMm = Math.abs(offset)`;
  `sawAngleDeg = Math.abs(angle)`.
- `wedgeCrossSectionMm2 = 0.5 * Math.abs(offset) * thickness` — matches `boardGeometry`'s
  `|faceShift|/2 * stockThickness` per unit length.
- `wedgeBoardFeet = toBoardFeet(wedgeCrossSectionMm2 * max(0, stripLength))`.
- At `angle === 0` every derived value is `0`.
- Reuse `clampAngle`, `toBoardFeet` from `./units` so the assumptions never drift from
  board generation.

## UI — `AngleSetupCard` in `BoardDesigner`

- Rendered in the printable `.board-canvas-area`, after the `StockRequirementsCard`.
- Only rendered when `project.construction === 'end'` and some strip has a non-zero
  trailing angle (otherwise omitted entirely — no empty card).
- Inputs come from the live design: `stockThicknessMm = project.endGrain.stockThickness`,
  `stripLengthMm = project.endGrain.sourceLength`.
- Group strips by their (rounded) trailing angle; one row per distinct angle showing:
  saw angle (°), `+width` (effective width gain), offset, and wedge waste (bf), with the
  count of strips at that angle. Measurements via `formatLength`/`formatNumber` (unit-aware).
- A one-line assumption note: based on `{thickness}` stock over `{sourceLength}` length.

## Testing

- **Unit (`tests/boardAngle.test.ts`):**
  - `tan` relation: offset = thickness·tan(angle) (e.g. 30° on 38 mm ≈ 21.94 mm).
  - 0° → all derived values 0.
  - sign: negative trailing angle → negative offset, positive width gain + saw angle.
  - wedge: cross-section = ½·|offset|·thickness; board-feet scales with strip length.
  - `angleForOffset` round-trips with `calculateAngleSetup` (offset → angle → offset).
  - clamps beyond ±89°.
- **e2e (`board.spec.ts`):** an end-grain board with an angled strip shows the "Angle &
  setup" card with a saw-angle row; a square board (no angles) does not.
- Domain module under the coverage gate — keep green.

## Files

- Create: `src/domain/boardAngle.ts`, `tests/boardAngle.test.ts`.
- Modify: `src/components/BoardDesigner.tsx` (render the card from a memo), `src/styles.css`
  (reuse/extend the `.stock-card` styling), `e2e/board.spec.ts`.

## Risks

- Overlap with the per-strip trailing-angle input in the strip list: that input *sets* the
  angle; this card *explains its shop consequences*. Distinct purpose. If it reads
  redundant in review, fold the setup numbers inline into the strip rows in a follow-up.
