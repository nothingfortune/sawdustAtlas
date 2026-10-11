import { describe, expect, it } from 'vitest'
import { starterData } from '../src/data'
import { normalizeData } from '../src/storage'
import { buildProjectPackage, mergeProjectPackage, PROJECT_PACKAGE_KIND, readProjectPackage } from '../src/projectPackage'
import type { AtlasData, BoardProject, CompositeBoard, WoodSpecies } from '../src/types'

const NOW = '2026-10-10T12:00:00.000Z'

function counter() {
  let n = 0
  return () => `fresh-${++n}`
}

function makeBoard(id: string, speciesIds: string[], name = `Board ${id}`): BoardProject {
  const base = normalizeData({ boards: [{ id, name }] } as unknown as Partial<AtlasData>).boards[0]!
  return { ...base, strips: speciesIds.map((speciesId, i) => ({ id: `${id}-s${i}`, speciesId, width: 38, trailingAngle: 0 })) }
}

function makeComposite(id: string, boardIds: string[]): CompositeBoard {
  return {
    id, name: `Composite ${id}`, construction: 'edge', updatedAt: NOW,
    panels: boardIds.map((boardId, i) => ({ id: `${id}-p${i}`, boardId, cut: { axis: 'y', stripWidthMm: 40, kerfMm: 3, count: 2 } })),
    rows: [{ id: `${id}-r0`, wafers: boardIds.map((_, i) => ({ panelId: `${id}-p${i}`, pieceIndex: 0, rotate: 0, flip: false })) }],
  }
}

function workspace(): AtlasData {
  const woods = starterData.woods.slice(0, 3)
  const [a, b, c] = woods.map(w => w.id) as [string, string, string]
  return {
    ...starterData,
    woods,
    boards: [makeBoard('b1', [a, b]), makeBoard('b2', [c]), makeBoard('b3', [a])],
    composites: [makeComposite('c1', ['b1', 'b2'])],
  }
}

describe('buildProjectPackage', () => {
  it('packages a board with only the woods it uses', () => {
    const data = workspace()
    const pkg = buildProjectPackage(data, { type: 'board', id: 'b1' }, NOW)!
    expect(pkg.kind).toBe(PROJECT_PACKAGE_KIND)
    expect(pkg.exportedAt).toBe(NOW)
    expect(pkg.project).toMatchObject({ type: 'board', board: { id: 'b1' } })
    expect(pkg.woods.map(w => w.id)).toEqual([data.woods[0]!.id, data.woods[1]!.id])
  })

  it('packages a composite with its panel boards and their woods only', () => {
    const data = workspace()
    const pkg = buildProjectPackage(data, { type: 'composite', id: 'c1' }, NOW)!
    if (pkg.project.type !== 'composite') throw new Error('expected composite')
    expect(pkg.project.panelBoards.map(b => b.id).sort()).toEqual(['b1', 'b2'])
    expect(pkg.woods).toHaveLength(3)
    expect(pkg.project.panelBoards.some(b => b.id === 'b3')).toBe(false)
  })

  it('returns null for unknown ids', () => {
    expect(buildProjectPackage(workspace(), { type: 'board', id: 'nope' }, NOW)).toBeNull()
    expect(buildProjectPackage(workspace(), { type: 'composite', id: 'nope' }, NOW)).toBeNull()
  })
})

