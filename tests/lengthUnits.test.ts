import { describe, expect, it } from 'vitest'
import { convertMetricText, formatDimensions, formatFieldLabel, formatLength, formatLengthValue, inchesToMm, MM_PER_FOOT, parseLengthInput, snapLengthMm, snapMmToFoot } from '../src/domain/lengthUnits'

describe('snapMmToFoot', () => {
  it('rounds any grid spacing to the nearest whole foot', () => {
    expect(snapMmToFoot(300)).toBeCloseTo(MM_PER_FOOT, 6) // ~0.98 ft -> 1 ft
    expect(snapMmToFoot(600)).toBeCloseTo(MM_PER_FOOT * 2, 6) // ~1.97 ft -> 2 ft
    expect(snapMmToFoot(900)).toBeCloseTo(MM_PER_FOOT * 3, 6) // ~2.95 ft -> 3 ft
  })

  it('never returns less than one foot', () => {
    expect(snapMmToFoot(100)).toBeCloseTo(MM_PER_FOOT, 6)
    expect(snapMmToFoot(0)).toBeCloseTo(MM_PER_FOOT, 6)
  })

  // Regression for the "only the exact 300 mm default snapped" bug: assert the
  // invariant (whole feet, >= 1 ft) holds for EVERY spacing, not one happy value.
  it('yields a whole number of feet for any grid spacing', () => {
    for (let mm = 50; mm <= 3000; mm += 25) {
      const feet = snapMmToFoot(mm) / MM_PER_FOOT
      expect(Math.abs(feet - Math.round(feet))).toBeLessThan(1e-9) // a whole foot (modulo float)
      expect(Math.round(feet)).toBeGreaterThanOrEqual(1)
    }
  })
})

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

const IN = 25.4

describe('parseLengthInput — metric', () => {
  it('parses a finite number', () => { expect(parseLengthInput('42.5', 'metric')).toBe(42.5) })
  it('returns null for non-numeric metric input', () => { expect(parseLengthInput('abc', 'metric')).toBeNull() })
})

describe('formatFieldLabel', () => {
  it('appends the active unit, replacing any existing (mm)/(in) suffix', () => {
    expect(formatFieldLabel('Length (mm)', 'imperial')).toBe('Length (in)')
    expect(formatFieldLabel('Length', 'metric')).toBe('Length (mm)')
  })
  it('leaves metric text unchanged in convertMetricText', () => {
    expect(convertMetricText('surface to 38 mm.', 'metric')).toBe('surface to 38 mm.')
  })
})

describe('parseLengthInput — imperial forms (table-driven)', () => {
  const cases: Array<[string, number | null]> = [
    // bare integers / decimals
    ['5', 5 * IN],
    ['17.625', 17.625 * IN],
    ['0', 0],
    ['', 0],
    // bare fractions
    ['3/4', 0.75 * IN],
    ['-3/4', -0.75 * IN],
    // mixed, both hyphenated and spaced
    ['1 1/2', 1.5 * IN],
    ['1-1/2', 1.5 * IN],
    // feet
    ["2'", 24 * IN],
    ['2 ft', 24 * IN],
    ["2' 3", 27 * IN],
    ['2\' 3 1/4"', 27.25 * IN],
    // inch marks and words
    ['3"', 3 * IN],
    ['3 in', 3 * IN],
    ['3 inches', 3 * IN],
    // negatives in every form
    ['-5', -5 * IN],
    ['-1 1/2', -1.5 * IN],
    ['-1-1/2', -1.5 * IN],
    ["-2'", -24 * IN],
    // garbage
    ['abc', null],
    ['1/0', null],
    ['1/', null],
    ['//', null],
  ]
  it.each(cases)('parses %j', (raw, expected) => {
    const got = parseLengthInput(raw, 'imperial')
    if (expected === null) expect(got).toBeNull()
    else expect(got).toBeCloseTo(expected, 6)
  })

  it('does not drop a leading negative sign (regression for the hyphen-normalizer bug)', () => {
    expect(parseLengthInput('-5', 'imperial')).toBeCloseTo(-127, 6)
    expect(parseLengthInput('-1 1/2', 'imperial')).toBeCloseTo(-38.1, 6)
  })
})

describe('formatLengthValue — imperial rounding + sign', () => {
  it('rolls 0.999 in up to a whole inch (no "0 32/32")', () => {
    expect(formatLengthValue(0.999 * IN, 'imperial')).toBe('1')
  })
  it('formats negatives with a leading minus', () => {
    expect(formatLengthValue(-1.5 * IN, 'imperial')).toBe('-1 1/2')
    expect(formatLengthValue(-0.75 * IN, 'imperial')).toBe('-3/4')
  })
  it('reduces the 32nd fraction to lowest terms', () => {
    expect(formatLengthValue(0.5 * IN, 'imperial')).toBe('1/2')
    expect(formatLengthValue(0.25 * IN, 'imperial')).toBe('1/4')
  })
})

describe('imperial round-trips (mm -> text -> mm) at exact 32nds', () => {
  it.each([0, 0.5, 1, 1.5, 3.25, 17.625, -1.5, -0.75])('round-trips %d in', inches => {
    const mm = inches * IN
    const back = parseLengthInput(formatLengthValue(mm, 'imperial'), 'imperial')
    expect(back).toBeCloseTo(mm, 6)
  })
})
