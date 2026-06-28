import { describe, expect, it } from 'vitest'
import { buildTicks, fitPxPerMm, niceTickStep, resolveScale, scaleBarValue, snapScaleToUnit } from '../src/domain/boardScale'
import { MM_PER_INCH } from '../src/domain/lengthUnits'

describe('fitPxPerMm', () => {
  it('fills the box on the tighter axis, preserving aspect ratio', () => {
    // 200px box minus 24px default padding = 176 avail; tighter axis is width (176/100).
    expect(fitPxPerMm(100, 50, 200, 200)).toBeCloseTo(1.76, 5)
  })

  it('clamps up to the maximum for a small piece in a large box', () => {
    expect(fitPxPerMm(1, 1, 1000, 1000)).toBe(6)
  })

  it('clamps down to the minimum for a large piece in a tiny box', () => {
    expect(fitPxPerMm(10000, 10000, 50, 50)).toBe(0.02)
  })

  it('returns the clamped fallback for degenerate inputs', () => {
    expect(fitPxPerMm(0, 50, 200, 200, { fallbackPxPerMm: 2 })).toBe(2)
    expect(fitPxPerMm(100, 50, 0, 200, { fallbackPxPerMm: 2 })).toBe(2)
  })
})

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

  it('snaps to imperial nice steps (½", 1", 2"...) when unit is imperial', () => {
    // pxPerMm 8 -> minStepMm = 64/8 = 8 mm; smallest imperial step >= 8 is ½" (12.7).
    expect(niceTickStep(8, 64, 'imperial')).toBeCloseTo(MM_PER_INCH / 2, 6)
    // shrinking the scale picks a coarser imperial step.
    expect(niceTickStep(0.16, 64, 'imperial')).toBeGreaterThan(niceTickStep(2, 64, 'imperial'))
  })
})

describe('snapScaleToUnit', () => {
  it('floors the scale so one base unit spans a whole pixel count', () => {
    // ½" = 12.7 mm; at 0.7 px/mm that is 8.89 px -> floored to 8 px.
    expect(snapScaleToUnit(0.7, 12.7)).toBeCloseTo(8 / 12.7, 9)
  })

  it('never exceeds the input scale, so the preview still fits', () => {
    expect(snapScaleToUnit(0.7, 12.7)).toBeLessThanOrEqual(0.7)
  })

  it('leaves the scale unchanged for degenerate inputs or sub-pixel units', () => {
    expect(snapScaleToUnit(0, 12.7)).toBe(0)
    expect(snapScaleToUnit(0.7, 0)).toBe(0.7)
    expect(snapScaleToUnit(0.05, 12.7)).toBe(0.05) // 12.7 * 0.05 = 0.635 px < 1
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

  it('picks the largest imperial nice value within the bar when unit is imperial', () => {
    // 120 px / 0.7 px/mm = 171 mm cap; largest imperial step <= 171 is 6" (152.4).
    expect(scaleBarValue(0.7, 120, 'imperial').mm).toBeCloseTo(MM_PER_INCH * 6, 6)
  })
})

describe('resolveScale imperial snapping', () => {
  it('snaps the resolved scale so the base unit lands on whole pixels', () => {
    const result = resolveScale(460, 800, { targetPxPerMm: 0.7, snapUnitMm: MM_PER_INCH / 2 })
    expect(result.pxPerMm).toBeCloseTo(Math.floor((MM_PER_INCH / 2) * 0.7) / (MM_PER_INCH / 2), 9)
    expect(result.pxPerMm).toBeLessThanOrEqual(0.7)
  })

  it('is unchanged when no snap unit is given', () => {
    expect(resolveScale(460, 800, { targetPxPerMm: 0.7 }).pxPerMm).toBe(0.7)
  })
})
