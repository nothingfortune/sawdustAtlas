import { toBoardFeet } from '../../src/domain/units'
import { withRevision } from '../../src/domain/instructions/revisions'
import { DEFAULT_GLUE_CLAMP_MINUTES, DEFAULT_TOLERANCES } from '../../src/domain/instructions/tolerances'
import type { InstructionPlan, InstructionStep, ToolRequirement } from '../../src/domain/instructions/types'

// Hand-built instruction plans shared by the instruction-platform tests. Each one is
// valid under every validator rule in the design spec; tests mutate a fresh copy to
// provoke one issue at a time. Build a new plan per test — the builders return fresh
// objects every call.

const TOOLS: Record<string, ToolRequirement> = {
  jointer: { key: 'jointer', name: 'Jointer', category: 'jointer' },
  planer: { key: 'planer', name: 'Thickness planer', category: 'planer' },
  tableSaw: { key: 'table-saw', name: 'Table saw', category: 'table-saw' },
  clamps: { key: 'clamps', name: 'Bar clamps', category: 'clamps' },
  glue: { key: 'glue', name: 'Wood glue', category: 'glue' },
}

/** A step with every list empty, for tests that assemble their own plans. */
export function makeStep(overrides: Partial<InstructionStep> & Pick<InstructionStep, 'key' | 'phaseKey' | 'order' | 'kind'>): InstructionStep {
  return {
    dependsOn: [],
    title: overrides.key,
    instruction: '',
    irreversible: false,
    inputs: [],
    outputs: [],
    tools: [],
    measurements: [],
    checklist: [],
    warnings: [],
    visual: { view: 'board-face', state: 'after', highlightPartKeys: [], ghostPartKeys: [], annotations: [] },
    cutIds: [],
    ...overrides,
  }
}

/**
 * A two-strip edge-grain board as one linear chain:
 * select-stock → mill → rip (batch of 2) → glue → cure (wait) → surface.
 */
