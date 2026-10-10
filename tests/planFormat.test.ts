import { describe, expect, it } from 'vitest'
import { formatQuantity, formatTolerance } from '../src/components/instructions/planFormat'
import type { Measurement } from '../src/domain/instructions/types'

const m = (over: Partial<Measurement>): Measurement => ({ key: 'k', label: 'L', target: 38, unit: 'mm', tolerance: { minus: 0.5, plus: 0.5 }, critical: false, phase: 'verify-before', ...over })

describe('planFormat', () => {
  it('formats mm in the current unit system', () => {
    expect(formatQuantity(25.4, 'mm', 'metric')).toBe('25.4 mm')
    expect(formatQuantity(25.4, 'mm', 'imperial')).toBe('1 in')
  })
  it('formats degrees and counts without length units', () => {
    expect(formatQuantity(5, 'deg', 'imperial')).toBe('5°')
    expect(formatQuantity(6, 'count', 'metric')).toBe('6')
  })
  it('formats symmetric and asymmetric tolerances and omits zero tolerance', () => {
    expect(formatTolerance(m({}), 'metric')).toBe('± 0.5 mm')
    expect(formatTolerance(m({ tolerance: { minus: 0.5, plus: 1 } }), 'metric')).toBe('− 0.5 mm / + 1 mm')
    expect(formatTolerance(m({ tolerance: { minus: 0, plus: 0 } }), 'metric')).toBe('')
    expect(formatTolerance(m({ unit: 'deg', tolerance: { minus: 0.2, plus: 0.2 } }), 'imperial')).toBe('± 0.2°')
  })
})
