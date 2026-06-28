// Named, ordered schema migrations for saved/imported workspaces. Each step is a
// pure transform on the raw JSON shape (not the typed model), applied in sequence
// from the data's schemaVersion up to LATEST. normalizeData (storage.ts) runs this
// first, then coerces to the typed model. Adding a future schema change means adding
// one named step here — never editing old steps.

export const LATEST_SCHEMA_VERSION = 2

type Raw = Record<string, unknown>

export interface MigrationResult {
  data: Raw
  /** Names of the steps that ran, oldest first. */
  applied: string[]
  /** True when the backup's schemaVersion is newer than this app understands. */
  tooNew: boolean
  /** The schemaVersion the data started at (1 when absent). */
  fromVersion: number
}

interface MigrationStep {
  from: number
  to: number
  name: string
  migrate: (raw: Raw) => Raw
}

const MIGRATIONS: MigrationStep[] = [
  { from: 1, to: 2, name: 'running-bond-offsets-to-cell-fractions', migrate: offsetsMmToFractions },
]

export function migrate(raw: Raw): MigrationResult {
  const fromVersion = readVersion(raw)
  if (fromVersion > LATEST_SCHEMA_VERSION) {
    return { data: raw, applied: [], tooNew: true, fromVersion }
  }
  let data = raw
  let version = fromVersion
  const applied: string[] = []
  for (const step of MIGRATIONS) {
    if (step.from === version) {
      data = step.migrate(data)
      applied.push(step.name)
      version = step.to
    }
  }
  return { data: { ...data, schemaVersion: LATEST_SCHEMA_VERSION }, applied, tooNew: false, fromVersion }
}

// v1 -> v2: running-bond offsets were stored in absolute mm; v2 stores them as a
// fraction of one cell (the average strip width) so they track edited strip widths.
function offsetsMmToFractions(raw: Raw): Raw {
  const boards = Array.isArray(raw['boards']) ? raw['boards'] : []
  return {
    ...raw,
    boards: boards.map(board => {
      if (!isRecord(board)) return board
      const endGrain = board['endGrain']
      if (!isRecord(endGrain) || !Array.isArray(endGrain['rowOffsets']) || endGrain['rowOffsets'].length === 0) return board
      const cell = averageWidth(board['strips'])
      if (!(cell > 0)) return board // no strips to scale against; leave as-is
      return {
        ...board,
        endGrain: { ...endGrain, rowOffsets: (endGrain['rowOffsets'] as unknown[]).map(mm => Number(mm) / cell) },
      }
    }),
  }
}

function averageWidth(strips: unknown): number {
  if (!Array.isArray(strips)) return 0
  const widths = strips
    .map(strip => (isRecord(strip) ? Number(strip['width']) : Number.NaN))
    .filter(width => Number.isFinite(width) && width >= 0)
  if (widths.length === 0) return 0
  return widths.reduce((total, width) => total + width, 0) / widths.length
}

function readVersion(raw: Raw): number {
  const version = raw['schemaVersion']
  return typeof version === 'number' && Number.isFinite(version) ? version : 1
}

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null
}
