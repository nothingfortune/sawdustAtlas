import { describe, expect, it } from 'vitest'
import { calculateBuildDimensions } from '../src/domain/boardAllowances'
import { calculateAngleSetup } from '../src/domain/boardAngle'
import { summarizeBenchSetup } from '../src/domain/boardBench'
import { generateCuttingBoardPlan } from '../src/domain/boardCutPlan'
import { calculateEndGrainMetrics } from '../src/domain/boardGeometry'
import { applyBoardPattern, BOARD_PATTERNS } from '../src/domain/boardPatterns'
import { generateBoardInstructionPlan, generateEdgeGrainPlan, generateEndGrainPlan } from '../src/domain/instructions/boardInstructions'
import { sliceLetter } from '../src/domain/instructions/boardMarking'
import { validatePlan } from '../src/domain/instructions/validate'
import type { InstructionPlan } from '../src/domain/instructions/types'
import type { BoardProject } from '../src/types'
import { edgeGrainGolden, goldenWoods } from './fixtures/boards/edgeGrainGolden'
import { endGrainGolden } from './fixtures/boards/endGrainGolden'

const context = { woods: goldenWoods, boards: [] as BoardProject[] }
const UNIT_IN_PROSE = /\d\s*(?:mm|cm|in\b|inch|"|°|deg)/i

function allKeys(plan: InstructionPlan): string[] {
  return [
    ...plan.phases.map(p => p.key), ...plan.steps.map(s => s.key), ...plan.parts.map(p => p.key), ...plan.assemblies.map(a => a.key),
    ...plan.requirements.stock.map(s => s.key), ...plan.requirements.cuts.map(c => c.id),
  ]
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

describe('generateEndGrainPlan', () => {
  const project = endGrainGolden()
  const metrics = calculateEndGrainMetrics(project)
  const plan = generateEndGrainPlan(project, context)

  it('golden fixture is a clean design with seven slices', () => {
    expect(metrics.errors).toEqual([])
    expect(metrics.sliceCount).toBe(7)
  })

  it('matches the golden plan snapshot', async () => {
    await expect(JSON.stringify(plan, null, 2) + '\n').toMatchFileSnapshot('./__golden__/end-grain.plan.json')
  })

  it('validates with zero issues', () => {
    expect(validatePlan(plan).issues).toEqual([])
  })

  it('has parity with the legacy cutting board plan', () => {
    const legacy = generateCuttingBoardPlan(project, goldenWoods)
    expect(plan.requirements.stock).toHaveLength(legacy.stock.length)
    for (const [i, req] of legacy.stock.entries()) {
      expect(plan.requirements.stock[i]).toMatchObject({ speciesId: req.speciesId, quantity: req.quantity, length: req.length, width: req.width, thickness: req.thickness, boardFeet: req.boardFeet })
    }
    expect(plan.requirements.cuts).toEqual(legacy.cuts.map(c => ({ id: c.id, label: c.label, stage: c.stage, quantity: c.quantity })))
    const covered = new Set(plan.steps.flatMap(s => s.cutIds))
    for (const cut of legacy.cuts) expect(covered.has(cut.id)).toBe(true)
  })

  it('follows the end-grain phase sequence', () => {
    expect(plan.phases.map(p => p.title)).toEqual(['Prepare stock', 'Rip strips', 'First glue-up', 'Crosscut slices', 'Final glue-up', 'Square and surface'])
    expect(plan.steps.filter(s => !s.key.startsWith('rip:')).map(s => s.key)).toEqual([
      'select-stock', 'mill', 'mark-strips', 'dry-fit', 'glue-up', 'glue-wait', 'flatten-panel',
      'mark-reference', 'crosscut', 'mark-slices', 'arrange-slices', 'final-dry-fit', 'final-glue-up', 'final-glue-wait',
      'square-board', 'surface', 'finish',
    ])
    expect(plan.steps.filter(s => s.kind === 'wait')).toHaveLength(2)
  })

  it('batches the crosscut over every slice with the stop block equal to slice thickness', () => {
    const crosscut = plan.steps.find(s => s.key === 'crosscut')!
    expect(crosscut.batch).toEqual({ count: metrics.sliceCount, unitLabel: 'slice' })
    expect(crosscut.outputs).toHaveLength(metrics.sliceCount)
    expect(crosscut.cutIds).toEqual(['crosscut-slices'])
    const stop = crosscut.measurements.find(m => m.key === 'stop-block')!
    expect(stop).toMatchObject({ target: project.endGrain.sliceThickness, phase: 'verify-before', critical: true })
    expect(crosscut.machineSetup?.settings.find(s => s.label === 'Saw kerf')?.value).toBe(project.endGrain.kerf)
  })

  it('splits rip groups, giving angled groups a critical bevel check from calculateAngleSetup', () => {
    const bench = summarizeBenchSetup(project, goldenWoods, calculateBuildDimensions(project, metrics), metrics)
    const rips = plan.steps.filter(s => s.key.startsWith('rip:'))
    expect(rips.map(s => s.batch?.count).sort()).toEqual(bench.ripGroups.map(g => g.count).sort())
    const angled = rips.filter(s => s.measurements.some(m => m.key === 'bevel'))
    expect(angled).toHaveLength(2)
    const expected = calculateAngleSetup({ trailingAngleDeg: 12, stockThicknessMm: 38, stripLengthMm: 400 }).sawAngleDeg
    for (const rip of angled) {
      expect(rip.measurements.find(m => m.key === 'bevel')).toMatchObject({ unit: 'deg', target: expected, phase: 'verify-before', critical: true })
      expect(rip.title).toContain('bevel')
    }
    const square = rips.filter(s => !s.measurements.some(m => m.key === 'bevel'))
    expect(square.length).toBe(rips.length - 2)
    for (const rip of square) expect(rip.machineSetup?.settings.every(v => v.unit === 'mm')).toBe(true)
    expect(plan.steps.find(s => s.key === 'mark-strips')?.inputs).toHaveLength(project.strips.length)
  })

  it('lays rip fence and stock widths from the rough stock widths including the angle shift', () => {
    const bench = summarizeBenchSetup(project, goldenWoods, calculateBuildDimensions(project, metrics), metrics)
    const fences = plan.steps.filter(s => s.key.startsWith('rip:')).map(s => s.measurements.find(m => m.key === 'fence')!.target).sort((a, b) => a - b)
    expect(fences).toEqual(bench.ripGroups.map(g => g.roughRipWidthMm).sort((a, b) => a - b))
  })

  it('lists slices in physical order with positions, rotations, and flips from the design', () => {
    const arrange = plan.steps.find(s => s.key === 'arrange-slices')!
    // rowOrder places physical slice D (3) at position 1, A (0) at 2, B (1) at 3, C (2) at 4, G (6) at 5, F (5) at 6, E (4) at 7.
    expect(arrange.checklist.map(c => c.text)).toEqual([
      'Position 1: slice D, as cut',
      'Position 2: slice A, turned end for end',
      'Position 3: slice B, flipped over',
      'Position 4: slice C, as cut',
      'Position 5: slice G, turned end for end and flipped over',
      'Position 6: slice F, flipped over',
      'Position 7: slice E, turned end for end',
    ])
    expect(arrange.inputs.map(i => i.partKey)).toEqual(Array.from({ length: 7 }, (_, i) => `slice:golden-end:${i}`))
    const letters = plan.steps.find(s => s.key === 'mark-slices')!.checklist.map(c => c.text)
    expect(letters).toHaveLength(7)
    expect(letters[2]).toContain(sliceLetter(2))
  })

  it('carries no unit-bearing number in titles or instructions', () => {
    for (const step of plan.steps) {
      expect(step.title).not.toMatch(UNIT_IN_PROSE)
      expect(step.instruction).not.toMatch(UNIT_IN_PROSE)
      for (const item of step.checklist) expect(item.text).not.toMatch(UNIT_IN_PROSE)
    }
  })

  it('has stable keys across generations, and an unrelated strip edit leaves other keys alone', () => {
    expect(allKeys(generateEndGrainPlan(project, context))).toEqual(allKeys(plan))
    const edited = endGrainGolden()
    edited.strips[4] = { ...edited.strips[4]!, width: 33 } // the only cherry strip
    const next = generateEndGrainPlan(edited, context)
    const after = new Set(allKeys(next))
    const removed = allKeys(plan).filter(k => !after.has(k))
    expect(removed.length).toBeGreaterThan(0)
    // Only the edited strip's own rip group and stock line change identity.
    expect(removed.every(k => k.includes('cherry'))).toBe(true)
    for (const k of allKeys(plan)) if (!k.includes('cherry')) expect(after.has(k)).toBe(true)
    expect(validatePlan(next).issues).toEqual([])
  })

  it('slice keys do not change when slice transforms are edited', () => {
    const edited = endGrainGolden()
    edited.endGrain.rowOrder = [0, 1, 2, 3, 4, 5, 6]
    edited.endGrain.rowFlips = []
    expect(allKeys(generateEndGrainPlan(edited, context)).filter(k => k.startsWith('slice:')).sort())
      .toEqual(allKeys(plan).filter(k => k.startsWith('slice:')).sort())
  })

  it('applies keyPrefix to every key and validates', () => {
    const prefixed = generateEndGrainPlan(project, { ...context, keyPrefix: 'panel:p2/' })
    for (const key of allKeys(prefixed)) expect(key.startsWith('panel:p2/')).toBe(true)
    expect(validatePlan(prefixed).issues).toEqual([])
  })

  it('as a composite panel ends at the glued board with no squaring, surfacing, or finish', () => {
    const panel = generateEndGrainPlan(project, { ...context, asCompositePanel: true })
    expect(panel.steps.at(-1)?.key).toBe('final-glue-wait')
    expect(panel.steps.some(s => ['square-board', 'surface', 'finish'].includes(s.key))).toBe(false)
    expect(panel.requirements.cuts.some(c => c.stage === 'trim')).toBe(false)
    expect(validatePlan(panel).issues).toEqual([])
  })

  it('omits the squaring step when the allowances are zero', () => {
    const tight = endGrainGolden()
    tight.allowances = { jointing: 0, planing: 0, routerTable: 0, ripAllowance: 0, lengthTrim: 0, widthTrim: 0 }
    const next = generateEndGrainPlan(tight, context)
    expect(next.steps.some(s => s.key === 'square-board')).toBe(false)
    expect(validatePlan(next).issues).toEqual([])
  })

  it('turns end-grain metric errors into error warnings and other legacy warnings into warnings', () => {
    const bad = endGrainGolden()
    bad.strips[1] = { ...bad.strips[1]!, width: 5, trailingAngle: -80 }
    const badMetrics = calculateEndGrainMetrics(bad)
    expect(badMetrics.errors.length).toBeGreaterThan(0)
    const next = generateEndGrainPlan(bad, context)
    const errors = next.warnings.filter(w => w.severity === 'error').map(w => w.message)
    expect(errors).toEqual(badMetrics.errors)
    expect(validatePlan(next).issues).toEqual([])
    for (const w of next.warnings) expect(w.location).toEqual({ view: 'boards', targetId: bad.id })
    expect(next.warnings.filter(w => w.severity === 'warning').map(w => w.message)).toEqual(
      generateCuttingBoardPlan(bad, goldenWoods).warnings.filter(m => !badMetrics.errors.includes(m)),
    )
  })

  it('returns an empty plan carrying the errors when the design yields no slices', () => {
    const none = endGrainGolden()
    none.endGrain.sliceThickness = 0
    const next = generateEndGrainPlan(none, context)
    expect(next.steps).toEqual([])
    expect(next.requirements.cuts).toEqual([])
    expect(next.warnings.some(w => w.severity === 'error')).toBe(true)
    expect(validatePlan(next).ok).toBe(true)
  })

  it('explains an empty plan when the source is too short for a single slice', () => {
    const short = endGrainGolden()
    short.endGrain.sourceLength = 10
    expect(calculateEndGrainMetrics(short).sliceCount).toBe(0)
    const next = generateEndGrainPlan(short, context)
    expect(next.steps).toEqual([])
    expect(next.warnings.map(w => w.severity)).toEqual(['error'])
    expect(validatePlan(next).ok).toBe(true)
  })

  it('does not mutate the project it is given', () => {
    const frozen = deepFreeze(endGrainGolden())
    const before = JSON.stringify(frozen)
    expect(() => generateEndGrainPlan(frozen, context)).not.toThrow()
    expect(JSON.stringify(frozen)).toBe(before)
  })

  it('letters more than 26 slices past Z and still validates', () => {
    const long = endGrainGolden()
    long.endGrain.sourceLength = 2400
    long.endGrain.rowOrder = []
    long.endGrain.rowFlips = []
    long.endGrain.rowRotations = []
    const next = generateEndGrainPlan(long, context)
    const slices = next.parts.filter(p => p.kind === 'slice')
    expect(slices.length).toBeGreaterThan(26)
    expect(slices[26]?.label).toBe('AA')
    expect(new Set(slices.map(p => p.key)).size).toBe(slices.length)
    expect(validatePlan(next).issues).toEqual([])
  })

  it('returns an empty plan for a board with no strips', () => {
    const none = endGrainGolden()
    none.strips = []
    expect(generateEndGrainPlan(none, context).steps).toEqual([])
  })
})

describe('generateBoardInstructionPlan', () => {
  it('dispatches on construction', () => {
    const edge = edgeGrainGolden()
    const end = endGrainGolden()
    expect(generateBoardInstructionPlan(edge, context)).toEqual(generateEdgeGrainPlan(edge, context))
    expect(generateBoardInstructionPlan(end, context)).toEqual(generateEndGrainPlan(end, context))
    expect(generateBoardInstructionPlan(end, context).construction).toBe('end')
  })

  describe.each(BOARD_PATTERNS.map(p => p.id))('pattern %s', patternId => {
    it.each(['edge', 'end'] as const)('validates with stable keys as %s grain', construction => {
      let counter = 0
      const base = endGrainGolden()
      const applied = applyBoardPattern(patternId, base, goldenWoods, 7, () => `p${++counter}`)
      const board: BoardProject = { ...base, id: `preset-${patternId}`, construction, strips: applied.strips, endGrain: applied.endGrain }
      const plan = generateBoardInstructionPlan(board, context)
      expect(plan.steps.length).toBeGreaterThan(0)
      expect(validatePlan(plan).issues).toEqual([])
      expect(allKeys(generateBoardInstructionPlan(board, context))).toEqual(allKeys(plan))
      expect(generateBoardInstructionPlan(board, context).revision).toBe(plan.revision)
      const covered = new Set(plan.steps.flatMap(s => s.cutIds))
      for (const cut of plan.requirements.cuts) expect(covered.has(cut.id)).toBe(true)
    })
  })
})
