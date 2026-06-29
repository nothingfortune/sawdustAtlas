# BOARD-026 (3D): Compound-angle leg calculator — Design

Date: 2026-06-29
Plan item: `BOARD-026` follow-up. The geometry tool's free canvas is single-plane; this adds
the **3D** piece the user asked for — a splayed leg that tilts in two planes → the
**compound miter + bevel** to set on the saw.

## Decisions (from brainstorming)

- **Shape:** a **parametric calculator** (form in/results out), not a 3D canvas. Lives as a
  mode in the Geometry tool ("Sketch" ⇄ "Compound leg").
- **Inputs:** the **two splay components** measured off the two elevation drawings —
  front-view tilt `f` and side-view tilt `s`.

## The math (please validate the numbers below)

The leg is modeled as a vertical leg tilted by **front-tilt `f` then side-tilt `s`** (a
rigid rotation `Rx(s)·Ry(f)` applied to the up axis). From that, with the leg lying on its
front face on the saw:

- **Miter (miter-gauge) = `f`**
- **Bevel (blade tilt) = `atan( tan s / cos f )`**
- **Resultant tilt off plumb = `acos( cos f · cos s )`**
- **True length = `rise / cos(resultant)`** (when a vertical rise is given)

Derivation: the floor-flat cut plane has world-up normal `ẑ`; expressed in the leg's local
frame it is `(−sin f·cos s, sin s, cos f·cos s)`, whose tilt toward the two faces gives
`atan(−tan f) = −f` (miter) and `atan(tan s / cos f)` (bevel). All in millimeters/degrees,
full precision; rounding only at display.

**Degenerate guarantees (must hold):**
- side-tilt 0 → miter = `f`, bevel = 0
- front-tilt 0 → miter = 0, bevel = `s`
- both 0 → all zero

**Worked example — `f = 6°`, `s = 4°`, rise 700 mm** (numerically verified):
miter **6.00°**, bevel **4.02°**, resultant **7.21°**, true length **705.6 mm**.

> Reviewer (you): does this convention match how you measure front/side tilt, and do the
> example numbers match a leg you've cut? If your saw setup makes the *side* tilt the miter
> instead, we swap which component is miter vs bevel — that's the one knob to confirm.

## Architecture

### Domain — `src/domain/compoundAngle.ts` (pure, fully tested)

```ts
export interface CompoundLegInput { frontTiltDeg: number; sideTiltDeg: number; riseMm?: number }
export interface CompoundLegResult {
  miterDeg: number          // = frontTilt (clamped)
  bevelDeg: number          // = atan(tan(side)/cos(front))
  resultantTiltDeg: number  // = acos(cos front · cos side)
  trueLengthMm?: number     // = rise / cos(resultant); omitted when no rise
}
export function solveCompoundLeg(input: CompoundLegInput): CompoundLegResult
```
- Tilts clamped to `[0, 85]` (beyond that is non-physical for a leg). Reuses radians helpers;
  `trueLengthMm` only present when `riseMm > 0`.

### UI — a "Compound leg" mode in the Geometry view

- A segmented control in the Geometry header: **Sketch** (the existing canvas) ⇄
  **Compound leg** (this calculator). Local mode state; the sketch is untouched.
- The calculator is a centered form (`CompoundLegCalculator`): **Front-view tilt °**,
  **Side-view tilt °**, **Rise (optional)** inputs → a results list: **Miter**, **Bevel**,
  **Resultant tilt off plumb**, **True length**. Unit-aware for the length (`formatLength`);
  angles in degrees. A one-line note states the convention ("front tilt is the miter; lay
  the leg on its front face").
- Inputs are ephemeral local state (a scratch calculator); persisting the last values is a
  later nicety.

## Testing

- **Unit (`tests/compoundAngle.test.ts`):** the three degenerate guarantees; the worked
  example (6/4 → 6.00/4.02/7.21/705.6); `resultant = acos(cos f·cos s)`; `trueLength =
  rise/cos(resultant)`; clamping beyond 85°; no `trueLengthMm` when rise absent/0.
- **e2e (`e2e/geometry.spec.ts`):** switch to Compound leg, enter front 6 / side 4, see a
  miter and bevel result; the sketch mode still works.
- `src/domain/**` is under the coverage gate.

## Files

- Create: `src/domain/compoundAngle.ts`, `tests/compoundAngle.test.ts`,
  `src/components/CompoundLegCalculator.tsx`.
- Modify: `src/components/GeometryCalculator.tsx` (mode toggle), `src/styles.css`,
  `e2e/geometry.spec.ts`.

## Out of scope (deferred)

- Plan-rotation output and an orientation diagram; choosing which face the leg lies on
  (we fix one convention); persisting calculator inputs; driving it from two on-canvas
  elevation sketches; non-leg compound joints (crown molding, hoppers).
