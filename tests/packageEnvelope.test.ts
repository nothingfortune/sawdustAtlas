import { describe, expect, it } from 'vitest'
import { starterData } from '../src/data'
import { LATEST_SCHEMA_VERSION } from '../src/domain/migrations'
import { NEWER_VERSION_ERROR, PROJECT_PACKAGE_KIND, buildProjectPackage, readProjectPackage } from '../src/packages'
import { normalizeData } from '../src/storage'
import { fixedContext, FIXED_NOW } from './fixtures/context'

function boardPackage(): Record<string, unknown> {
  const data = normalizeData(structuredClone(starterData), fixedContext())
  const pkg = buildProjectPackage(data, { type: 'board', id: data.boards[0]!.id }, FIXED_NOW)!
  return JSON.parse(JSON.stringify(pkg)) as Record<string, unknown>
}

describe('package version refusal', () => {
  it('refuses a newer packageVersion', () => {
    expect(readProjectPackage({ ...boardPackage(), packageVersion: 2 })).toEqual({ ok: false, error: NEWER_VERSION_ERROR })
  })

  it('refuses a newer schemaVersion', () => {
    expect(readProjectPackage({ ...boardPackage(), schemaVersion: LATEST_SCHEMA_VERSION + 1 })).toEqual({ ok: false, error: NEWER_VERSION_ERROR })
  })

  it('refuses before reading the project at all', () => {
    // A board package with no board would otherwise fail with "no board in it".
    expect(readProjectPackage({ kind: PROJECT_PACKAGE_KIND, packageVersion: 2, project: { type: 'board' } })).toEqual({ ok: false, error: NEWER_VERSION_ERROR })
    expect(readProjectPackage({ kind: PROJECT_PACKAGE_KIND, packageVersion: 2 })).toEqual({ ok: false, error: NEWER_VERSION_ERROR })
  })

  it('reads a missing, string, or fractional packageVersion as 1', () => {
    const withoutVersion = boardPackage()
    delete withoutVersion['packageVersion']
    for (const pkg of [withoutVersion, { ...boardPackage(), packageVersion: '1' }, { ...boardPackage(), packageVersion: '2' }, { ...boardPackage(), packageVersion: 1.5 }]) {
      expect(readProjectPackage(pkg).ok).toBe(true)
    }
  })

  it('accepts the current versions', () => {
    expect(readProjectPackage(boardPackage()).ok).toBe(true)
  })
})

describe('package migration', () => {
  it('migrates a schema-1 board package (running-bond offsets from mm to cell fractions)', () => {
    const result = readProjectPackage({
      kind: PROJECT_PACKAGE_KIND,
      schemaVersion: 1,
      project: {
        type: 'board',
        board: {
          id: 'old', name: 'Old board', construction: 'end',
          strips: [{ id: 'a', speciesId: 'walnut', width: 38 }, { id: 'b', speciesId: 'walnut', width: 38 }],
          endGrain: { rowOffsets: [19, -38] },
        },
      },
      woods: [],
    }, fixedContext())
    if (!result.ok || result.pkg.project.type !== 'board') throw new Error('expected a board')
    expect(result.pkg.project.board.endGrain.rowOffsets).toEqual([0.5, -1])
  })
})
