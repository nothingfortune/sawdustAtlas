import { describe, expect, it } from 'vitest'
import { buildTicks, niceTickStep, resolveScale, scaleBarValue } from '../src/domain/boardScale'

describe('resolveScale', () => {
  it('uses the target scale when the board fits comfortably', () => {
    const result = resolveScale(460, 800, { targetPxPerMm: 0.7 })
    expect(result.pxPerMm).toBe(0.7)
    expect(result.fitToWidth).toBe(false)
    expect(result.contentWidthPx).toBeCloseTo(322, 6)
  })

  it('shrinks to fit a board wider than the container at the target scale', () => {
    const result = resolveScale(1500, 800, { targetPxPerMm: 0.7, minPxPerMm: 0.16 })
    expect(result.pxPerMm).toBeCloseTo(800 / 1500, 6)
    expect(result.contentWidthPx).toBeCloseTo(800, 6)
    expect(result.fitToWidth).toBe(false)
  })

  it('clamps to the floor and reports scroll for an extremely long board', () => {
    const result = resolveScale(10000, 800, { targetPxPerMm: 0.7, minPxPerMm: 0.16 })
    expect(result.pxPerMm).toBe(0.16)
    expect(result.fitToWidth).toBe(true)
    expect(result.contentWidthPx).toBeGreaterThan(800)
  })

  it('never exceeds the maximum scale for tiny boards', () => {
    const result = resolveScale(10, 800, { targetPxPerMm: 0.7, maxPxPerMm: 2 })
    expect(result.pxPerMm).toBe(0.7)
  })

  it('returns a safe scale for degenerate inputs', () => {
    expect(resolveScale(0, 800).contentWidthPx).toBe(0)
    expect(resolveScale(460, 0).fitToWidth).toBe(false)
  })
})

describe('niceTickStep', () => {
  it('keeps label spacing at or above the minimum', () => {
    const pxPerMm = 0.7
    const step = niceTickStep(pxPerMm, 64)
    expect(step * pxPerMm).toBeGreaterThanOrEqual(64)
  })

  it('returns a coarser step as the scale shrinks', () => {
    expect(niceTickStep(2)).toBeLessThan(niceTickStep(0.16))
  })

  it('falls back to a sane step for a non-positive scale', () => {
    expect(niceTickStep(0)).toBe(10)
  })
})

describe('buildTicks', () => {
  it('produces every step plus the exact end length', () => {
    expect(buildTicks(100, 25)).toEqual([0, 25, 50, 75, 100])
  })

  it('appends the end length when it is not a clean multiple', () => {
    const ticks = buildTicks(110, 50)
    expect(ticks[0]).toBe(0)
    expect(ticks.at(-1)).toBe(110)
    expect(ticks).toContain(100)
  })

  it('handles degenerate inputs', () => {
    expect(buildTicks(0, 10)).toEqual([0])
    expect(buildTicks(100, 0)).toEqual([0])
  })
})

describe('scaleBarValue', () => {
  it('picks the largest nice value within the bar width', () => {
    const { mm, px } = scaleBarValue(0.7, 120)
    expect(mm).toBe(100)
    expect(px).toBeCloseTo(70, 6)
  })

  it('falls back to the smallest nice value when even that overflows', () => {
    expect(scaleBarValue(1000, 120).mm).toBe(1)
  })
})
