import { describe, expect, it } from 'vitest'
import { convertMetricText, formatDimensions, formatLength, formatLengthValue, inchesToMm, parseLengthInput, snapLengthMm } from '../src/domain/lengthUnits'

describe('snapLengthMm', () => {
  const IN = 25.4
  it('leaves metric values untouched', () => {
    expect(snapLengthMm(123.4, 'metric')).toBe(123.4)
  })
  it('snaps imperial to the nearest half inch', () => {
    expect(snapLengthMm(1.1 * IN, 'imperial')).toBeCloseTo(1.0 * IN, 5)
    expect(snapLengthMm(1.3 * IN, 'imperial')).toBeCloseTo(1.5 * IN, 5)
    expect(snapLengthMm(1.8 * IN, 'imperial')).toBeCloseTo(2.0 * IN, 5)
  })
})

describe('lengthUnits', () => {
  it('formats metric lengths with trimmed decimals', () => {
    expect(formatLength(38, 'metric')).toBe('38 mm')
    expect(formatDimensions([450, 38, 38], 'metric')).toBe('450 × 38 × 38 mm')
  })

  it('formats imperial lengths as nearest 32nd fractions', () => {
    expect(formatLength(38, 'imperial')).toBe('1 1/2 in')
    expect(formatLengthValue(450, 'imperial')).toBe('17 23/32')
    expect(formatDimensions([450, 38], 'imperial')).toBe('17 23/32 × 1 1/2 in')
  })

  it('parses decimal and fractional imperial input into metric', () => {
    expect(parseLengthInput('1 1/2', 'imperial')).toBeCloseTo(38.1)
    expect(parseLengthInput('17.625', 'imperial')).toBeCloseTo(inchesToMm(17.625))
    expect(parseLengthInput('2\' 3 1/4"', 'imperial')).toBeCloseTo(inchesToMm(27.25))
  })

  it('converts metric text snippets to imperial display text', () => {
    expect(convertMetricText('Trim to 450 mm finished length and surface to 38 mm.', 'imperial')).toBe('Trim to 17 23/32 in finished length and surface to 1 1/2 in.')
  })
})
