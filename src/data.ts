import type { AtlasData, WoodSpecies } from './types'
import { DEFAULT_ALLOWANCES } from './domain/boardAllowances'

export const species = [
  { id: 'walnut', name: 'Walnut', color: '#5a3828', accent: '#87614a', pricePerBoardFoot: 12.5 },
  { id: 'maple', name: 'Hard maple', color: '#dbc59b', accent: '#f0dfb9', pricePerBoardFoot: 8.75 },
  { id: 'cherry', name: 'Cherry', color: '#a85637', accent: '#cb7957', pricePerBoardFoot: 9.5 },
  { id: 'padauk', name: 'Padauk', color: '#b64221', accent: '#dd6b42', pricePerBoardFoot: 18 },
  { id: 'purpleheart', name: 'Purpleheart', color: '#65435f', accent: '#8c6684', pricePerBoardFoot: 20 },
  { id: 'white-oak', name: 'White oak', color: '#b39161', accent: '#d2b681', pricePerBoardFoot: 10.25 },
] satisfies [WoodSpecies, ...WoodSpecies[]]

const id = () => crypto.randomUUID()

export const starterData: AtlasData = {
  shops: [{
    id: id(), name: 'My workshop', width: 7300, depth: 6100, updatedAt: new Date().toISOString(),
    items: [
      { id: id(), name: 'Table saw', kind: 'machine', x: 2850, y: 2200, width: 1070, depth: 970, rotation: 0, clearance: 1200, color: '#d8863b' },
      { id: id(), name: 'Workbench', kind: 'bench', x: 700, y: 600, width: 1830, depth: 760, rotation: 0, clearance: 450, color: '#66826d' },
      { id: id(), name: 'Lumber rack', kind: 'storage', x: 4780, y: 250, width: 2080, depth: 460, rotation: 0, clearance: 300, color: '#637d89' },
    ],
  }],
  boards: [{
    id: id(), name: 'Walnut & maple daily board', length: 460, thickness: 38, construction: 'edge', updatedAt: new Date().toISOString(),
    endGrain: { sourceLength: 900, stockThickness: 38, sliceThickness: 45, kerf: 3.2, trimAllowance: 20, rowFlips: [], rowRotations: [] },
    allowances: { ...DEFAULT_ALLOWANCES },
    strips: [
      { id: id(), speciesId: 'walnut', width: 50, trailingAngle: 0 }, { id: id(), speciesId: 'maple', width: 13, trailingAngle: 0 },
      { id: id(), speciesId: 'walnut', width: 38, trailingAngle: 0 }, { id: id(), speciesId: 'maple', width: 25, trailingAngle: 0 },
      { id: id(), speciesId: 'cherry', width: 50, trailingAngle: 0 }, { id: id(), speciesId: 'maple', width: 25, trailingAngle: 0 },
      { id: id(), speciesId: 'walnut', width: 38, trailingAngle: 0 }, { id: id(), speciesId: 'maple', width: 13, trailingAngle: 0 },
      { id: id(), speciesId: 'walnut', width: 50, trailingAngle: 0 },
    ],
  }],
}
