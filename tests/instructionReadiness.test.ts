import { describe, expect, it } from 'vitest'
import { computeReadiness } from '../src/domain/instructions/readiness'
import type { ReadinessInput } from '../src/domain/instructions/readiness'
import type { InstructionPlan, PlanValidation, ReadinessDimension } from '../src/domain/instructions/types'
import type { WorkspaceWarning } from '../src/domain/workspaceWarnings'
import { tinyEdgePlan } from './fixtures/instructionPlans'

const OK: PlanValidation = { ok: true, issues: [] }
const ALL_HAVE = { stock: { walnut: 'have' as const }, tools: { jointer: 'have' as const, planer: 'have' as const, 'table-saw': 'have' as const, clamps: 'have' as const, glue: 'have' as const } }

function input(overrides: Partial<ReadinessInput> = {}, plan: InstructionPlan = tinyEdgePlan()): ReadinessInput {
  return { plan, validation: OK, designWarnings: [], attestations: ALL_HAVE, ...overrides }
}
function chipOf(result: ReturnType<typeof computeReadiness>, dimension: ReadinessDimension) {
  return result.chips.find((c) => c.dimension === dimension)!
}
const designError: WorkspaceWarning = { id: 'e', severity: 'error', message: 'Bad geometry', location: { view: 'boards', targetId: 'tiny' } }
const designWarn: WorkspaceWarning = { id: 'w', severity: 'warning', message: 'Odd wood' }

