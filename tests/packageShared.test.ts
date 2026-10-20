import { describe, expect, it } from 'vitest'
import { buildProjectPackage, mergeProjectPackage, readProjectPackage } from '../src/packages'
import { fixedContext, FIXED_NOW } from './fixtures/context'
import { PACKAGE_KIND_FIXTURES } from './fixtures/packageKinds'

describe('duplicate ids inside an untrusted package', () => {
  it('keeps the first board and wood per id and merges one of each', () => {
    const { data, id } = PACKAGE_KIND_FIXTURES['composite']!()
    const pkg = JSON.parse(JSON.stringify(buildProjectPackage(data, { type: 'composite', id }, FIXED_NOW)))
    const board = pkg.project.panelBoards[0]
    const wood = pkg.woods[0]
    pkg.project.panelBoards = [board, { ...board, name: 'second' }]
    pkg.woods = [wood, { ...wood, name: 'second' }]
    const read = readProjectPackage(pkg, fixedContext())
    if (!read.ok) throw new Error(read.error)
    const payload = read.pkg.project
    if (payload.type !== 'composite') throw new Error('expected a composite')
    expect(payload.panelBoards.filter(b => b.id === board.id)).toHaveLength(1)
    expect(read.pkg.woods.filter(w => w.id === wood.id)).toHaveLength(1)
    const empty = { ...data, boards: [], composites: [], woods: [] }
    const { data: merged } = mergeProjectPackage(empty, read.pkg, () => 'copy')
    expect(merged.boards.filter(b => b.id === board.id)).toHaveLength(1)
    expect(merged.woods.filter(w => w.id === wood.id)).toHaveLength(1)
  })
})
