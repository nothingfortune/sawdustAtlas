import { describe, expect, it } from 'vitest'
import { buildProjectPackage, mergeProjectPackage, readProjectPackage } from '../src/packages'
import type { AtlasData, WoodSpecies } from '../src/types'
import { fixedContext, FIXED_NOW } from './fixtures/context'
import { PACKAGE_KIND_FIXTURES } from './fixtures/packageKinds'

const ZEBRAWOOD: WoodSpecies = { id: 'zebrawood', name: 'Zebrawood', color: '#aa8855', accent: '#ccaa77', pricePerBoardFoot: 20 }

// The fixture's furniture with its first solid part made of zebrawood, a species most workspaces lack.
function zebrawoodWorkspace(): { data: AtlasData; id: string; partId: string } {
  const { data, id } = PACKAGE_KIND_FIXTURES['furniture']!()
  const project = data.furniture.find(p => p.id === id)!
  const part = project.parts.find(p => p.kind === 'solid')!
  const furniture = { ...project, parts: project.parts.map(p => p.id === part.id ? { ...p, speciesId: 'zebrawood' } : p) }
  return { data: { ...data, woods: [...data.woods, ZEBRAWOOD], furniture: [furniture] }, id, partId: part.id }
}

describe('furniture package', () => {
  it('round-trips every section of the project', () => {
    const { data, id } = PACKAGE_KIND_FIXTURES['furniture']!()
    const pkg = buildProjectPackage(data, { type: 'furniture', id }, FIXED_NOW)!
    const read = readProjectPackage(JSON.parse(JSON.stringify(pkg)), fixedContext())
    if (!read.ok || read.pkg.project.type !== 'furniture') throw new Error('expected furniture')
    const furniture = read.pkg.project.furniture
    for (const section of [furniture.parts, furniture.parameters, furniture.relationships, furniture.joints, furniture.subassemblies, furniture.sheetMaterials]) {
      expect(section.length).toBeGreaterThan(0)
    }
    expect(furniture).toEqual(data.furniture.find(p => p.id === id))
  })

  it('brings its species into a workspace that lacks them', () => {
    const { data, id, partId } = zebrawoodWorkspace()
    const pkg = buildProjectPackage(data, { type: 'furniture', id }, FIXED_NOW)!
    expect(pkg.woods.map(w => w.id)).toContain('zebrawood')
    const read = readProjectPackage(JSON.parse(JSON.stringify(pkg)), fixedContext())
    if (!read.ok) throw new Error(read.error)
    const target: AtlasData = { ...data, woods: data.woods.filter(w => w.id !== 'zebrawood'), furniture: [] }
    const { data: merged, summary } = mergeProjectPackage(target, read.pkg, () => 'unused')
    expect(merged.woods.find(w => w.id === 'zebrawood')).toEqual(ZEBRAWOOD)
    expect(merged.furniture[0]!.parts.find(p => p.id === partId)!.speciesId).toBe('zebrawood')
    expect(summary).toMatchObject({ boards: 0, composites: 0, furniture: 1, woodsAdded: 1 })
  })

  it('keeps a species id and adds a placeholder wood when the package lost its woods list', () => {
    const { data, id, partId } = zebrawoodWorkspace()
    const raw = JSON.parse(JSON.stringify(buildProjectPackage(data, { type: 'furniture', id }, FIXED_NOW))) as Record<string, unknown>
    delete raw['woods']
    const read = readProjectPackage(raw, fixedContext())
    if (!read.ok || read.pkg.project.type !== 'furniture') throw new Error('expected furniture')
    expect(read.pkg.project.furniture.parts.find(p => p.id === partId)!.speciesId).toBe('zebrawood')
    expect(read.pkg.woods.find(w => w.id === 'zebrawood')).toMatchObject({ id: 'zebrawood', name: 'zebrawood' })
  })

  it('fails cleanly when the furniture project is missing', () => {
    const result = readProjectPackage({ kind: 'sawdust-atlas/project-package', project: { type: 'furniture' } })
    expect(result).toEqual({ ok: false, error: 'The project package has no furniture project in it.' })
  })
})
