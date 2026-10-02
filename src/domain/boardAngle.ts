import { clampAngle, degToRad, nonNegative, radToDeg, toBoardFeet } from './units'

// BOARD-024: shop-setup numbers implied by an end-grain trailing angle, using the same
// thickness * tan(angle) relation as board generation (boardGeometry rightWidth/faceShift,
// boardAllowances angle shift, the side-trim wedge).

export interface AngleSetup {
  trailingAngleDeg: number
  sawAngleDeg: number
  angleOffsetMm: number
  effectiveWidthGainMm: number
  wedgeCrossSectionMm2: number
  wedgeBoardFeet: number
}

export function calculateAngleSetup(input: { trailingAngleDeg: number, stockThicknessMm: number, stripLengthMm: number }): AngleSetup {
  const angle = clampAngle(input.trailingAngleDeg)
  const thickness = nonNegative(input.stockThicknessMm)
  const length = nonNegative(input.stripLengthMm)
  const angleOffsetMm = thickness * Math.tan(degToRad(angle))
  const effectiveWidthGainMm = Math.abs(angleOffsetMm)
  const wedgeCrossSectionMm2 = 0.5 * effectiveWidthGainMm * thickness
  return {
    trailingAngleDeg: angle,
    sawAngleDeg: Math.abs(angle),
    angleOffsetMm,
    effectiveWidthGainMm,
    wedgeCrossSectionMm2,
    wedgeBoardFeet: toBoardFeet(wedgeCrossSectionMm2 * length),
  }
}

export function angleForOffset(offsetMm: number, stockThicknessMm: number): number {
  if (!(stockThicknessMm > 0)) return 0
  return clampAngle(radToDeg(Math.atan(offsetMm / stockThicknessMm)))
}

// The width of a strip's *opposite* (angled) face. `widthMm` is the reference face; a
// positive trailing angle widens the far face, a negative one narrows it. Same
// width + thickness*tan(angle) relation as board generation; clamped to >= 0 for display.
export function angledFaceWidth(widthMm: number, stockThicknessMm: number, trailingAngleDeg: number): number {
  const reference = nonNegative(widthMm)
  const opposite = reference + nonNegative(stockThicknessMm) * Math.tan(degToRad(clampAngle(trailingAngleDeg)))
  return Math.max(0, opposite)
}
