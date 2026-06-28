import { describe, expect, it } from 'vitest'
import { LATEST_SCHEMA_VERSION, migrate } from '../src/domain/migrations'

// A pre-v2 board: running-bond offsets stored in absolute mm (v1 semantics).
const v1Board = () => ({
  id: 'b', name: 'Bond', length: 400, thickness: 38, construction: 'end',
  strips: [{ id: 's1', speciesId: 'walnut', width: 40 }, { id: 's2', speciesId: 'maple', width: 40 }],
  endGrain: { stockThickness: 38, rowOffsets: [0, 20] },
})

describe('migrate', () => {
  it('defaults a missing schemaVersion to 1 and upgrades to the latest', () => {
    const result = migrate({ shops: [], boards: [] })
    expect(result.fromVersion).toBe(1)
    expect(result.tooNew).toBe(false)
    expect(result.data['schemaVersion']).toBe(LATEST_SCHEMA_VERSION)
  })

  it('runs the v1->v2 step: running-bond offsets become cell fractions', () => {
    const result = migrate({ schemaVersion: 1, shops: [], boards: [v1Board()] })
    const board = (result.data['boards'] as Record<string, unknown>[])[0]!
    const eg = board['endGrain'] as Record<string, unknown>
    expect(eg['rowOffsets']).toEqual([0, 0.5]) // 20 mm / 40 mm average cell
    expect(result.applied).toContain('running-bond-offsets-to-cell-fractions')
  })

  it('is idempotent on already-current data (no steps applied)', () => {
    const current = { schemaVersion: 2, shops: [], boards: [{ ...v1Board(), endGrain: { stockThickness: 38, rowOffsets: [0, 0.5] } }] }
    const result = migrate(current)
    expect(result.applied).toEqual([])
    const eg = (result.data['boards'] as Record<string, unknown>[])[0]!['endGrain'] as Record<string, unknown>
    expect(eg['rowOffsets']).toEqual([0, 0.5]) // unchanged
  })

  it('flags a newer-than-app backup and applies no steps', () => {
    const result = migrate({ schemaVersion: LATEST_SCHEMA_VERSION + 1, shops: [], boards: [] })
    expect(result.tooNew).toBe(true)
    expect(result.applied).toEqual([])
  })

  it('leaves offsets alone when a board has no strips to scale against', () => {
    const result = migrate({ schemaVersion: 1, shops: [], boards: [{ id: 'b', strips: [], endGrain: { rowOffsets: [0, 12] } }] })
    const eg = (result.data['boards'] as Record<string, unknown>[])[0]!['endGrain'] as Record<string, unknown>
    expect(eg['rowOffsets']).toEqual([0, 12])
  })
})
