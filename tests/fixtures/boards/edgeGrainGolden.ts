import { DEFAULT_ALLOWANCES } from '../../../src/domain/boardAllowances'
import { DEFAULT_END_GRAIN, defaultSpecies } from '../../../src/data'
import type { BoardProject } from '../../../src/types'

// Golden edge-grain board: three species, seven strips, default milling allowances.
// Strip ids are fixed so the snapshotted plan keys are reproducible. The plan generated
// from this board is snapshotted to tests/__golden__/edge-grain.plan.json and still needs
// hand-verification by Alex against a real build.

export const goldenWoods = defaultSpecies.map(wood => ({ ...wood }))

export function edgeGrainGolden(): BoardProject {
  return {
    id: 'golden-edge',
    name: 'Golden edge-grain board',
    length: 460,
    thickness: 38,
    construction: 'edge',
    updatedAt: '2026-10-10T00:00:00.000Z',
    endGrain: { ...DEFAULT_END_GRAIN, rowFlips: [], rowRotations: [] },
    allowances: { ...DEFAULT_ALLOWANCES },
    strips: [
      { id: 'e1', speciesId: 'walnut', width: 50, trailingAngle: 0 },
      { id: 'e2', speciesId: 'maple', width: 25, trailingAngle: 0 },
      { id: 'e3', speciesId: 'cherry', width: 38, trailingAngle: 0 },
      { id: 'e4', speciesId: 'maple', width: 25, trailingAngle: 0 },
      { id: 'e5', speciesId: 'walnut', width: 38, trailingAngle: 0 },
      { id: 'e6', speciesId: 'maple', width: 25, trailingAngle: 0 },
      { id: 'e7', speciesId: 'walnut', width: 50, trailingAngle: 0 },
    ],
  }
}
