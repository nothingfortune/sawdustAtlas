import { describe, expect, it } from 'vitest'
import { assembledSize, compositeCutPlan, panelPieces } from '../src/domain/compositeBoard'
import { generateBoardInstructionPlan } from '../src/domain/instructions/boardInstructions'
import { generateCompositeInstructionPlan } from '../src/domain/instructions/compositeInstructions'
import { validatePlan } from '../src/domain/instructions/validate'
import type { InstructionPlan } from '../src/domain/instructions/types'
import type { CompositeBoard } from '../src/types'
import { goldenWoods } from './fixtures/boards/edgeGrainGolden'
import { compositeGolden, compositeGoldenBoards } from './fixtures/boards/compositeGolden'

const boards = compositeGoldenBoards()
const context = { woods: goldenWoods, boards }

function allKeys(plan: InstructionPlan): string[] {
  // Keys are unique within each namespace (a phase and a cut ref may share text).
  const groups = [
    plan.phases.map(p => p.key), plan.steps.map(s => s.key), plan.parts.map(p => p.key), plan.assemblies.map(a => a.key),
    plan.requirements.stock.map(s => s.key), plan.requirements.cuts.map(c => c.id),
  ]
  return groups.flatMap((keys, index) => keys.map(key => `${index}|${key}`))
}

