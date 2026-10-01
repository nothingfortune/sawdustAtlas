// Shared numeric helpers for the board domain. Kept in one place so the geometry,
// allowance, and cut-plan modules can't drift apart on rounding or clamping rules.

export const CUBIC_MM_PER_BOARD_FOOT = 2_359_737.216
export const ANGLE_LIMIT = 89
// Below this a trailing angle counts as square (no bevel) — used to decide whether a strip
// is angled when grouping/labelling cut setups.
export const SQUARE_ANGLE_TOLERANCE_DEG = 0.001
// Shared small tolerance for float comparisons / degenerate-geometry guards. One source
// so geometry, brick, and 2D-sketch modules can't drift apart on what counts as zero.
export const EPSILON = 1e-9

export function toBoardFeet(cubicMillimeters: number): number {
  return cubicMillimeters / CUBIC_MM_PER_BOARD_FOOT
}

// Degree/radian conversions. Kept here so trig-using modules share one definition.
export function degToRad(degrees: number): number {
  return degrees * Math.PI / 180
}

export function radToDeg(radians: number): number {
  return radians * 180 / Math.PI
}

// A trailing angle counts as square (no bevel) when it is within SQUARE_ANGLE_TOLERANCE_DEG
// of zero. Single source for the "is this strip square?" test across pricing, cut plans,
// and bench setup so they can't disagree.
export function isSquareAngle(angleDeg: number): boolean {
  return Math.abs(angleDeg) <= SQUARE_ANGLE_TOLERANCE_DEG
}

// Coerce to a finite, non-negative number (for true dimensions/volumes).
export function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

// Clamp a (possibly non-finite) trailing angle to the buildable +/-89 degrees.
export function clampAngle(value: number): number {
  return Math.min(Math.max(Number.isFinite(value) ? value : 0, -ANGLE_LIMIT), ANGLE_LIMIT)
}