describe('computeReadiness', () => {
  it('is all ready with full attestations and a clean plan', () => {
    const result = computeReadiness(input())
    expect(result.chips.map((c) => c.status)).toEqual(['ready', 'ready', 'ready', 'ready', 'ready', 'ready'])
    expect(result.startGate).toEqual({ allowed: true, hardBlocks: [], softGaps: [] })
  })

  it('keeps the chip order fixed', () => {
    expect(computeReadiness(input()).chips.map((c) => c.dimension)).toEqual(['design', 'instructions', 'material', 'tools', 'warnings', 'decisions'])
  })

  describe('design', () => {
    it('blocks on a design error and keeps its location', () => {
      const chip = chipOf(computeReadiness(input({ designWarnings: [designError] })), 'design')
      expect(chip.status).toBe('blocked')
      expect(chip.summary).toBe('1 error')
      expect(chip.reasons[0]?.location).toEqual({ view: 'boards', targetId: 'tiny' })
    })
    it('blocks on an error among plan warnings', () => {
      const plan = tinyEdgePlan()
      plan.warnings.push({ id: 'p', severity: 'error', message: 'Self-crossing strip' })
      expect(chipOf(computeReadiness(input({}, plan)), 'design').status).toBe('blocked')
    })
    it('needs attention on design warnings only', () => {
      const chip = chipOf(computeReadiness(input({ designWarnings: [designWarn] })), 'design')
      expect(chip.status).toBe('attention')
      expect(chip.summary).toBe('1 warning')
    })
    it('reports mixed counts', () => {
      expect(chipOf(computeReadiness(input({ designWarnings: [designError, designWarn, designWarn] })), 'design').summary).toBe('1 error, 2 warnings')
    })
  })

  describe('instructions', () => {
    it('blocks on validation errors with step keys', () => {
      const validation: PlanValidation = { ok: false, issues: [{ code: 'unknown-part', severity: 'error', message: 'x', stepKey: 'mill' }] }
      const chip = chipOf(computeReadiness(input({ validation })), 'instructions')
      expect(chip.status).toBe('blocked')
      expect(chip.reasons[0]?.stepKeys).toEqual(['mill'])
    })
    it('needs attention on validation warnings only', () => {
      const validation: PlanValidation = { ok: true, issues: [{ code: 'dimension-in-prose', severity: 'warning', message: 'x' }] }
      const chip = chipOf(computeReadiness(input({ validation })), 'instructions')
      expect(chip.status).toBe('attention')
      expect(chip.reasons[0]?.stepKeys).toBeUndefined()
    })
  })

  describe('material and tools', () => {
    it('is not-tracked when lines lack attestations', () => {
      const result = computeReadiness(input({ attestations: { stock: {}, tools: {} } }))
      for (const dimension of ['material', 'tools'] as const) {
        const chip = chipOf(result, dimension)
        expect(chip.status).toBe('not-tracked')
        expect(chip.summary).toBe('Not tracked')
        expect(chip.reasons).toHaveLength(1)
      }
      expect(result.startGate.allowed).toBe(true)
      expect(result.startGate.softGaps).toHaveLength(2)
    })
    it('is not-tracked when only some lines are attested have', () => {
      const chip = chipOf(computeReadiness(input({ attestations: { stock: ALL_HAVE.stock, tools: { jointer: 'have' } } })), 'tools')
      expect(chip.status).toBe('not-tracked')
    })
    it('need outranks not-tracked, with step keys of consuming steps', () => {
      const result = computeReadiness(input({ attestations: { stock: { walnut: 'need' }, tools: {} } }))
      const material = chipOf(result, 'material')
      expect(material.status).toBe('attention')
      expect(material.summary).toBe('1 of 1 line needed')
      const plan = tinyEdgePlan()
      const consumers = plan.steps.filter((s) => s.inputs.some((i) => i.partKey === 'stock:walnut')).map((s) => s.key)
      expect(consumers.length).toBeGreaterThan(0)
      expect(material.reasons[0]?.stepKeys).toEqual(consumers)
    })
    it('lists steps using a needed tool', () => {
      const plan = tinyEdgePlan()
      const result = computeReadiness(input({ attestations: { ...ALL_HAVE, tools: { ...ALL_HAVE.tools, 'table-saw': 'need' } } }, plan))
      const tools = chipOf(result, 'tools')
      expect(tools.status).toBe('attention')
      expect(tools.summary).toBe('1 of 5 lines needed')
      expect(tools.reasons[0]?.stepKeys).toEqual(plan.steps.filter((s) => s.tools.some((t) => t.key === 'table-saw')).map((s) => s.key))
    })
    it('is ready when the plan requires nothing', () => {
      const plan = tinyEdgePlan()
      plan.requirements.stock = []
      plan.requirements.tools = []
      const result = computeReadiness(input({ attestations: { stock: {}, tools: {} } }, plan))
      expect(chipOf(result, 'material').status).toBe('ready')
      expect(chipOf(result, 'tools').status).toBe('ready')
    })
  })

  describe('warnings and decisions', () => {
    it('collects plan and step warnings but not errors', () => {
      const plan = tinyEdgePlan()
      plan.warnings.push({ id: 'a', severity: 'warning', message: 'plan-level' })
      plan.steps[0]!.warnings.push({ id: 'b', severity: 'warning', message: 'step-level', stepKey: plan.steps[0]!.key })
      plan.steps[1]!.warnings.push({ id: 'c', severity: 'error', message: 'step error', stepKey: plan.steps[1]!.key })
      const result = computeReadiness(input({}, plan))
      const chip = chipOf(result, 'warnings')
      expect(chip.status).toBe('attention')
      expect(chip.summary).toBe('2 warnings')
      expect(chip.reasons[1]?.stepKeys).toEqual([plan.steps[0]!.key])
      expect(chipOf(result, 'design').status).toBe('blocked')
    })
    it('flags pending decisions as soft gaps', () => {
      const result = computeReadiness(input({ decisions: [{ key: 'd', message: 'Pick a finish' }] }))
      expect(chipOf(result, 'decisions').status).toBe('attention')
      expect(chipOf(result, 'decisions').summary).toBe('1 decision pending')
      expect(result.startGate.softGaps.map((r) => r.message)).toEqual(['Pick a finish'])
      expect(result.startGate.allowed).toBe(true)
    })
  })

  describe('start gate', () => {
    it('hard blocks only from design and instruction errors', () => {
      const validation: PlanValidation = { ok: false, issues: [{ code: 'unknown-part', severity: 'error', message: 'bad plan' }, { code: 'dimension-in-prose', severity: 'warning', message: 'soft' }] }
      const result = computeReadiness(input({ validation, designWarnings: [designError, designWarn], attestations: { stock: { walnut: 'need' }, tools: {} }, decisions: [{ key: 'd', message: 'm' }] }))
      expect(result.startGate.allowed).toBe(false)
      expect(result.startGate.hardBlocks.map((r) => r.message)).toEqual(['Bad geometry', 'bad plan'])
      expect(result.startGate.hardBlocks.every((r) => r.severity === 'error')).toBe(true)
    })
    it('soft gaps exclude errors and cover needs, not-tracked, warnings, decisions', () => {
      const plan = tinyEdgePlan()
      plan.warnings.push({ id: 'a', severity: 'warning', message: 'plan-level' })
      const result = computeReadiness(input({ attestations: { stock: { walnut: 'need' }, tools: {} }, decisions: [{ key: 'd', message: 'decide' }] }, plan))
      expect(result.startGate.allowed).toBe(true)
      expect(result.startGate.hardBlocks).toEqual([])
      expect(result.startGate.softGaps).toHaveLength(4)
    })
  })
})
