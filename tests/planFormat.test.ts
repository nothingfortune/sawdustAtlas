import { describe, expect, it } from 'vitest'
import { formatQuantity, formatTolerance, outputChips, splitSetupChecks } from '../src/components/instructions/planFormat'
import { makeStep } from './fixtures/instructionPlans'
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
  it('shows imperial length tolerances in thousandths so small tolerances never read as zero', () => {
    expect(formatTolerance(m({ tolerance: { minus: 0.25, plus: 0.25 } }), 'imperial')).toBe('± 0.010 in')
    expect(formatTolerance(m({ tolerance: { minus: 0.5, plus: 1 } }), 'imperial')).toBe('− 0.020 in / + 0.039 in')
  })
  it('groups repeated output labels into counted chips in first-seen order', () => {
    expect(outputChips(['Walnut', 'Hard maple', 'Walnut', 'Hard maple', 'Cherry'])).toEqual([
      { label: 'Walnut', count: 2 }, { label: 'Hard maple', count: 2 }, { label: 'Cherry', count: 1 },
    ])
    expect(outputChips([])).toEqual([])
  })
  it('moves a verify-before re-check of a machine setting onto that setting', () => {
    const check = m({ key: 'fence', label: 'Fence to blade', target: 56.2, phase: 'verify-before' })
    const after = m({ key: 'width', label: 'Strip width', target: 56.2, phase: 'achieve-after' })
    const step = makeStep({
      key: 's', phaseKey: 'p', order: 1, kind: 'cut',
      machineSetup: { tool: 'table-saw', settings: [{ label: 'Fence to blade', value: 56.2, unit: 'mm', source: 'design' }] },
      measurements: [check, after],
    })
    const { checks, measurements } = splitSetupChecks(step)
    expect(checks.get('Fence to blade')).toBe(check)
    expect(measurements).toEqual([after])
  })
  it('keeps measurements that differ from the setting or are checked after the cut', () => {
    const settings = [{ label: 'Fence to blade', value: 56.2, unit: 'mm' as const, source: 'design' as const }]
    const otherValue = m({ key: 'a', label: 'Fence to blade', target: 50, phase: 'verify-before' })
    const afterCut = m({ key: 'b', label: 'Fence to blade', target: 56.2, phase: 'achieve-after' })
    const step = makeStep({ key: 's', phaseKey: 'p', order: 1, kind: 'cut', machineSetup: { tool: 'table-saw', settings }, measurements: [otherValue, afterCut] })
    expect(splitSetupChecks(step).measurements).toEqual([otherValue, afterCut])
    expect(splitSetupChecks(makeStep({ key: 't', phaseKey: 'p', order: 1, kind: 'cut', measurements: [afterCut] })).checks.size).toBe(0)
  })
})
