import { describe, expect, it } from 'vitest'
import { solveCompoundAngle } from '../src/domain/compoundAngle'

describe('solveCompoundAngle', () => {
  it('reduces to a single angle when one tilt is zero', () => {
    const a = solveCompoundAngle({ tiltADeg: 6, tiltBDeg: 0 })
    expect(a.miterDeg).toBeCloseTo(6, 6)
    expect(a.bevelDeg).toBeCloseTo(0, 6)
    expect(a.resultantTiltDeg).toBeCloseTo(6, 6)
    const b = solveCompoundAngle({ tiltADeg: 0, tiltBDeg: 4 })
    expect(b.miterDeg).toBeCloseTo(0, 6)
    expect(b.bevelDeg).toBeCloseTo(4, 6)
    expect(b.resultantTiltDeg).toBeCloseTo(4, 6)
  })

  it('is all zero for a square (no tilt)', () => {
    const r = solveCompoundAngle({ tiltADeg: 0, tiltBDeg: 0 })
    expect(r).toMatchObject({ miterDeg: 0, bevelDeg: 0, resultantTiltDeg: 0 })
  })

  it('matches the hand-computed worked example (6 / 4 / 700mm)', () => {
    const r = solveCompoundAngle({ tiltADeg: 6, tiltBDeg: 4, riseMm: 700 })
    expect(r.miterDeg).toBeCloseTo(6.0, 2)
    expect(r.bevelDeg).toBeCloseTo(4.02, 2)
    expect(r.resultantTiltDeg).toBeCloseTo(7.21, 2)
    expect(r.trueLengthMm).toBeCloseTo(705.6, 1)
  })

  it('resultant tilt = acos(cos a · cos b)', () => {
    const r = solveCompoundAngle({ tiltADeg: 20, tiltBDeg: 15 })
    expect(r.resultantTiltDeg).toBeCloseTo(Math.acos(Math.cos(20 * Math.PI / 180) * Math.cos(15 * Math.PI / 180)) * 180 / Math.PI, 6)
  })

  it('clamps non-physical tilts to 85°', () => {
    expect(solveCompoundAngle({ tiltADeg: 200, tiltBDeg: 0 }).miterDeg).toBe(85)
  })

  it('omits true length when no rise is given', () => {
    expect(solveCompoundAngle({ tiltADeg: 6, tiltBDeg: 4 })).not.toHaveProperty('trueLengthMm')
    expect(solveCompoundAngle({ tiltADeg: 6, tiltBDeg: 4, riseMm: 0 })).not.toHaveProperty('trueLengthMm')
  })
})
