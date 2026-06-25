import { describe, expect, it } from 'vitest'
import { pinchTransform } from '../src/components/usePinchPan'

const start = { dist: 100, cx: 50, cy: 50, scale: 1, x: 0, y: 0 }

describe('pinchTransform', () => {
  it('scales by the two-pointer distance ratio from the gesture start', () => {
    const transform = pinchTransform(start, { dist: 200, cx: 50, cy: 50 }, 1, 4)
    expect(transform).toEqual({ scale: 2, x: 0, y: 0 })
  })

  it('clamps the scale to the max', () => {
    expect(pinchTransform(start, { dist: 1000, cx: 50, cy: 50 }, 1, 4).scale).toBe(4)
  })

  it('clamps the scale to the min', () => {
    expect(pinchTransform(start, { dist: 10, cx: 50, cy: 50 }, 1, 4).scale).toBe(1)
  })

  it('pans by how far the gesture midpoint moved, added to the start offset', () => {
    const transform = pinchTransform({ ...start, x: 5, y: -5 }, { dist: 100, cx: 70, cy: 30 }, 1, 4)
    expect(transform).toEqual({ scale: 1, x: 25, y: -25 })
  })
})
