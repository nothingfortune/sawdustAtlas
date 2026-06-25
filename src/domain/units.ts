// Shared numeric helpers for the board domain. Kept in one place so the geometry,
// allowance, and cut-plan modules can't drift apart on rounding or clamping rules.

export const CUBIC_MM_PER_BOARD_FOOT = 2_359_737.216
export const ANGLE_LIMIT = 89

export function toBoardFeet(cubicMillimeters: number): number {
  return cubicMillimeters / CUBIC_MM_PER_BOARD_FOOT
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
