import { describe, expect, it } from 'vitest'
import { LATEST_SCHEMA_VERSION } from '../src/domain/migrations'
import { NEWER_VERSION_ERROR, PACKAGE_KINDS, buildProjectPackage, describeProject, mergeProjectPackage, projectPackageFileName, readProjectPackage } from '../src/packages'
import type { AtlasData } from '../src/types'
import { fixedContext, FIXED_NOW } from './fixtures/context'
import { PACKAGE_KIND_FIXTURES } from './fixtures/packageKinds'

function freshIds() {
  let next = 0
  return () => `copy-${++next}`
}

function emptied(data: AtlasData): AtlasData {
  return { ...data, boards: [], composites: [], furniture: [], woods: [] }
}

// Runs against every registered kind; a new kind is covered by adding its fixture.
describe.each(PACKAGE_KINDS.map(kind => [kind.type, kind] as const))('package kind %s', (type, kind) => {
  function roundTrip() {
    const make = PACKAGE_KIND_FIXTURES[type]
    if (!make) throw new Error(`Register a fixture for package kind "${type}" in tests/fixtures/packageKinds.ts`)
    const { data, id } = make()
    const pkg = buildProjectPackage(data, { type, id }, FIXED_NOW)
    if (!pkg) throw new Error(`The ${type} fixture did not build a package`)
    const read = readProjectPackage(JSON.parse(JSON.stringify(pkg)), fixedContext())
    if (!read.ok) throw new Error(read.error)
    return { data, id, pkg, read: read.pkg }
  }

  it('reads back exactly what it built', () => {
    const { pkg, read } = roundTrip()
    expect(read.project).toEqual(pkg.project)
    expect(read.woods).toEqual(pkg.woods)
  })

  it('carries exactly the woods the project uses', () => {
    const { pkg } = roundTrip()
    const used = kind.usedWoodIds(pkg.project)
    expect(used.size).toBeGreaterThan(0)
    expect(new Set(pkg.woods.map(wood => wood.id))).toEqual(used)
  })

  it('merges into an empty workspace under its own id', () => {
    const { data, id, read } = roundTrip()
    const { data: merged, summary } = mergeProjectPackage(emptied(data), read, freshIds())
    expect(summary.importedAsCopy).toBe(false)
    expect(summary.projectId).toBe(id)
    expect(merged.woods.map(wood => wood.id).sort()).toEqual(read.woods.map(wood => wood.id).sort())
    expect(buildProjectPackage(merged, { type, id }, FIXED_NOW)?.project).toEqual(read.project)
  })

  it('imports a suffixed copy when the id is taken, leaving the original alone', () => {
    const { data, id, read } = roundTrip()
    const before = buildProjectPackage(data, { type, id }, FIXED_NOW)?.project
    const { data: merged, summary } = mergeProjectPackage(data, read, freshIds())
    expect(summary.importedAsCopy).toBe(true)
    expect(summary.projectId).not.toBe(id)
    const copy = buildProjectPackage(merged, { type, id: summary.projectId }, FIXED_NOW)
    if (!copy) throw new Error('the copy is missing')
    expect(describeProject(copy).name).toMatch(/ \(imported\)$/)
    expect(buildProjectPackage(merged, { type, id }, FIXED_NOW)?.project).toEqual(before)
  })

  it('describes itself for file names and previews', () => {
    const { pkg } = roundTrip()
    const description = describeProject(pkg)
    expect(description.name).not.toBe('')
    expect(description.label).not.toBe('')
    expect(description.size).not.toBe('')
    expect(projectPackageFileName(pkg)).toMatch(/\.sawdust-project\.json$/)
  })

  it('is refused when it comes from a newer app', () => {
    const { pkg } = roundTrip()
    const raw = JSON.parse(JSON.stringify(pkg)) as Record<string, unknown>
    expect(readProjectPackage({ ...raw, packageVersion: 2 })).toEqual({ ok: false, error: NEWER_VERSION_ERROR })
    expect(readProjectPackage({ ...raw, schemaVersion: LATEST_SCHEMA_VERSION + 1 })).toEqual({ ok: false, error: NEWER_VERSION_ERROR })
  })
})

describe('PACKAGE_KINDS', () => {
  it('registers board, composite, and furniture once each', () => {
    expect(PACKAGE_KINDS.map(kind => kind.type).sort()).toEqual(['board', 'composite', 'furniture'])
  })
})
