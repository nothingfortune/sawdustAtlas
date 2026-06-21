import { describe, expect, it } from 'vitest'
import { applyBoardPattern, BOARD_PATTERNS } from '../src/domain/boardPatterns'
import type { BoardProject, WoodSpecies } from '../src/types'

const woods: WoodSpecies[] = [
  { id: 'walnut', name: 'Walnut', color: '#5a3828', accent: '#87614a', pricePerBoardFoot: 12 },
  { id: 'maple', name: 'Maple', color: '#dbc59b', accent: '#f0dfb9', pricePerBoardFoot: 8 },
]

const project: BoardProject = {
  id: 'board', name: 'Test', length: 450, thickness: 38, construction: 'end', updatedAt: '',
  strips: [],
  endGrain: { sourceLength: 900, stockThickness: 40, sliceThickness: 40, kerf: 3, trimAllowance: 20, rowFlips: [], rowRotations: [] },
  allowances: { jointing: 0, planing: 0, drumSanding: 0, ripAllowance: 0, lengthTrim: 0, widthTrim: 0 },
}

describe('board pattern registry', () => {
  it('keeps ids unique and exposes researched patterns', () => {
    expect(new Set(BOARD_PATTERNS.map(pattern => pattern.id)).size).toBe(BOARD_PATTERNS.length)
    expect(BOARD_PATTERNS.map(pattern => pattern.id)).toEqual(expect.arrayContaining(['third-bond', 'zigzag', 'stepped-wave']))
  })

  it('builds a three-step bond with editable strips', () => {
    let id = 0
    const result = applyBoardPattern('third-bond', project, woods, 6, () => `strip-${++id}`)
    expect(result.strips).toHaveLength(8)
    expect(result.strips.map(strip => strip.speciesId).slice(0, 4)).toEqual(['walnut', 'maple', 'walnut', 'maple'])
    expect(result.endGrain.rowOffsets?.slice(0, 4)).toEqual([0, 40 / 3, 80 / 3, 0])
  })

  it('resets stale transforms before applying a new recipe', () => {
    const changed = { ...project, endGrain: { ...project.endGrain, rowFlips: [true], rowRotations: [true], rowOffsets: [12] } }
    const result = applyBoardPattern('stripe', changed, woods, 3, () => 'id')
    expect(result.endGrain).toMatchObject({ rowFlips: [], rowRotations: [], rowOffsets: [] })
  })
})
