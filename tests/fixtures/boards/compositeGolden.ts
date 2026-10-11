import { DEFAULT_ALLOWANCES } from '../../../src/domain/boardAllowances'
import { DEFAULT_END_GRAIN } from '../../../src/data'
import type { BoardProject, CompositeBoard } from '../../../src/types'
import { edgeGrainGolden } from './edgeGrainGolden'

// Golden two-panel composite: panel pA crosscuts the golden edge-grain board into six
// wafers (four placed, two left as spares); panel pB rips a thinner second edge board into
// three wafers, all placed turned on their side in a second row. Ids are fixed so the
// plan snapshotted to tests/__golden__/composite.plan.json has reproducible keys. That
// plan still needs hand-verification by Alex against a real build.

export function compositeDonorBoard(): BoardProject {
  return {
    id: 'golden-donor',
    name: 'Golden donor board',
    length: 300,
    thickness: 30,
    construction: 'edge',
    updatedAt: '2026-10-10T00:00:00.000Z',
    endGrain: { ...DEFAULT_END_GRAIN, rowFlips: [], rowRotations: [] },
    allowances: { ...DEFAULT_ALLOWANCES },
    strips: [
      { id: 'd1', speciesId: 'walnut', width: 50, trailingAngle: 0 },
      { id: 'd2', speciesId: 'maple', width: 50, trailingAngle: 0 },
      { id: 'd3', speciesId: 'cherry', width: 50, trailingAngle: 0 },
    ],
  }
}

export function compositeGoldenBoards(): BoardProject[] {
  return [edgeGrainGolden(), compositeDonorBoard()]
}

export function compositeGolden(): CompositeBoard {
  return {
    id: 'golden-composite',
    name: 'Golden composite board',
    construction: 'edge',
    updatedAt: '2026-10-10T00:00:00.000Z',
    panels: [
      { id: 'pA', boardId: 'golden-edge', cut: { axis: 'x', stripWidthMm: 40, kerfMm: 3.2, count: 6 } },
      { id: 'pB', boardId: 'golden-donor', cut: { axis: 'y', stripWidthMm: 30, kerfMm: 3.2, count: 3 } },
    ],
    rows: [
      {
        id: 'row1',
        wafers: [
          { panelId: 'pA', pieceIndex: 0, rotate: 0, flip: false },
          { panelId: 'pA', pieceIndex: 1, rotate: 180, flip: true },
          { panelId: 'pA', pieceIndex: 2, rotate: 0, flip: true },
          { panelId: 'pA', pieceIndex: 3, rotate: 180, flip: false },
        ],
      },
      {
        id: 'row2',
        wafers: [
          { panelId: 'pB', pieceIndex: 0, rotate: 90, flip: false },
          { panelId: 'pB', pieceIndex: 1, rotate: 90, flip: true },
          { panelId: 'pB', pieceIndex: 2, rotate: 270, flip: false },
        ],
      },
    ],
  }
}
