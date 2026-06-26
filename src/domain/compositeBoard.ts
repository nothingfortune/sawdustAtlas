import type { CompositeBoard, RipPanel, SourcePanel } from '../types'
import { nonNegative } from './units'

export type BoardRegistry = Map<string, CompositeBoard>

export interface Piece {
  panelId: string
  index: number
  widthMm: number
  heightMm: number
  thicknessMm: number
  bySpecies: Record<string, number>
}

export function panelPieces(panel: SourcePanel, _registry: BoardRegistry): Piece[] {
  if (panel.kind === 'rip') return ripPanelPieces(panel)
  // Derived panels resolve from a source board; rendering is added in Task 5.
  return []
}

function ripPanelPieces(panel: RipPanel): Piece[] {
  const width = nonNegative(panel.crosscut.stripWidthMm)
  const thickness = nonNegative(panel.thicknessMm)
  const stackHeight = panel.strips.reduce((acc, strip) => acc + nonNegative(strip.width), 0)
  const bySpecies: Record<string, number> = {}
  for (const strip of panel.strips) {
    bySpecies[strip.speciesId] = (bySpecies[strip.speciesId] ?? 0) + nonNegative(strip.width) * width * thickness
  }
  const count = Math.max(0, Math.floor(panel.crosscut.count))
  const pieces: Piece[] = []
  for (let index = 0; index < count; index += 1) {
    pieces.push({ panelId: panel.id, index, widthMm: width, heightMm: stackHeight, thicknessMm: thickness, bySpecies: { ...bySpecies } })
  }
  return pieces
}
