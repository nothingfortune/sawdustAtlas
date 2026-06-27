import type { BoardProject, CompositeBoard, WoodSpecies } from '../../types'
import { assembledSize } from '../../domain/compositeBoard'

export interface CompositeScreenProps {
  composite: CompositeBoard
  boards: BoardProject[]
  woods: WoodSpecies[]
  onChange: (composite: CompositeBoard) => void
  onCreateBoardForPanel: () => string
  onEditBoard: (boardId: string) => void
  onBack: () => void
}

// Placeholder shell for the row-based composite editor. The parts bag, assembly
// desk, and final preview land in later tasks (AT7–AT11); this keeps the build
// green and the composite reachable from the gallery in the meantime.
export function CompositeScreen({ composite, boards, onBack }: CompositeScreenProps) {
  const size = assembledSize(composite, boards)
  const placed = composite.rows.reduce((sum, row) => sum + row.wafers.length, 0)
  return (
    <div className="composite-screen">
      <header className="composite-screen-head">
        <button type="button" className="backup-button" onClick={onBack}>← Back to boards</button>
        <h2>{composite.name}</h2>
        <span className="muted">{composite.construction === 'end' ? 'End grain' : 'Edge grain'}</span>
      </header>
      <p className="muted">
        {composite.rows.length} row(s), {placed} wafer(s) placed · assembled{' '}
        {Math.round(size.lengthMm)}×{Math.round(size.widthMm)}×{Math.round(size.thicknessMm)} mm
      </p>
      <p className="muted">The row-based assembly editor is being rebuilt.</p>
    </div>
  )
}
