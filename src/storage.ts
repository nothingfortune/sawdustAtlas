import type { AtlasData, BoardProject } from './types'
import { starterData } from './data'
import { DEFAULT_ALLOWANCES } from './domain/boardAllowances'

const KEY = 'sawdust-atlas:v1'

export function loadData(): AtlasData {
  try {
    const saved = localStorage.getItem(KEY)
    return saved ? normalizeData(JSON.parse(saved) as AtlasData) : starterData
  } catch {
    return starterData
  }
}

export function normalizeData(data: AtlasData): AtlasData {
  return {
    ...data,
    boards: data.boards.map((board): BoardProject => ({
      ...board,
      construction: board.construction ?? 'edge',
      allowances: { ...DEFAULT_ALLOWANCES, ...board.allowances },
      strips: board.strips.map(strip => ({ ...strip, trailingAngle: strip.trailingAngle ?? 0 })),
      endGrain: board.endGrain ? {
        ...board.endGrain,
        rowFlips: board.endGrain.rowFlips ?? [],
        rowRotations: board.endGrain.rowRotations ?? [],
      } : {
        sourceLength: 900,
        stockThickness: board.thickness,
        sliceThickness: 45,
        kerf: 3.2,
        trimAllowance: 20,
        rowFlips: [],
        rowRotations: [],
      },
    })),
  }
}

export function saveData(data: AtlasData) {
  localStorage.setItem(KEY, JSON.stringify(data))
}

export function downloadData(data: AtlasData) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `sawdust-atlas-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}
