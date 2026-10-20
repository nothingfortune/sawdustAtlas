import { describe, expect, it } from 'vitest'
import { DEFAULT_ALLOWANCES } from '../src/domain/boardAllowances'
import { normalizeBoard } from '../src/normalize/boards'
import { normalizeComposite } from '../src/normalize/composites'
import type { BoardProject } from '../src/types'
import { FIXED_NOW, fixedContext } from './fixtures/context'

const allowances = DEFAULT_ALLOWANCES

describe('normalizeComposite', () => {
  it('turns a legacy inline-strip panel into a real board it references', () => {
    const sink: BoardProject[] = []
    const composite = normalizeComposite({
      id: 'c', panels: [{ id: 'p', kind: 'rip', construction: 'end', thicknessMm: 52, strips: [{ speciesId: 'oak', width: 20, trailingAngle: -10 }] }],
      rows: [{ id: 'r', wafers: [{ panelId: 'p', pieceIndex: 0, rotate: 90, flip: true }] }],
    }, { boardSink: sink, allowances, boards: [] }, fixedContext())
    expect(sink).toHaveLength(1)
    const board = sink[0]!
    expect(composite.panels[0]?.boardId).toBe(board.id)
    expect(board).toMatchObject({ construction: 'end', thickness: 52, updatedAt: FIXED_NOW })
    expect(board.endGrain.sliceThickness).toBe(52)
    expect(board.strips[0]?.trailingAngle).toBe(-10)
    expect(composite.construction).toBe('end')
    expect(composite.rows[0]?.wafers).toEqual([{ panelId: 'p', pieceIndex: 0, rotate: 90, flip: true }])
  })

  it('drops legacy derived panels and their wafers', () => {
    const composite = normalizeComposite({
      panels: [{ id: 'd', kind: 'derived' }],
      rows: [{ wafers: [{ panelId: 'd', pieceIndex: 0 }] }],
    }, { boardSink: [], allowances, boards: [] }, fixedContext())
    expect(composite.panels).toEqual([])
    expect(composite.rows[0]?.wafers).toEqual([])
  })

  it('infers construction from a referenced board and converts a legacy grid to rows', () => {
    const boards = [normalizeBoard({ id: 'b', construction: 'end' }, { allowances, fallbackSpeciesId: 'walnut' }, fixedContext())]
    const composite = normalizeComposite({
      panels: [{ id: 'p', boardId: 'b', crosscut: { stripWidthMm: 30 } }],
      rows: 2, cols: 1, cells: [{ panelId: 'p', pieceIndex: 1 }, null],
    }, { boardSink: [], allowances, boards }, fixedContext())
    expect(composite.construction).toBe('end')
    expect(composite.panels[0]?.cut).toEqual({ axis: 'x', stripWidthMm: 30, kerfMm: 3, count: 1 })
    expect(composite.rows.map(row => row.wafers.length)).toEqual([1, 0])
  })
})
