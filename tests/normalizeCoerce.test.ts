import { describe, expect, it } from 'vitest'
import { finiteNumber, isRecord, nonNegativeFinite, records, signedFinite, stringValue, validColor } from '../src/normalize/coerce'
import { defaultNormalizeContext } from '../src/normalize/context'

describe('coercers', () => {
  it('finiteNumber clamps negatives to 0 and falls back on non-finite input', () => {
    expect(finiteNumber(-5, 9)).toBe(0)
    expect(finiteNumber(12.5, 9)).toBe(12.5)
    expect(finiteNumber(Number.NaN, 9)).toBe(9)
    expect(finiteNumber(Infinity, 9)).toBe(9)
    expect(finiteNumber('12', 9)).toBe(9)
  })

  it('signedFinite keeps the sign', () => {
    expect(signedFinite(-7.5, 0)).toBe(-7.5)
    expect(signedFinite(Number.NaN, 3)).toBe(3)
  })

  it('nonNegativeFinite rejects negatives outright instead of clamping', () => {
    expect(nonNegativeFinite(-1, 4)).toBe(4)
    expect(nonNegativeFinite(0, 4)).toBe(0)
  })

  it('stringValue rejects blank strings and non-strings', () => {
    expect(stringValue('  ', 'x')).toBe('x')
    expect(stringValue(3, 'x')).toBe('x')
    expect(stringValue('Walnut', 'x')).toBe('Walnut')
  })

  it('validColor accepts only #rrggbb', () => {
    expect(validColor('#A1b2C3', '#000000')).toBe('#A1b2C3')
    expect(validColor('red', '#000000')).toBe('#000000')
  })

  it('records keeps objects only; isRecord accepts arrays as today', () => {
    expect(records([{ a: 1 }, null, 3, 'x'])).toEqual([{ a: 1 }])
    expect(records('nope')).toEqual([])
    expect(isRecord([])).toBe(true)
    expect(isRecord(null)).toBe(false)
  })
})

describe('defaultNormalizeContext', () => {
  it('stamps an ISO time and issues distinct ids', () => {
    const ctx = defaultNormalizeContext()
    expect(Number.isNaN(Date.parse(ctx.now))).toBe(false)
    expect(ctx.createId()).not.toBe(ctx.createId())
  })
})