describe('generateCompositeInstructionPlan', () => {
  const composite = compositeGolden()
  const plan = generateCompositeInstructionPlan(composite, context)

  it('matches the golden plan snapshot', async () => {
    await expect(JSON.stringify(plan, null, 2) + '\n').toMatchFileSnapshot('./__golden__/composite.plan.json')
  })

  it('validates with zero issues and no error warnings', () => {
    expect(validatePlan(plan).issues).toEqual([])
    expect(plan.warnings.filter(w => w.severity === 'error')).toEqual([])
  })

  it('identifies the composite and has unique keys', () => {
    expect(plan.key).toBe('composite:golden-composite')
    expect(plan.source).toMatchObject({ kind: 'composite', projectId: 'golden-composite' })
    const keys = allKeys(plan)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('finished size matches assembledSize', () => {
    const size = assembledSize(composite, boards)
    expect(plan.finished).toEqual({ length: size.lengthMm, width: size.widthMm, thickness: size.thicknessMm })
    expect(plan.parts.find(p => p.key === 'board:golden-composite')?.dimensions).toEqual(plan.finished)
  })

  it('wafer counts and source lengths match the composite cut plan', () => {
    const legacy = compositeCutPlan(composite, boards).stages[0]!.steps
    composite.panels.forEach((panel, index) => {
      const text = legacy[index]!
      const count = Number(/into (\d+) wafers/.exec(text)![1])
      const source = Number(/needs ([\d.]+)mm of source/.exec(text)![1])
      const cut = plan.steps.find(s => s.key === `wafers:${panel.id}/cut`)!
      expect(cut.batch).toEqual({ count, unitLabel: 'wafer' })
      expect(count).toBe(panelPieces(panel, boards).length)
      expect(cut.measurements.find(m => m.key === 'source-length')!.target).toBeCloseTo(source, 9)
      expect(plan.parts.filter(p => p.kind === 'wafer' && p.sourceId === panel.id)).toHaveLength(count)
      expect(plan.requirements.cuts.find(c => c.id === `wafers:${panel.id}`)?.quantity).toBe(count)
    })
  })

  it('sets the stop block and kerf from the design on the wafer cut', () => {
    const cut = plan.steps.find(s => s.key === 'wafers:pA/cut')!
    expect(cut.machineSetup?.tool).toBe('crosscut-sled')
    expect(cut.machineSetup?.settings).toEqual([
      { label: 'Stop block distance', value: 40, unit: 'mm', source: 'design' },
      { label: 'Blade kerf', value: 3.2, unit: 'mm', source: 'design' },
    ])
    expect(plan.steps.find(s => s.key === 'wafers:pB/cut')!.machineSetup?.tool).toBe('table-saw')
    expect(cut.irreversible).toBe(true)
  })

  it('embeds panel plans with prefixed keys, labelled phases, and no finishing steps', () => {
    const embedded = generateBoardInstructionPlan(boards[0]!, { ...context, keyPrefix: 'panel:pA/', asCompositePanel: true })
    for (const step of embedded.steps) expect(plan.steps.some(s => s.key === step.key)).toBe(true)
    expect(plan.phases.find(p => p.key === 'panel:pA/prepare')?.title).toBe('P1: Prepare stock')
    expect(plan.phases.find(p => p.key === 'panel:pB/prepare')?.title).toBe('P2: Prepare stock')
    expect(plan.steps.some(s => s.key === 'panel:pA/surface' || s.key === 'panel:pA/finish')).toBe(false)
    expect(plan.requirements.stock.map(s => s.key)).toEqual(expect.arrayContaining(embedded.requirements.stock.map(s => s.key)))
    expect(plan.requirements.cuts.filter(c => c.stage === 'trim' && c.id.startsWith('panel:'))).toEqual([])
  })

  it('keeps step orders unique and consistent with dependencies', () => {
    const order = new Map(plan.steps.map(s => [s.key, s.order]))
    expect(new Set(order.values()).size).toBe(plan.steps.length)
    for (const step of plan.steps) for (const dep of step.dependsOn) expect(order.get(dep)!).toBeLessThan(step.order)
  })

  it('labels wafers by panel and position', () => {
    expect(plan.parts.find(p => p.key === 'wafer:pA:0')?.label).toBe('P1-1')
    expect(plan.parts.find(p => p.key === 'wafer:pB:2')?.label).toBe('P2-3')
  })

  it('arranges each row with a checklist entry per wafer and glues rows into the board', () => {
    const arrange = plan.steps.find(s => s.key === 'row:row1/arrange')!
    expect(arrange.checklist).toHaveLength(4)
    expect(arrange.checklist[1]!.text).toContain('a half turn')
    expect(arrange.checklist[1]!.text).toContain('flipped over')
    expect(plan.steps.find(s => s.key === 'row:row1/glue-wait')?.wait?.source).toBe('assumption')
    const final = plan.steps.find(s => s.key === 'final-glue-up')!
    expect(final.inputs.map(i => i.partKey)).toEqual(['row:row1', 'row:row2'])
    expect(plan.steps.at(-1)!.outputs[0]!.partKey).toBe('board:golden-composite')
  })

  it('keeps unplaced wafers in the plan as produced, unconsumed parts', () => {
    for (const key of ['wafer:pA:4', 'wafer:pA:5']) {
      expect(plan.steps.some(s => s.outputs.some(o => o.partKey === key))).toBe(true)
      expect(plan.steps.some(s => s.inputs.some(i => i.partKey === key))).toBe(false)
    }
    expect(plan.warnings).toEqual([])
  })

  it('builds one assembly per panel and per row with the board as parent', () => {
    const keys = plan.assemblies.map(a => a.key)
    expect(keys).toEqual(expect.arrayContaining(['assembly:panel:pA', 'assembly:panel:pB', 'assembly:row:row1', 'assembly:row:row2', 'assembly:board']))
    for (const a of plan.assemblies.filter(x => x.key !== 'assembly:board')) expect(a.parentKey).toBe('assembly:board')
  })

  it('is deterministic', () => {
    expect(generateCompositeInstructionPlan(compositeGolden(), context)).toEqual(plan)
  })
})

describe('composite failure cases', () => {
  it('a missing panel board is an error warning and the panel is skipped', () => {
    const composite = compositeGolden()
    const plan = generateCompositeInstructionPlan(composite, { woods: goldenWoods, boards: [boards[0]!] })
    const warning = plan.warnings.find(w => w.id === 'composite-panel-missing:pB')
    expect(warning?.severity).toBe('error')
    expect(warning?.location).toEqual({ view: 'boards', targetId: 'golden-composite' })
    expect(plan.steps.some(s => s.key.includes('pB'))).toBe(false)
    expect(plan.parts.some(p => p.key.includes('pB'))).toBe(false)
    expect(plan.steps.some(s => s.key === 'row:row2/arrange')).toBe(false)
    expect(plan.steps.some(s => s.key === 'row:row1/arrange')).toBe(true)
    expect(plan.parts.some(p => p.key === 'wafer:pA:0')).toBe(true)
    expect(validatePlan(plan).ok).toBe(true)
  })

  it('placed wafers from a skipped panel are dropped with a warning, not a crash', () => {
    const plan = generateCompositeInstructionPlan(compositeGolden(), { woods: goldenWoods, boards: [boards[0]!] })
    expect(plan.warnings.filter(w => w.id.startsWith('composite-wafer-missing:row2')).length).toBe(3)
  })

  it('two panels on the same board get distinct prefixed keys', () => {
    const composite: CompositeBoard = {
      ...compositeGolden(),
      panels: [
        { id: 'one', boardId: 'golden-edge', cut: { axis: 'x', stripWidthMm: 40, kerfMm: 3.2, count: 2 } },
        { id: 'two', boardId: 'golden-edge', cut: { axis: 'x', stripWidthMm: 40, kerfMm: 3.2, count: 2 } },
      ],
      rows: [{ id: 'r', wafers: [
        { panelId: 'one', pieceIndex: 0, rotate: 0, flip: false }, { panelId: 'one', pieceIndex: 1, rotate: 0, flip: false },
        { panelId: 'two', pieceIndex: 0, rotate: 0, flip: false }, { panelId: 'two', pieceIndex: 1, rotate: 0, flip: false },
      ] }],
    }
    const plan = generateCompositeInstructionPlan(composite, context)
    const keys = allKeys(plan)
    expect(new Set(keys).size).toBe(keys.length)
    expect(plan.parts.some(p => p.key === 'panel:one/panel:golden-edge')).toBe(true)
    expect(plan.parts.some(p => p.key === 'panel:two/panel:golden-edge')).toBe(true)
    expect(plan.requirements.stock).toHaveLength(2 * generateBoardInstructionPlan(boards[0]!, context).requirements.stock.length)
    expect(validatePlan(plan).issues).toEqual([])
  })

  it('a wafer placed twice is used once and the repeat is a warning', () => {
    const composite = compositeGolden()
    composite.rows[1]!.wafers.push({ panelId: 'pA', pieceIndex: 0, rotate: 0, flip: false })
    const plan = generateCompositeInstructionPlan(composite, context)
    expect(plan.warnings.some(w => w.id.startsWith('composite-wafer-duplicate:row2'))).toBe(true)
    expect(validatePlan(plan).issues).toEqual([])
  })

  it('a composite with no placed wafers reports an error and stops before assembly', () => {
    const plan = generateCompositeInstructionPlan({ ...compositeGolden(), rows: [] }, context)
    expect(plan.warnings.some(w => w.id === 'composite-no-rows' && w.severity === 'error')).toBe(true)
    expect(plan.steps.some(s => s.key === 'final-glue-up')).toBe(false)
    expect(plan.parts.filter(p => p.kind === 'wafer')).toHaveLength(9)
    // Panel assemblies must not point at a board assembly that was never created.
    expect(plan.assemblies.some(a => a.key === 'assembly:board')).toBe(false)
    expect(plan.assemblies.filter(a => a.parentKey !== undefined)).toEqual([])
    expect(validatePlan(plan).ok).toBe(true)
  })

  it('a panel that yields no wafers warns and produces no cut step', () => {
    const composite = compositeGolden()
    composite.panels[0]!.cut.count = 0
    composite.rows = composite.rows.filter(r => r.id === 'row2')
    const plan = generateCompositeInstructionPlan(composite, context)
    expect(plan.warnings.some(w => w.id === 'composite-panel-no-wafers:pA' && w.severity === 'warning')).toBe(true)
    expect(plan.steps.some(s => s.key === 'wafers:pA/cut')).toBe(false)
    expect(validatePlan(plan).ok).toBe(true)
  })

  it('an unbuildable panel board is an error and the panel is skipped', () => {
    const empty = { ...boards[0]!, strips: [] }
    const plan = generateCompositeInstructionPlan(compositeGolden(), { woods: goldenWoods, boards: [empty, boards[1]!] })
    expect(plan.warnings.some(w => w.id === 'composite-panel-empty:pA' && w.severity === 'error')).toBe(true)
    expect(plan.steps.some(s => s.key.includes('pA'))).toBe(false)
  })
})