export function tinyEdgePlan(): InstructionPlan {
  return withRevision({
    version: 1,
    key: 'board:tiny',
    source: { kind: 'board', projectId: 'tiny', projectName: 'Tiny board', designRevision: '2026-10-10T00:00:00.000Z' },
    construction: 'edge',
    units: 'mm',
    finished: { length: 480, width: 56, thickness: 20 },
    phases: [
      { key: 'prepare', order: 1, title: 'Prepare stock' },
      { key: 'rip', order: 2, title: 'Rip strips' },
      { key: 'glue', order: 3, title: 'Glue-up' },
      { key: 'finish', order: 4, title: 'Square and surface' },
    ],
    parts: [
      { key: 'stock:walnut', kind: 'stock', stage: 'rough', label: 'W', name: 'Walnut blank', speciesId: 'walnut', dimensions: { length: 500, width: 66, thickness: 25 } },
      { key: 'stock:walnut/milled', kind: 'stock', stage: 'milled', label: 'W', name: 'Milled walnut blank', speciesId: 'walnut', dimensions: { length: 500, width: 66, thickness: 22 } },
      { key: 'strip:s1', kind: 'strip', stage: 'cut', label: 'S1', name: 'Walnut strip S1', speciesId: 'walnut', sourceId: 's1', dimensions: { length: 500, width: 30, thickness: 22 } },
      { key: 'strip:s2', kind: 'strip', stage: 'cut', label: 'S2', name: 'Walnut strip S2', speciesId: 'walnut', sourceId: 's2', dimensions: { length: 500, width: 30, thickness: 22 } },
      { key: 'panel:tiny', kind: 'panel', stage: 'glued', label: 'P1', name: 'Glued panel', sourceId: 'tiny', dimensions: { length: 500, width: 60, thickness: 22 } },
      { key: 'board:tiny', kind: 'board', stage: 'surfaced', label: 'B1', name: 'Finished board', sourceId: 'tiny', dimensions: { length: 480, width: 56, thickness: 20 } },
    ],
    steps: [
      makeStep({
        key: 'select-stock', phaseKey: 'prepare', order: 1, kind: 'select-stock', title: 'Select stock',
        instruction: 'Pull the walnut blank and check it for defects.',
        outputs: [{ partKey: 'stock:walnut', quantity: 1 }],
        checklist: [{ key: 'defects', text: 'Blank is free of checks and loose knots', critical: false }],
        visual: { view: 'board-face', state: 'after', highlightPartKeys: ['stock:walnut'], ghostPartKeys: [], annotations: [] },
      }),
      makeStep({
        key: 'mill', phaseKey: 'prepare', order: 2, kind: 'mill', title: 'Mill stock', dependsOn: ['select-stock'], irreversible: true,
        instruction: 'Joint one face and one edge, then plane to thickness.',
        inputs: [{ partKey: 'stock:walnut', quantity: 1, consumed: true }],
        outputs: [{ partKey: 'stock:walnut/milled', quantity: 1 }],
        tools: [TOOLS['jointer']!, TOOLS['planer']!],
        measurements: [{ key: 'thickness', label: 'Milled thickness', target: 22, unit: 'mm', tolerance: { ...DEFAULT_TOLERANCES.thicknessMm }, critical: true, phase: 'achieve-after', partKey: 'stock:walnut/milled' }],
        checklist: [{ key: 'reference-face', text: 'Reference face is flat before planing', critical: true }],
        visual: { view: 'cross-section', state: 'after', highlightPartKeys: ['stock:walnut/milled'], ghostPartKeys: [], annotations: [] },
      }),
      makeStep({
        key: 'rip', phaseKey: 'rip', order: 3, kind: 'cut', title: 'Rip strips', dependsOn: ['mill'], irreversible: true,
        instruction: 'Rip both strips at one fence setting, reference edge against the fence.',
        batch: { count: 2, unitLabel: 'strip' },
        inputs: [{ partKey: 'stock:walnut/milled', quantity: 1, consumed: true }],
        outputs: [{ partKey: 'strip:s1', quantity: 1 }, { partKey: 'strip:s2', quantity: 1 }],
        tools: [TOOLS['tableSaw']!],
        machineSetup: { tool: 'table-saw', settings: [{ label: 'Fence to blade', value: 30, unit: 'mm', source: 'design' }] },
        measurements: [
          { key: 'fence', label: 'Fence to blade', target: 30, unit: 'mm', tolerance: { ...DEFAULT_TOLERANCES.ripWidthMm }, critical: true, phase: 'verify-before' },
          { key: 'width', label: 'Strip width', target: 30, unit: 'mm', tolerance: { ...DEFAULT_TOLERANCES.ripWidthMm }, critical: true, phase: 'achieve-after', partKey: 'strip:s1' },
        ],
        visual: { view: 'cut-diagram', state: 'before', highlightPartKeys: ['strip:s1', 'strip:s2'], ghostPartKeys: [], annotations: [{ kind: 'cut-line', text: 'Rip line' }] },
        cutIds: ['rip-1', 'rip-2'],
      }),
      makeStep({
        key: 'glue', phaseKey: 'glue', order: 4, kind: 'glue-clamp', title: 'Glue-up', dependsOn: ['rip'], irreversible: true,
        instruction: 'Glue the strips in order with reference faces up and clamp.',
        inputs: [{ partKey: 'strip:s1', quantity: 1, consumed: true }, { partKey: 'strip:s2', quantity: 1, consumed: true }],
        outputs: [{ partKey: 'panel:tiny', quantity: 1 }],
        tools: [TOOLS['clamps']!, TOOLS['glue']!],
        checklist: [{ key: 'dry-fit', text: 'Dry fit closes with no gaps', critical: true }],
        visual: { view: 'board-face', state: 'after', highlightPartKeys: ['panel:tiny'], ghostPartKeys: [], annotations: [] },
      }),
      makeStep({
        key: 'cure', phaseKey: 'glue', order: 5, kind: 'wait', title: 'Let the glue set', dependsOn: ['glue'],
        instruction: 'Leave the panel clamped.',
        inputs: [{ partKey: 'panel:tiny', quantity: 1, consumed: false }],
        wait: { minimumMinutes: DEFAULT_GLUE_CLAMP_MINUTES, reason: 'Glue clamp time', source: 'assumption' },
        duration: { minutes: DEFAULT_GLUE_CLAMP_MINUTES, kind: 'cure' },
        visual: { view: 'board-face', state: 'after', highlightPartKeys: [], ghostPartKeys: ['panel:tiny'], annotations: [] },
      }),
      makeStep({
        key: 'surface', phaseKey: 'finish', order: 6, kind: 'surface', title: 'Square and surface', dependsOn: ['cure'], irreversible: true,
        instruction: 'Square both ends, then surface both faces to final thickness.',
        inputs: [{ partKey: 'panel:tiny', quantity: 1, consumed: true }],
        outputs: [{ partKey: 'board:tiny', quantity: 1 }],
        tools: [TOOLS['planer']!, TOOLS['tableSaw']!],
        measurements: [
          { key: 'start-thickness', label: 'Panel thickness before surfacing', target: 22, unit: 'mm', tolerance: { ...DEFAULT_TOLERANCES.thicknessMm }, critical: false, phase: 'verify-before', partKey: 'panel:tiny' },
          { key: 'thickness', label: 'Finished thickness', target: 20, unit: 'mm', tolerance: { ...DEFAULT_TOLERANCES.thicknessMm }, critical: false, phase: 'achieve-after', partKey: 'board:tiny' },
        ],
        visual: { view: 'board-face', state: 'after', highlightPartKeys: ['board:tiny'], ghostPartKeys: [], annotations: [] },
        cutIds: ['trim-length'],
      }),
    ],
    assemblies: [{ key: 'panel', label: 'P1', name: 'Glued panel', partKeys: ['strip:s1', 'strip:s2'], stepKeys: ['glue'] }],
    requirements: {
      stock: [{ key: 'walnut', speciesId: 'walnut', speciesName: 'Walnut', quantity: 1, length: 500, width: 66, thickness: 25, boardFeet: toBoardFeet(500 * 66 * 25), partKey: 'stock:walnut' }],
      cuts: [
        { id: 'rip-1', label: 'Rip strip 1', stage: 'rip', quantity: 1 },
        { id: 'rip-2', label: 'Rip strip 2', stage: 'rip', quantity: 1 },
        { id: 'trim-length', label: 'Square both ends', stage: 'trim', quantity: 1 },
      ],
      tools: [TOOLS['jointer']!, TOOLS['planer']!, TOOLS['tableSaw']!, TOOLS['clamps']!, TOOLS['glue']!],
      consumables: ['Wood glue'],
    },
    warnings: [],
  })
}

