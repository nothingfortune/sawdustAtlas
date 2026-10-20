import type { AtlasData, WoodSpecies } from '../../types'
import type { Created, WorkspaceContext } from './context'

export type WoodDeleteBlocker = 'in-use' | 'last-wood'

export function addWood(data: AtlasData, ctx: WorkspaceContext): Created {
  const wood: WoodSpecies = { id: ctx.createId(), name: 'Custom wood', color: '#8c6a48', accent: '#b18a5e', pricePerBoardFoot: 8 }
  return { data: { ...data, woods: [...data.woods, wood] }, id: wood.id }
}

export function updateWood(data: AtlasData, id: string, patch: Partial<WoodSpecies>): AtlasData {
  return { ...data, woods: data.woods.map(wood => wood.id === id ? { ...wood, ...patch, id: wood.id } : wood) }
}

// In-use is checked before last-wood, matching the order the UI reports them.
export function woodDeleteBlocker(data: AtlasData, id: string): WoodDeleteBlocker | null {
  if (data.boards.some(board => board.strips.some(strip => strip.speciesId === id))) return 'in-use'
  if (data.woods.length === 1) return 'last-wood'
  return null
}

export function deleteWood(data: AtlasData, id: string): AtlasData {
  return { ...data, woods: data.woods.filter(wood => wood.id !== id) }
}
