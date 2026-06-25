import { describe, expect, it } from 'vitest'
import { alternateStrips, applyBoardPattern, BOARD_PATTERNS, evenStripCount, gradientStrips, pickSpeciesPair } from '../src/domain/boardPatterns'
import type { BoardProject, BoardStrip, WoodSpecies } from '../src/types'

const woods: WoodSpecies[] = [
  { id: 'walnut', name: 'Walnut', color: '#5a3828', accent: '#87614a', pricePerBoardFoot: 12 },
  { id: 'maple', name: 'Maple', color: '#dbc59b', accent: '#f0dfb9', pricePerBoardFoot: 8 },
]

const project: BoardProject = {
  id: 'board', name: 'Test', length: 450, thickness: 38, construction: 'end', updatedAt: '',
  strips: [],
  endGrain: { sourceLength: 900, stockThickness: 40, sliceThickness: 40, kerf: 3, trimAllowance: 20, rowFlips: [], rowRotations: [] },
  allowances: { jointing: 0, planing: 0, routerTable: 0, ripAllowance: 0, lengthTrim: 0, widthTrim: 0 },
}

const speciesStrip = (speciesId: string): BoardStrip => ({ id: speciesId, speciesId, width: 40, trailingAngle: 0 })
const stripsOf = (count: number): BoardStrip[] => Array.from({ length: count }, (_, i) => ({ id: String(i), speciesId: 'walnut', width: 40, trailingAngle: 0 }))

describe('pickSpeciesPair', () => {
  it('uses the first strip and the next distinct species', () => {
    expect(pickSpeciesPair({ ...project, strips: [speciesStrip('walnut'), speciesStrip('maple')] }, woods)).toEqual(['walnut', 'maple'])
  })

  it('falls back to the library first two species when there are no strips', () => {
    expect(pickSpeciesPair({ ...project, strips: [] }, woods)).toEqual(['walnut', 'maple'])
  })

  it('repeats the primary when the library has a single species', () => {
    expect(pickSpeciesPair({ ...project, strips: [] }, [woods[0]!])).toEqual(['walnut', 'walnut'])
  })
})

describe('evenStripCount', () => {
  it('uses a floor of eight strips', () => {
    expect(evenStripCount({ ...project, strips: stripsOf(3) })).toBe(8)
  })

  it('rounds an odd count up to the next even number', () => {
    expect(evenStripCount({ ...project, strips: stripsOf(9) })).toBe(10)
  })

  it('leaves an even count unchanged', () => {
    expect(evenStripCount({ ...project, strips: stripsOf(10) })).toBe(10)
  })
})

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

const strip = (id: string, speciesId: string, width: number, trailingAngle = 0): BoardStrip => ({ id, speciesId, width, trailingAngle })

describe('strip arrangement reorderings', () => {
  it('alternate interleaves species without touching any strip', () => {
    const strips = [strip('1', 'walnut', 30), strip('2', 'walnut', 40), strip('3', 'maple', 50, 5), strip('4', 'maple', 60)]
    const result = alternateStrips(strips)
    expect(result.map(s => s.id)).toEqual(['1', '3', '2', '4'])
    expect(result.map(s => s.speciesId)).toEqual(['walnut', 'maple', 'walnut', 'maple'])
    // Same strip objects, untouched widths/angles — only the order changed.
    expect(new Set(result)).toEqual(new Set(strips))
    expect(result.find(s => s.id === '3')).toMatchObject({ width: 50, trailingAngle: 5 })
  })

  it('alternate handles uneven species counts and a single species', () => {
    const uneven = [strip('1', 'a', 10), strip('2', 'a', 10), strip('3', 'a', 10), strip('4', 'b', 10)]
    expect(alternateStrips(uneven).map(s => s.id)).toEqual(['1', '4', '2', '3'])
    const single = [strip('1', 'a', 10), strip('2', 'a', 20)]
    expect(alternateStrips(single).map(s => s.id)).toEqual(['1', '2'])
    expect(alternateStrips([])).toEqual([])
  })

  it('gradient sorts by ascending width and preserves the strips', () => {
    const strips = [strip('1', 'walnut', 50), strip('2', 'maple', 20), strip('3', 'walnut', 35)]
    const result = gradientStrips(strips)
    expect(result.map(s => s.width)).toEqual([20, 35, 50])
    expect(result.map(s => s.id)).toEqual(['2', '3', '1'])
    expect(new Set(result)).toEqual(new Set(strips))
  })

  it('gradient does not mutate its input', () => {
    const strips = [strip('1', 'a', 30), strip('2', 'a', 10)]
    gradientStrips(strips)
    expect(strips.map(s => s.id)).toEqual(['1', '2'])
  })
})