/**
 * Two independent branches joined at a final glue-up, with a wait on branch A — the
 * shape a composite produces. Exercises step availability beyond a linear chain:
 *
 *   a-prep → a-glue → a-cure ─┐
 *                             ├→ join
 *   b-prep → b-cut ───────────┘
 */
export function branchingPlan(): InstructionPlan {
  const visual = (keys: string[]) => ({ view: 'assembly-layout' as const, state: 'after' as const, highlightPartKeys: keys, ghostPartKeys: [], annotations: [] })
  return withRevision({
    version: 1,
    key: 'composite:branch',
    source: { kind: 'composite', projectId: 'branch', projectName: 'Branching composite', designRevision: '2026-10-10T00:00:00.000Z' },
    construction: 'end',
    units: 'mm',
    finished: { length: 300, width: 200, thickness: 30 },
    phases: [
      { key: 'panels', order: 1, title: 'Panels' },
      { key: 'assembly', order: 2, title: 'Final assembly' },
    ],
    parts: [
      { key: 'stock:a', kind: 'stock', stage: 'rough', label: 'A', name: 'Stock A', speciesId: 'maple' },
      { key: 'stock:b', kind: 'stock', stage: 'rough', label: 'B', name: 'Stock B', speciesId: 'walnut' },
      { key: 'panel:a', kind: 'panel', stage: 'glued', label: 'PA', name: 'Panel A' },
      { key: 'wafer:b', kind: 'wafer', stage: 'cut', label: 'WB', name: 'Wafers B' },
      { key: 'board:branch', kind: 'board', stage: 'glued', label: 'B1', name: 'Composite board' },
    ],
    steps: [
      makeStep({ key: 'a-prep', phaseKey: 'panels', order: 1, kind: 'select-stock', outputs: [{ partKey: 'stock:a', quantity: 1 }], visual: visual(['stock:a']) }),
      makeStep({
        key: 'a-glue', phaseKey: 'panels', order: 2, kind: 'glue-clamp', dependsOn: ['a-prep'], irreversible: true,
        inputs: [{ partKey: 'stock:a', quantity: 1, consumed: true }], outputs: [{ partKey: 'panel:a', quantity: 1 }],
        checklist: [{ key: 'dry-fit', text: 'Dry fit closes', critical: true }], visual: visual(['panel:a']),
      }),
      makeStep({
        key: 'a-cure', phaseKey: 'panels', order: 3, kind: 'wait', dependsOn: ['a-glue'],
        inputs: [{ partKey: 'panel:a', quantity: 1, consumed: false }],
        wait: { minimumMinutes: 30, reason: 'Glue clamp time', source: 'assumption' }, visual: visual([]),
      }),
      makeStep({ key: 'b-prep', phaseKey: 'panels', order: 4, kind: 'select-stock', outputs: [{ partKey: 'stock:b', quantity: 1 }], visual: visual(['stock:b']) }),
      makeStep({
        key: 'b-cut', phaseKey: 'panels', order: 5, kind: 'cut', dependsOn: ['b-prep'], irreversible: true,
        inputs: [{ partKey: 'stock:b', quantity: 1, consumed: true }], outputs: [{ partKey: 'wafer:b', quantity: 1 }],
        measurements: [{ key: 'stop', label: 'Stop block', target: 25, unit: 'mm', tolerance: { ...DEFAULT_TOLERANCES.sliceThicknessMm }, critical: true, phase: 'verify-before' }],
        visual: visual(['wafer:b']), cutIds: ['wafers-b'],
      }),
      makeStep({
        key: 'join', phaseKey: 'assembly', order: 6, kind: 'glue-clamp', dependsOn: ['a-cure', 'b-cut'], irreversible: true,
        inputs: [{ partKey: 'panel:a', quantity: 1, consumed: true }, { partKey: 'wafer:b', quantity: 1, consumed: true }],
        outputs: [{ partKey: 'board:branch', quantity: 1 }],
        checklist: [{ key: 'dry-fit', text: 'Dry fit closes', critical: true }], visual: visual(['board:branch']),
      }),
    ],
    assemblies: [],
    requirements: {
      stock: [
        { key: 'a', speciesId: 'maple', speciesName: 'Hard maple', quantity: 1, length: 300, width: 100, thickness: 30, boardFeet: toBoardFeet(300 * 100 * 30), partKey: 'stock:a' },
        { key: 'b', speciesId: 'walnut', speciesName: 'Walnut', quantity: 1, length: 300, width: 100, thickness: 30, boardFeet: toBoardFeet(300 * 100 * 30), partKey: 'stock:b' },
      ],
      cuts: [{ id: 'wafers-b', label: 'Crosscut wafers', stage: 'crosscut', quantity: 1 }],
      tools: [],
      consumables: [],
    },
    warnings: [],
  })
}
