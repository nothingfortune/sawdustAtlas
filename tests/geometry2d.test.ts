import { describe, expect, it } from 'vitest'
import { distance, bearingDeg, angleBetweenDeg, angleToAxes, lineIntersection, memberRectangle } from '../src/domain/geometry2d'

const v = (x: number, y: number) => ({ x, y })

describe('geometry2d', () => {
  it('distance is euclidean', () => {
    expect(distance(v(0, 0), v(3, 4))).toBe(5)
  })

  it('bearingDeg measures from +x, y-up, normalized to (-180,180]', () => {
    expect(bearingDeg(v(0, 0), v(1, 0))).toBeCloseTo(0, 6)
    expect(bearingDeg(v(0, 0), v(0, 1))).toBeCloseTo(90, 6)
    expect(bearingDeg(v(0, 0), v(-1, 0))).toBeCloseTo(180, 6)
    expect(bearingDeg(v(0, 0), v(0, -1))).toBeCloseTo(-90, 6)
  })

  it('angleBetweenDeg returns [0,180]; perpendicular = 90, collinear = 0/180, zero-length = 0', () => {
    expect(angleBetweenDeg(v(0, 0), v(1, 0), v(0, 0), v(0, 1))).toBeCloseTo(90, 6)
    expect(angleBetweenDeg(v(0, 0), v(1, 0), v(0, 0), v(2, 0))).toBeCloseTo(0, 6)
    expect(angleBetweenDeg(v(0, 0), v(1, 0), v(0, 0), v(-1, 0))).toBeCloseTo(180, 6)
    expect(angleBetweenDeg(v(0, 0), v(0, 0), v(0, 0), v(1, 0))).toBe(0)
  })

  it('lineIntersection: crossing within both, on-extension, and parallel', () => {
    const cross = lineIntersection(v(-1, 0), v(1, 0), v(0, -1), v(0, 1))
    expect(cross?.point).toEqual({ x: 0, y: 0 })
    expect(cross?.withinBoth).toBe(true)
    const ext = lineIntersection(v(0, 0), v(1, 0), v(2, 1), v(2, 2)) // cross at (2,0), outside both segments
    expect(ext?.point.x).toBeCloseTo(2, 6)
    expect(ext?.withinBoth).toBe(false)
    expect(lineIntersection(v(0, 0), v(1, 0), v(0, 1), v(1, 1))).toBeNull() // parallel
  })

  it('angleToAxes gives acute angles (0..90) to horizontal and vertical, sign-independent', () => {
    expect(angleToAxes(v(0, 0), v(10, 0))).toEqual({ fromHorizontalDeg: 0, fromVerticalDeg: 90 })
    expect(angleToAxes(v(0, 0), v(0, 10))).toEqual({ fromHorizontalDeg: 90, fromVerticalDeg: 0 })
    const diag = angleToAxes(v(0, 0), v(10, 10))
    expect(diag.fromHorizontalDeg).toBeCloseTo(45, 6)
    expect(diag.fromVerticalDeg).toBeCloseTo(45, 6)
    // a leg leaning the other way reads the same acute angles
    expect(angleToAxes(v(0, 0), v(-10, -10)).fromHorizontalDeg).toBeCloseTo(45, 6)
  })

  it('memberRectangle offsets +/- width/2 perpendicular to the centerline', () => {
    const r = memberRectangle(v(0, 0), v(10, 0), 4) // horizontal, width 4 -> corners at y = +/-2
    const ys = r.map(c => c.y).sort((a, b) => a - b)
    expect(ys[0]).toBeCloseTo(-2, 6)
    expect(ys[3]).toBeCloseTo(2, 6)
    expect(r).toHaveLength(4)
    expect(memberRectangle(v(0, 0), v(0, 0), 4)).toHaveLength(4) // degenerate, no throw
  })
})
