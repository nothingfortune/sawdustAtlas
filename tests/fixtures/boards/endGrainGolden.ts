import { DEFAULT_ALLOWANCES } from '../../../src/domain/boardAllowances'
import type { BoardProject } from '../../../src/types'

// Golden end-grain board: five strips with two angled (mirrored bevels), a short source so
// the slice count stays readable (seven slices), a permuted rowOrder, and rotations and
// flips set per assembled position. The plan generated from this board is snapshotted to
// tests/__golden__/end-grain.plan.json and still needs hand-verification by Alex against
// a real build.

export function endGrainGolden(): BoardProject {
  return {
    id: 'golden-end',
    name: 'Golden end-grain board',
    length: 300,
    thickness: 45,
    construction: 'end',
    updatedAt: '2026-10-10T00:00:00.000Z',
    endGrain: {
      sourceLength: 400,
      stockThickness: 38,
      sliceThickness: 45,
      kerf: 3.2,
      trimAllowance: 20,
      rowOrder: [3, 0, 1, 2, 6, 5, 4],
      rowRotations: [false, true, false, false, true, false, true],
      rowFlips: [false, false, true, false, true, true, false],
      rowOffsets: [],
    },
    allowances: { ...DEFAULT_ALLOWANCES },
    strips: [
      { id: 'g1', speciesId: 'walnut', width: 40, trailingAngle: 0 },
      { id: 'g2', speciesId: 'maple', width: 40, trailingAngle: 12 },
      { id: 'g3', speciesId: 'walnut', width: 40, trailingAngle: -12 },
      { id: 'g4', speciesId: 'maple', width: 40, trailingAngle: 0 },
      { id: 'g5', speciesId: 'cherry', width: 40, trailingAngle: 0 },
    ],
  }
}
