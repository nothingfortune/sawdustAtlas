import { clampAngle, toBoardFeet } from './units'

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

const radians = (deg: number) => deg * Math.PI / 180

export function calculateAngleSetup(input: { trailingAngleDeg: number, stockThicknessMm: number, stripLengthMm: number }): AngleSetup {
  const angle = clampAngle(input.trailingAngleDeg)
  const thickness = Math.max(0, input.stockThicknessMm)
  const length = Math.max(0, input.stripLengthMm)
  const angleOffsetMm = thickness * Math.tan(radians(angle))
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
  return clampAngle(Math.atan(offsetMm / stockThicknessMm) * 180 / Math.PI)
}

// The width of a strip's *opposite* (angled) face. `widthMm` is the reference face; a
// positive trailing angle widens the far face, a negative one narrows it. Same
// width + thickness*tan(angle) relation as board generation; clamped to >= 0 for display.
export function angledFaceWidth(widthMm: number, stockThicknessMm: number, trailingAngleDeg: number): number {
  const reference = Math.max(0, widthMm)
  const opposite = reference + Math.max(0, stockThicknessMm) * Math.tan(clampAngle(trailingAngleDeg) * Math.PI / 180)
  return Math.max(0, opposite)
}
