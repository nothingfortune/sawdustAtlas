import { describe, expect, it } from 'vitest'
import { buildProjectPackage, previewProjectPackage } from '../src/packages'
import { FIXED_NOW } from './fixtures/context'
import { PACKAGE_KIND_FIXTURES } from './fixtures/packageKinds'

describe('previewProjectPackage', () => {
  it('describes the project and splits its woods into new and present', () => {
    const { data, id } = PACKAGE_KIND_FIXTURES['board']!()
    const pkg = buildProjectPackage(data, { type: 'board', id }, FIXED_NOW)!
    const [missing, ...present] = pkg.woods
    const preview = previewProjectPackage({ woods: data.woods.filter(w => w.id !== missing!.id) }, pkg)
    expect(preview).toMatchObject({ name: data.boards[0]!.name, label: 'Cutting board' })
    expect(preview.size).toMatch(/strip/)
    expect(preview.woodsAdded).toEqual([missing!.name])
    expect(preview.woodsPresent).toEqual(present.map(w => w.name))
  })
})
