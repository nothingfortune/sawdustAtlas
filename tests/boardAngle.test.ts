import { describe, expect, it } from 'vitest'
import { calculateAngleSetup, angleForOffset, angledFaceWidth } from '../src/domain/boardAngle'

const setup = (trailingAngleDeg: number, stockThicknessMm = 38, stripLengthMm = 900) =>
  calculateAngleSetup({ trailingAngleDeg, stockThicknessMm, stripLengthMm })

describe('calculateAngleSetup', () => {
  it('offset follows thickness * tan(angle)', () => {
    const r = setup(30, 38)
    expect(r.angleOffsetMm).toBeCloseTo(38 * Math.tan(30 * Math.PI / 180), 4)
    expect(r.effectiveWidthGainMm).toBeCloseTo(r.angleOffsetMm, 6)
    expect(r.sawAngleDeg).toBe(30)
  })

  it('a square strip has zero everything', () => {
    const r = setup(0)
    expect(r.angleOffsetMm).toBe(0)
    expect(r.effectiveWidthGainMm).toBe(0)
    expect(r.wedgeCrossSectionMm2).toBe(0)
    expect(r.wedgeBoardFeet).toBe(0)
  })

  it('a negative angle keeps a signed offset but positive width gain and saw angle', () => {
    const r = setup(-30, 38)
    expect(r.angleOffsetMm).toBeLessThan(0)
    expect(r.effectiveWidthGainMm).toBeGreaterThan(0)
    expect(r.sawAngleDeg).toBe(30)
  })

  it('wedge = half the offset times thickness, scaling with strip length', () => {
    const r = setup(30, 38, 900)
    expect(r.wedgeCrossSectionMm2).toBeCloseTo(0.5 * Math.abs(r.angleOffsetMm) * 38, 4)
    const longer = setup(30, 38, 1800)
    expect(longer.wedgeBoardFeet).toBeCloseTo(r.wedgeBoardFeet * 2, 6)
  })

  it('clamps beyond +/-89 degrees', () => {
    expect(setup(200).sawAngleDeg).toBeLessThanOrEqual(89)
  })

  it('angleForOffset inverts calculateAngleSetup', () => {
    const r = setup(22, 40)
    expect(angleForOffset(r.angleOffsetMm, 40)).toBeCloseTo(22, 4)
    expect(angleForOffset(10, 0)).toBe(0)
  })
})

describe('angledFaceWidth', () => {
  it('a positive angle widens the opposite face, a negative angle narrows it', () => {
    expect(angledFaceWidth(40, 38, 30)).toBeCloseTo(40 + 38 * Math.tan(30 * Math.PI / 180), 4) // ~61.94
    expect(angledFaceWidth(40, 38, -30)).toBeCloseTo(40 - 38 * Math.tan(30 * Math.PI / 180), 4) // ~18.06
  })

  it('a square strip keeps both faces equal, and a crossing face clamps to zero', () => {
    expect(angledFaceWidth(40, 38, 0)).toBe(40)
    expect(angledFaceWidth(10, 38, -80)).toBe(0) // tapers past the point -> clamped
  })
})