describe('readProjectPackage', () => {
  it('round-trips a built package through JSON', () => {
    const data = workspace()
    for (const ref of [{ type: 'board', id: 'b1' }, { type: 'composite', id: 'c1' }] as const) {
      const pkg = buildProjectPackage(data, ref, NOW)!
      const result = readProjectPackage(JSON.parse(JSON.stringify(pkg)))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.pkg.project.type).toBe(ref.type)
      expect(result.pkg.woods.map(w => w.id)).toEqual(pkg.woods.map(w => w.id))
    }
  })

  it('rejects garbage, the wrong kind, and a workspace backup', () => {
    for (const bad of [null, 'text', 42, [], {}, { kind: 'other' }, { ...workspace() }]) {
      const result = readProjectPackage(bad)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/not a SawdustAtlas project package/)
    }
  })

  it('rejects packages with a missing or unknown project', () => {
    const base = { kind: PROJECT_PACKAGE_KIND }
    expect(readProjectPackage(base).ok).toBe(false)
    expect(readProjectPackage({ ...base, project: { type: 'shop' } }).ok).toBe(false)
    expect(readProjectPackage({ ...base, project: { type: 'board' } }).ok).toBe(false)
    expect(readProjectPackage({ ...base, project: { type: 'composite' } }).ok).toBe(false)
  })

  it('normalizes malformed fields like a backup', () => {
    const result = readProjectPackage({
      kind: PROJECT_PACKAGE_KIND,
      project: { type: 'board', board: { id: 'x', name: 7, length: 'long', thickness: 'thick', strips: [{ id: 's', speciesId: 'mystery', width: 'wide' }] } },
      woods: 'nope',
    })
    expect(result.ok).toBe(true)
    if (!result.ok || result.pkg.project.type !== 'board') return
    const board = result.pkg.project.board
    expect(board.length).toBe(450)
    expect(board.thickness).toBe(38)
    expect(board.name).toBe('Imported cutting board')
    expect(board.strips[0]!.width).toBe(38)
    expect(board.endGrain.sliceThickness).toBeGreaterThan(0)
    // The unknown species is carried as a placeholder; unused defaults are not.
    expect(result.pkg.woods.map(w => w.id)).toEqual(['mystery'])
  })

  it('keeps composite panel references to the carried boards', () => {
    const pkg = buildProjectPackage(workspace(), { type: 'composite', id: 'c1' }, NOW)!
    const result = readProjectPackage(JSON.parse(JSON.stringify(pkg)))
    if (!result.ok || result.pkg.project.type !== 'composite') throw new Error('expected composite')
    const ids = new Set(result.pkg.project.panelBoards.map(b => b.id))
    expect(result.pkg.project.composite.panels.every(p => ids.has(p.boardId))).toBe(true)
  })
})

