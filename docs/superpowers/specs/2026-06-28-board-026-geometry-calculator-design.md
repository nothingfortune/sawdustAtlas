# BOARD-026: Geometry calculator (MVP) — Design

Date: 2026-06-28
Plan item: `BOARD-026` (general angle & geometry calculator). A standalone tool, broader
than the board-specific `BOARD-024`. This spec is the **MVP**: a free-form, exact,
single-plane sketch canvas with members that carry real thickness.

## Purpose

Woodworkers need a general layout calculator — e.g. splayed / X-style legs: where two
members cross, the angle between them, the distance between their top points. Today nothing
in the app answers arbitrary "two members at angles" geometry. This builds a free-form
points-and-members canvas with exact entry and live readouts.

## Decisions (from brainstorming)

- **Free-form canvas** (place points, connect into members), not a form-first calculator.
- **Exact**: place visually, then edit exact coordinates / length / bearing.
- **Persisted scratchpad**: one working sketch in its own localStorage key — no `AtlasData`
  schema or migration, not a managed list.
- **Readouts (all four):** distance between two points; a member's length + bearing; angle
  between two members; intersection point of two members (incl. on extensions).
- **3D-aware, pragmatically:** one working plane (e.g. front elevation), but members are
  real-width rectangles, not zero-width lines. Domain types are **z-ready** so true 3D /
  compound angles can follow without breaking callers.

## Architecture — three units

### 1. `src/domain/geometry2d.ts` (pure, fully tested — the core value)

Millimeters, full float precision; math coordinates (x right, **y up**) — the UI converts
to SVG (y down). `Vec` is an object so a `z` field can be added later.

```ts
export interface Vec { x: number; y: number }
export interface SketchPoint { id: string; x: number; y: number }
export interface SketchMember { id: string; aId: string; bId: string; widthMm: number }
export interface Sketch { points: SketchPoint[]; members: SketchMember[] }

export function distance(a: Vec, b: Vec): number          // hypot
export function bearingDeg(a: Vec, b: Vec): number        // atan2(dy,dx) in degrees, normalized to (-180, 180]
export function angleBetweenDeg(a1: Vec, a2: Vec, b1: Vec, b2: Vec): number
  // angle between directions a1->a2 and b1->b2, in [0, 180]; NaN-safe (returns 0 for a zero-length dir)
export function lineIntersection(a1: Vec, a2: Vec, b1: Vec, b2: Vec):
  { point: Vec; withinBoth: boolean } | null              // null when parallel; withinBoth = inside both segments
export function memberRectangle(a: Vec, b: Vec, widthMm: number): [Vec, Vec, Vec, Vec]
  // 4 corners of the rect centered on a->b, offset +/- width/2 perpendicular; degenerate
  // (a==b) falls back to direction (1,0)
```

Measurements operate on member **centerlines**. `memberRectangle` is for rendering members
as real boards now and reserved for edge/overlap math later.

### 2. Persistence (in `src/storage.ts`, alongside the other localStorage helpers)

```ts
export function loadSketch(): Sketch        // normalized; {points:[],members:[]} when absent/blocked
export function saveSketch(sketch: Sketch): void
```

- Key `sawdust-atlas:geometry`, separate from `AtlasData` (no schema bump/migration).
- `normalizeSketch(raw)` coerces untrusted shape: finite numeric x/y, members keep only
  `aId`/`bId` that reference existing points, `widthMm` via `finiteNumber` (non-negative),
  ids via `stringValue`. Try/catch around storage like `hasOnboarded`.

### 3. UI — `GeometryCalculator` component + standalone "Geometry" view

- Add `'geometry'` to the `View` union; a `NavButton` (Compass/Ruler icon, label
  "Geometry"); breadcrumb entry — same pattern as Wood library. Build
  `GeometryCalculator` as a self-contained component (`sketch` + `onChange`) so it can be
  embedded in the board designer later.
- **Canvas (SVG):** grid; tap empty space to add a point; drag a point to move it; select
  two points and "Connect" to add a member (drawn as a `memberRectangle`). Pan/zoom via
  `usePinchPan`; optional snap to grid / existing points; "Clear".
- **Inspector:** edit exact values for the selection — a point's `x`/`y`; a member's
  `width`, and its `length`/`bearing` (recomputes the far endpoint from the near one).
- **Readouts (selection-driven), unit-aware via `formatLength`/`formatNumber`:**
  - 2 points selected → **distance**.
  - 1 member selected → **length + bearing**.
  - 2 members selected → **angle between** + **intersection** (point drawn on the canvas
    with coordinates; "no intersection" when parallel).

**Data flow:** `App` holds the sketch in state (init from `loadSketch()`), autosaves via an
effect calling `saveSketch` on change (mirrors the `AtlasData` autosave), and passes
`sketch` + `onChange` to `GeometryCalculator`. The component does immutable sketch edits
(add/move/connect/delete) and calls `onChange`.

## Error handling / edge cases

- Parallel members → intersection readout shows "Lines are parallel — no intersection".
- Zero-length member / coincident points → guarded (no NaN; bearing/angle return 0).
- Empty sketch → friendly empty-state prompt ("Tap to place your first point").
- Deleting a point removes members that reference it.

## Testing

- **Unit (`tests/geometry2d.test.ts`):** `distance`; `bearingDeg` across quadrants
  (0/90/180/-90); `angleBetweenDeg` incl. 90° and collinear (0/180) and zero-length → 0;
  `lineIntersection` crossing (withinBoth true), on-extension (withinBoth false), parallel
  (null); `memberRectangle` corner positions for an axis-aligned and a 45° member, and the
  degenerate case.
- **Unit (`tests/storage.test.ts`):** `normalizeSketch` drops members referencing missing
  points and coerces bad numbers; `loadSketch`/`saveSketch` round-trip.
- **e2e (`e2e/geometry.spec.ts`):** open Geometry; place two points; read a distance;
  connect members and see an angle + intersection readout; reload keeps the sketch.
- `src/domain/**` and `storage.ts` are under the coverage gate — keep green.

## Files

- Create: `src/domain/geometry2d.ts`, `tests/geometry2d.test.ts`,
  `src/components/GeometryCalculator.tsx`, `e2e/geometry.spec.ts`.
- Modify: `src/types.ts` (View union), `src/storage.ts` (+ tests), `src/App.tsx` (state,
  autosave, nav, view, breadcrumb), `src/styles.css`.

## Out of scope (deferred)

- True 3D / compound-angle solver (domain is z-ready for it next).
- Edge/overlap intersection (centerline only for now; `memberRectangle` reserved).
- Named/saved multiple sketches; board-designer embedding; arcs/circles/offsets/constraints;
  export.
