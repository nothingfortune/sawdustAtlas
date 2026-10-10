import { describe, expect, it } from 'vitest'
import { calculateBuildDimensions } from '../src/domain/boardAllowances'
import { generateCuttingBoardPlan } from '../src/domain/boardCutPlan'
import { calculateEndGrainMetrics } from '../src/domain/boardGeometry'
import { summarizeBenchSetup } from '../src/domain/boardBench'
import { generateEdgeGrainPlan } from '../src/domain/instructions/boardInstructions'
import { validatePlan } from '../src/domain/instructions/validate'
import { DEFAULT_GLUE_CLAMP_MINUTES } from '../src/domain/instructions/tolerances'
import type { InstructionPlan } from '../src/domain/instructions/types'
import type { BoardProject } from '../src/types'
import { edgeGrainGolden, goldenWoods } from './fixtures/boards/edgeGrainGolden'

const context = { woods: goldenWoods, boards: [] as BoardProject[] }
const UNIT_IN_PROSE = /\d\s*(?:mm|cm|in\b|inch|"|°|deg)/i

function allKeys(plan: InstructionPlan): string[] {
  return [
    ...plan.phases.map(p => p.key), ...plan.steps.map(s => s.key), ...plan.parts.map(p => p.key), ...plan.assemblies.map(a => a.key),
    ...plan.requirements.stock.map(s => s.key), ...plan.requirements.cuts.map(c => c.id),
  ]
}

describe('generateEdgeGrainPlan', () => {
  const project = edgeGrainGolden()
  const plan = generateEdgeGrainPlan(project, context)

  it('matches the golden plan snapshot', async () => {
    await expect(JSON.stringify(plan, null, 2) + '\n').toMatchFileSnapshot('./__golden__/edge-grain.plan.json')
  })

  it('validates with zero errors and zero issues', () => {
    const result = validatePlan(plan)
    expect(result.issues).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('has parity with the legacy cutting board plan', () => {
    const legacy = generateCuttingBoardPlan(project, goldenWoods)
    expect(plan.requirements.stock).toHaveLength(legacy.stock.length)
    for (const [i, req] of legacy.stock.entries()) {
      const line = plan.requirements.stock[i]!
      expect(line).toMatchObject({ speciesId: req.speciesId, speciesName: req.speciesName, quantity: req.quantity, length: req.length, width: req.width, thickness: req.thickness, boardFeet: req.boardFeet })
    }
    expect(plan.requirements.cuts).toEqual(legacy.cuts.map(c => ({ id: c.id, label: c.label, stage: c.stage, quantity: c.quantity })))
    const covered = new Set(plan.steps.flatMap(s => s.cutIds))
    for (const cut of legacy.cuts) expect(covered.has(cut.id)).toBe(true)
  })

  it('takes finished size and rough sizes from the existing engines', () => {
    const build = calculateBuildDimensions(project, calculateEndGrainMetrics(project))
    expect(plan.finished).toEqual({ length: build.length.finished, width: build.width.finished, thickness: build.thickness.finished })
    const mill = plan.steps.find(s => s.kind === 'mill')!
    const milled = build.thickness.rough - build.thickness.jointing - build.thickness.planing
    expect(mill.measurements.find(m => m.key === 'thickness')?.target).toBe(milled)
    const surface = plan.steps.find(s => s.kind === 'surface')!
    expect(surface.measurements.find(m => m.key === 'thickness')?.target).toBe(build.thickness.finished)
  })

  it('carries no unit-bearing number in titles or instructions', () => {
    for (const step of plan.steps) {
      expect(step.title).not.toMatch(UNIT_IN_PROSE)
      expect(step.instruction).not.toMatch(UNIT_IN_PROSE)
    }
  })

  it('produces identical keys on two generations', () => {
    expect(allKeys(generateEdgeGrainPlan(project, context))).toEqual(allKeys(plan))
    expect(generateEdgeGrainPlan(project, context).revision).toBe(plan.revision)
  })

  it('keeps unrelated keys unchanged when one strip is edited', () => {
    const edited = edgeGrainGolden()
    edited.strips[2] = { ...edited.strips[2]!, width: 44 } // the only cherry strip
    const next = generateEdgeGrainPlan(edited, context)
    const before = new Set(allKeys(plan))
    const after = new Set(allKeys(next))
    const removed = [...before].filter(k => !after.has(k))
    // Only the edited strip's own rip group and stock line change identity.
    expect(removed.every(k => k.includes('cherry'))).toBe(true)
    expect(removed.length).toBeGreaterThan(0)
    for (const k of before) if (!k.includes('cherry')) expect(after.has(k)).toBe(true)
    expect(validatePlan(next).ok).toBe(true)
  })

  it('derives step and part keys from identity, not position', () => {
    const reordered = edgeGrainGolden()
    reordered.strips = [...reordered.strips].reverse()
    const next = generateEdgeGrainPlan(reordered, context)
    expect(next.parts.filter(p => p.kind === 'strip').map(p => p.key).sort()).toEqual(plan.parts.filter(p => p.kind === 'strip').map(p => p.key).sort())
    expect(validatePlan(next).ok).toBe(true)
  })

  it('batch counts equal rip-group sizes and every strip is ripped exactly once', () => {
    const bench = summarizeBenchSetup(project, goldenWoods, calculateBuildDimensions(project), calculateEndGrainMetrics(project))
    const rips = plan.steps.filter(s => s.key.startsWith('rip:'))
    expect(rips).toHaveLength(bench.ripGroups.length)
    expect(rips.map(s => s.batch?.count).sort()).toEqual(bench.ripGroups.map(g => g.count).sort())
    expect(rips.reduce((n, s) => n + (s.batch?.count ?? 0), 0)).toBe(project.strips.length)
    expect(rips.every(s => s.batch?.unitLabel === 'strip')).toBe(true)
    expect(rips.flatMap(s => s.outputs.map(o => o.partKey)).sort()).toEqual(project.strips.map(s => `strip:${s.id}`).sort())
  })

  it('rip steps have a critical verify-before fence setting from the design', () => {
    for (const rip of plan.steps.filter(s => s.key.startsWith('rip:'))) {
      const fence = rip.measurements.find(m => m.key === 'fence')!
      expect(fence).toMatchObject({ phase: 'verify-before', critical: true })
      expect(rip.machineSetup?.settings[0]?.source).toBe('design')
      expect(rip.irreversible).toBe(true)
    }
  })

  it('waits after the glue-up as an assumption', () => {
    const wait = plan.steps.find(s => s.kind === 'wait')!
    expect(wait.wait).toEqual({ minimumMinutes: DEFAULT_GLUE_CLAMP_MINUTES, reason: 'Glue clamp time', source: 'assumption' })
    expect(wait.dependsOn).toEqual(['glue-up'])
  })

  it('marks strips S1..Sn from the part marking scheme', () => {
    const mark = plan.steps.find(s => s.key === 'mark-strips')!
    expect(mark.checklist).toHaveLength(project.strips.length)
    expect(plan.parts.filter(p => p.kind === 'strip').map(p => p.label)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'])
  })

  it('lists each step tool once in requirements', () => {
    const keys = plan.requirements.tools.map(t => t.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const step of plan.steps) for (const tool of step.tools) expect(keys).toContain(tool.key)
  })

  it('applies keyPrefix to every key', () => {
    const prefixed = generateEdgeGrainPlan(project, { ...context, keyPrefix: 'panel:p9/' })
    for (const key of allKeys(prefixed)) expect(key.startsWith('panel:p9/')).toBe(true)
    for (const step of prefixed.steps) {
      for (const dep of step.dependsOn) expect(dep.startsWith('panel:p9/')).toBe(true)
      for (const io of [...step.inputs, ...step.outputs]) expect(io.partKey.startsWith('panel:p9/')).toBe(true)
    }
    expect(validatePlan(prefixed).issues).toEqual([])
    expect(prefixed.key).toBe(plan.key)
  })

  it('as a composite panel omits squaring, surfacing, finish, and trim cut refs', () => {
    const panel = generateEdgeGrainPlan(project, { ...context, asCompositePanel: true })
    expect(panel.steps.map(s => s.kind)).not.toContain('surface')
    expect(panel.steps.map(s => s.kind)).not.toContain('finish')
    expect(panel.steps.some(s => s.key.startsWith('trim-'))).toBe(false)
    expect(panel.phases.map(p => p.key)).not.toContain('finish')
    expect(panel.requirements.cuts.some(c => c.stage === 'trim')).toBe(false)
    expect(panel.requirements.cuts.filter(c => c.stage === 'rip')).toHaveLength(project.strips.length)
    expect(panel.parts.some(p => p.kind === 'board')).toBe(false)
    expect(panel.steps.at(-1)?.kind).toBe('wait')
    expect(validatePlan(panel).issues).toEqual([])
  })

  it('skips trim steps when the allowances are zero and still validates', () => {
    const tight = edgeGrainGolden()
    tight.allowances = { jointing: 0, planing: 0, routerTable: 0, ripAllowance: 0, lengthTrim: 0, widthTrim: 0 }
    const next = generateEdgeGrainPlan(tight, context)
    expect(next.steps.some(s => s.key.startsWith('trim-'))).toBe(false)
    expect(next.steps.find(s => s.key === 'surface')?.measurements.some(m => m.key === 'length')).toBe(true)
    expect(validatePlan(next).issues).toEqual([])
  })

  it('merges identical interior strips into one rip group', () => {
    const same = edgeGrainGolden()
    same.strips = [
      { id: 'a', speciesId: 'maple', width: 30, trailingAngle: 0 },
      { id: 'b', speciesId: 'walnut', width: 30, trailingAngle: 0 },
      { id: 'c', speciesId: 'maple', width: 30, trailingAngle: 0 },
      { id: 'd', speciesId: 'maple', width: 30, trailingAngle: 0 },
      { id: 'e', speciesId: 'walnut', width: 30, trailingAngle: 0 },
    ]
    const next = generateEdgeGrainPlan(same, context)
    const rips = next.steps.filter(s => s.key.startsWith('rip:'))
    expect(rips.map(s => s.batch?.count)).toEqual([1, 1, 2, 1]) // outer strips carry the width-trim allowance, so they form their own groups
    expect(validatePlan(next).issues).toEqual([])
  })

  it('returns an empty, valid plan with the legacy warning for a board with no strips', () => {
    const empty = edgeGrainGolden()
    empty.strips = []
    const next = generateEdgeGrainPlan(empty, context)
    expect(next.steps).toEqual([])
    expect(next.requirements.cuts).toEqual([])
    expect(next.warnings).toEqual([{ id: 'board-warning-1', severity: 'warning', message: 'Add at least one strip before generating a build plan.', location: { view: 'boards', targetId: empty.id } }])
    expect(validatePlan(next).ok).toBe(true)
  })
})

describe('generateEdgeGrainPlan assemblies', () => {
  it('parents the glued-panel assembly to the board assembly, and has none for a composite panel', () => {
    const project = edgeGrainGolden()
    const plan = generateEdgeGrainPlan(project, context)
    const board = plan.assemblies.find(a => a.key === 'assembly:board')!
    expect(plan.assemblies.find(a => a.key === 'assembly:panel')?.parentKey).toBe(board.key)
    expect(board.parentKey).toBeUndefined()
    const panel = generateEdgeGrainPlan(project, { ...context, asCompositePanel: true })
    expect(panel.assemblies.map(a => a.key)).toEqual(['assembly:panel'])
    expect(panel.assemblies[0]?.parentKey).toBeUndefined()
  })
})