describe('mergeProjectPackage', () => {
  const emptyWorkspace = (): AtlasData => ({ ...workspace(), boards: [], composites: [] })

  it('adds a board without collision, keeping its id and name', () => {
    const pkg = buildProjectPackage(workspace(), { type: 'board', id: 'b1' }, NOW)!
    const target = emptyWorkspace()
    const { data, summary } = mergeProjectPackage(target, pkg, counter())
    expect(data.boards.map(b => [b.id, b.name])).toEqual([['b1', 'Board b1']])
    expect(summary).toMatchObject({ boards: 1, composites: 0, importedAsCopy: false })
  })

  it('adds a composite and its panel boards without collision', () => {
    const pkg = buildProjectPackage(workspace(), { type: 'composite', id: 'c1' }, NOW)!
    const { data, summary } = mergeProjectPackage(emptyWorkspace(), pkg, counter())
    expect(data.composites.map(c => c.id)).toEqual(['c1'])
    expect(data.boards.map(b => b.id).sort()).toEqual(['b1', 'b2'])
    expect(summary).toMatchObject({ boards: 2, composites: 1, importedAsCopy: false })
  })

  it('imports a colliding board as a copy with a fresh id and suffix', () => {
    const target = workspace()
    const pkg = buildProjectPackage(target, { type: 'board', id: 'b1' }, NOW)!
    const { data, summary } = mergeProjectPackage(target, pkg, counter())
    expect(data.boards).toHaveLength(target.boards.length + 1)
    const copy = data.boards.at(-1)!
    expect(copy.id).toBe('fresh-1')
    expect(copy.name).toBe('Board b1 (imported)')
    expect(data.boards.find(b => b.id === 'b1')).toEqual(target.boards[0])
    expect(summary.importedAsCopy).toBe(true)
  })

  it('imports a colliding composite as a copy with remapped panel refs', () => {
    const target = workspace()
    const pkg = buildProjectPackage(target, { type: 'composite', id: 'c1' }, NOW)!
    const { data, summary } = mergeProjectPackage(target, pkg, counter())
    expect(data.composites).toHaveLength(2)
    expect(data.composites[0]).toEqual(target.composites[0])
    const copy = data.composites[1]!
    expect(copy.id).not.toBe('c1')
    expect(copy.name).toBe('Composite c1 (imported)')
    const copyBoards = data.boards.slice(target.boards.length)
    expect(copyBoards.map(b => b.name)).toEqual(['Board b1 (imported)', 'Board b2 (imported)'])
    expect(copy.panels.map(p => p.boardId)).toEqual(copyBoards.map(b => b.id))
    expect(copy.panels.some(p => ['b1', 'b2'].includes(p.boardId))).toBe(false)
    expect(summary).toMatchObject({ boards: 2, composites: 1, importedAsCopy: true })
  })

  it('imports a composite as a copy when only a panel board id clashes', () => {
    const target = workspace()
    const pkg = buildProjectPackage(target, { type: 'composite', id: 'c1' }, NOW)!
    if (pkg.project.type !== 'composite') throw new Error('expected composite')
    pkg.project.composite = { ...pkg.project.composite, id: 'c-new' }
    const { data, summary } = mergeProjectPackage(target, pkg, counter())
    const added = data.composites.at(-1)!
    expect(added.id).not.toBe('c-new')
    expect(added.name).toBe('Composite c1 (imported)')
    expect(added.panels.every(p => !['b1', 'b2'].includes(p.boardId))).toBe(true)
    expect(data.boards.slice(target.boards.length).map(b => b.id)).toEqual(added.panels.map(p => p.boardId))
    expect(data.boards.slice(0, target.boards.length)).toEqual(target.boards)
    expect(summary).toMatchObject({ boards: 2, composites: 1, importedAsCopy: true })
  })

  it('adds absent woods and keeps present ones', () => {
    const extra: WoodSpecies = { id: 'zebrawood', name: 'Zebrawood', color: '#aa8855', accent: '#ccaa77', pricePerBoardFoot: 20 }
    const source: AtlasData = { ...workspace(), woods: [...workspace().woods, extra], boards: [makeBoard('bz', ['zebrawood', workspace().woods[0]!.id])], composites: [] }
    const pkg = buildProjectPackage(source, { type: 'board', id: 'bz' }, NOW)!
    const target = workspace()
    const localCopy = { ...target.woods[0]!, pricePerBoardFoot: 99 }
    target.woods = [localCopy, ...target.woods.slice(1)]
    const { data, summary } = mergeProjectPackage(target, pkg, counter())
    expect(summary).toMatchObject({ woodsAdded: 1, woodsKept: 1 })
    expect(data.woods.find(w => w.id === 'zebrawood')).toEqual(extra)
    expect(data.woods.find(w => w.id === localCopy.id)!.pricePerBoardFoot).toBe(99)
  })

  it('leaves existing projects, shops and settings untouched', () => {
    const target = workspace()
    const snapshot = JSON.parse(JSON.stringify(target)) as AtlasData
    const pkg = buildProjectPackage(target, { type: 'composite', id: 'c1' }, NOW)!
    const { data } = mergeProjectPackage(target, pkg, counter())
    expect(target).toEqual(snapshot)
    expect(data.boards.slice(0, snapshot.boards.length)).toEqual(snapshot.boards)
    expect(data.shops).toEqual(snapshot.shops)
    expect(data.pricing).toEqual(snapshot.pricing)
    expect(data.allowances).toEqual(snapshot.allowances)
  })
})
