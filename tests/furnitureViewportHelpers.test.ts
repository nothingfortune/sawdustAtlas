import { describe, expect, it } from 'vitest'
import { boundsRadius, boxToThree, clipPlanes, fitPose, partsBounds, worldToThree } from '../src/components/furniture/sceneMapping'
import { detectWebGL } from '../src/components/furniture/webgl'
import { isoCamera } from '../src/domain/furniture/projection'
import { BOOKCASE_BOXES, TABLE_BOXES, bookcaseResolvedParts, tableResolvedParts } from './fixtures/furniture'

describe('detectWebGL', () => {
  it('prefers webgl2 and accepts webgl1', () => {
    const asked: string[] = []
    expect(detectWebGL(() => ({ getContext: id => { asked.push(id); return id === 'webgl2' ? {} : null } }))).toBe(true)
    expect(asked).toEqual(['webgl2'])
    expect(detectWebGL(() => ({ getContext: id => (id === 'webgl' ? {} : null) }))).toBe(true)
  })

  it('is false when no context is available', () => {
    expect(detectWebGL(() => ({ getContext: () => null }))).toBe(false)
  })

  it('is false when the browser throws instead of returning null', () => {
    expect(detectWebGL(() => ({ getContext: () => { throw new Error('blocked') } }))).toBe(false)
    expect(detectWebGL(() => { throw new Error('no canvas') })).toBe(false)
  })
})

describe('world to three mapping', () => {
  it('maps z-up world axes to y-up three axes without mirroring', () => {
    // `|| 0` folds negative zero, which toEqual distinguishes.
    const unit = (point: [number, number, number]) => worldToThree(point).map(v => v || 0) as [number, number, number]
    const x = unit([1, 0, 0]), y = unit([0, 1, 0]), z = unit([0, 0, 1])
    expect(x).toEqual([1, 0, 0])
    expect(z).toEqual([0, 1, 0])
    // World front (-y) faces three's +z, toward the default viewer.
    expect(y).toEqual([0, 0, -1])
    // Right-handed: x cross y gives z in the mapped frame.
    const cross = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]].map(v => v || 0)
    expect(cross).toEqual(z)
  })

  it('maps a box to its three center and swapped extents', () => {
    const top = boxToThree(TABLE_BOXES['top']!)
    expect(top.center).toEqual([600, 737.5, -350])
    expect(top.size).toEqual([1200, 25, 700])
    const back = boxToThree(BOOKCASE_BOXES['back']!)
    expect(back.center).toEqual([400, 900, -297])
    expect(back.size).toEqual([764, 1800, 6])
  })
})

describe('partsBounds', () => {
  it('bounds every part', () => {
    expect(partsBounds(tableResolvedParts())).toEqual({ x: 0, y: 0, z: 0, sx: 1200, sy: 700, sz: 750 })
    expect(partsBounds(bookcaseResolvedParts())).toEqual({ x: 0, y: 0, z: 0, sx: 800, sy: 300, sz: 1800 })
    expect(partsBounds([])).toBeNull()
  })

  it('includes explode offsets', () => {
    expect(partsBounds(tableResolvedParts(), { top: [0, 0, 300], 'leg-fl': [-100, 0, 0] })).toEqual({ x: -75, y: 0, z: 0, sx: 1275, sy: 700, sz: 1050 })
  })
})

describe('camera fit', () => {
  const bounds = { x: 0, y: 0, z: 0, sx: 1200, sy: 700, sz: 750 }

  it('looks at the center from the iso direction, in three coordinates', () => {
    const pose = fitPose(bounds, 40, 1.6)
    expect(pose.target).toEqual(worldToThree(isoCamera(bounds).target))
    expect(pose.up).toEqual([0, 1, 0])
    const away = pose.position.map((v, i) => v - pose.target[i]!)
    // Front (+z in three), right (+x), above (+y).
    expect(away[0]!).toBeGreaterThan(0)
    expect(away[1]!).toBeGreaterThan(0)
    expect(away[2]!).toBeGreaterThan(0)
    expect(away[0]!).toBeCloseTo(away[1]!, 9)
    expect(away[0]!).toBeCloseTo(away[2]!, 9)
  })

  it('matches the iso camera distance when the view is wider than tall', () => {
    const pose = fitPose(bounds, 40, 1.6)
    const iso = isoCamera(bounds)
    const isoDistance = Math.hypot(...iso.position.map((v, i) => v - iso.target[i]!))
    expect(Math.hypot(...pose.position.map((v, i) => v - pose.target[i]!))).toBeCloseTo(isoDistance, 6)
  })

  it('backs off for a portrait viewport so the sphere still fits', () => {
    const landscape = fitPose(bounds, 40, 1.6)
    const portrait = fitPose(bounds, 40, 0.5)
    const distance = (pose: typeof landscape) => Math.hypot(...pose.position.map((v, i) => v - pose.target[i]!))
    expect(distance(portrait)).toBeGreaterThan(distance(landscape))
    const horizontalHalfFov = Math.atan(Math.tan((20 * Math.PI) / 180) * 0.5)
    expect(Math.asin(boundsRadius(bounds) / distance(portrait))).toBeCloseTo(horizontalHalfFov, 9)
  })

  it('stays finite for a degenerate box and a zero-size viewport', () => {
    const pose = fitPose({ x: 0, y: 0, z: 0, sx: 0, sy: 0, sz: 0 }, 40, 0)
    expect(pose.position.every(Number.isFinite)).toBe(true)
  })

  it('clips relative to the piece size', () => {
    const { near, far } = clipPlanes(bounds)
    const radius = boundsRadius(bounds)
    expect(near).toBeLessThan(radius)
    expect(far).toBeGreaterThan(radius * 10)
  })
})
