# BOARD-026 (3D): Compound-angle leg calculator — Design

Date: 2026-06-29
Plan item: `BOARD-026` follow-up. The geometry tool is meant to be a **flexible angle
toolkit**, not tied to specific use cases. This adds the **3D** piece: any object that tilts
in two planes → the **compound angle** (and the saw miter + bevel to cut it). A splayed leg
is one example; it applies equally to hoppers, splayed box sides, canted posts, etc.

A companion canvas capability — **draw a rectangle/square and read its diagonal (bisection)
angles** — is the next increment after this calc; both serve the same general-toolkit goal.

## Decisions (from brainstorming)

- **Shape:** a **parametric calculator** (form in/results out), not a 3D canvas. Lives as a
  mode in the Geometry tool ("Sketch" ⇄ "Compound angle").
- **Inputs:** **two tilt components** — the tilt seen in each of two perpendicular views
  (`tiltA`, `tiltB`); e.g. the front- and side-view tilt of a splayed leg. Kept general.

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
export interface CompoundAngleInput { tiltADeg: number; tiltBDeg: number; riseMm?: number }
export interface CompoundAngleResult {
  miterDeg: number          // = tiltA (clamped)
  bevelDeg: number          // = atan(tan(tiltB)/cos(tiltA))
  resultantTiltDeg: number  // = acos(cos tiltA · cos tiltB) — combined tilt off square
  trueLengthMm?: number     // = rise / cos(resultant); omitted when no rise
}
export function solveCompoundAngle(input: CompoundAngleInput): CompoundAngleResult
```
- Tilts clamped to `[0, 85]` (beyond is non-physical). Reuses radians helpers;
  `trueLengthMm` only present when `riseMm > 0`. General-purpose: nothing leg-specific.

### UI — a "Compound angle" mode in the Geometry view

- A segmented control in the Geometry header: **Sketch** (the existing canvas) ⇄
  **Compound angle** (this calculator). Local mode state; the sketch is untouched.
- The calculator is a centered form (`CompoundAngleCalculator`): **Tilt A °**, **Tilt B °**,
  **Rise (optional)** inputs → a results list: **Combined tilt off square**, **Miter**,
  **Bevel**, **True length**. Unit-aware for the length (`formatLength`); angles in degrees.
  A one-line note explains the two tilts are perpendicular-view tilts (e.g. front/side of a
  leg) and that Tilt A is the miter / Tilt B drives the bevel.
- Inputs are ephemeral local state (a scratch calculator); persisting the last values is a
  later nicety.

## Testing

- **Unit (`tests/compoundAngle.test.ts`):** the three degenerate guarantees; the worked
  example (6/4 → 6.00/4.02/7.21/705.6); `resultant = acos(cos f·cos s)`; `trueLength =
  rise/cos(resultant)`; clamping beyond 85°; no `trueLengthMm` when rise absent/0.
- **e2e (`e2e/geometry.spec.ts`):** switch to Compound angle, enter Tilt A 6 / Tilt B 4,
  see a miter and bevel result; the sketch mode still works.
- `src/domain/**` is under the coverage gate.

## Files

- Create: `src/domain/compoundAngle.ts`, `tests/compoundAngle.test.ts`,
  `src/components/CompoundAngleCalculator.tsx`.
- Modify: `src/components/GeometryCalculator.tsx` (mode toggle), `src/styles.css`,
  `e2e/geometry.spec.ts`.

## Next increment (committed, separate PR): rectangle + bisection on the canvas

Add a **rectangle/square** primitive to the sketch (drag two opposite corners → 4 corner
points + 4 sides + 2 diagonals). The diagonals bisect the corners, so the existing
angle-between-members readout gives the bisection angle (square → 45°, rectangle →
`atan(short/long)`). Keeps the tool general for "draw something and read its angles."

## Out of scope (deferred)

- Plan-rotation output and an orientation diagram; choosing which reference face (one fixed
  convention); persisting calculator inputs; driving the calc from two on-canvas elevation
  sketches.
