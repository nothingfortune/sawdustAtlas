import { useState } from 'react'
import type { BoardProject, CompositeBoard, CompositePanel, WoodSpecies } from '../../types'
import { resizeGrid } from '../../domain/compositeAssembly'
import { createId } from '../../id'
import { PanelRail } from './PanelRail'
import { AssemblyCanvas } from './AssemblyCanvas'
import { CompositeSummary } from './CompositeSummary'

const DEFAULT_CROSSCUT = { stripWidthMm: 25, kerfMm: 3, count: 4 }

export interface CompositeScreenProps {
  composite: CompositeBoard
  boards: BoardProject[]
  woods: WoodSpecies[]
  onChange: (composite: CompositeBoard) => void
  onCreateBoardForPanel: () => string
  onEditBoard: (boardId: string) => void
  onBack: () => void
}

export function CompositeScreen({ composite, boards, woods, onChange, onCreateBoardForPanel, onEditBoard, onBack }: CompositeScreenProps) {
  const [selectedPieceKey, setSelectedPieceKey] = useState<string | null>(null)

  const setRows = (rows: number) => {
    const r = Math.max(1, Math.floor(rows))
    onChange({ ...composite, rows: r, cells: resizeGrid(composite.cells, composite.cols, r, composite.cols) })
  }
  const setCols = (cols: number) => {
    const c = Math.max(1, Math.floor(cols))
    onChange({ ...composite, cols: c, cells: resizeGrid(composite.cells, composite.cols, composite.rows, c) })
  }
  const makePanel = (boardId: string): CompositePanel => ({ id: createId(), boardId, crosscut: { ...DEFAULT_CROSSCUT } })
  const onPickBoard = (boardId: string) => onChange({ ...composite, panels: [...composite.panels, makePanel(boardId)] })
  const onAddInline = () => {
    const boardId = onCreateBoardForPanel()
    onChange({ ...composite, panels: [...composite.panels, makePanel(boardId)] })
    onEditBoard(boardId)
  }

  return (
    <div className="composite-board">
      <header className="composite-head">
        <button className="button" onClick={onBack}>← Boards</button>
        <input className="composite-name" value={composite.name} aria-label="Composite name" onChange={e => onChange({ ...composite, name: e.target.value })} />
        <label className="field count-field"><span>Rows</span><input type="number" min={1} value={composite.rows} onChange={e => setRows(Number(e.target.value) || 1)} /></label>
        <label className="field count-field"><span>Cols</span><input type="number" min={1} value={composite.cols} onChange={e => setCols(Number(e.target.value) || 1)} /></label>
      </header>
      <div className="composite-body">
        <PanelRail
          composite={composite} boards={boards} woods={woods}
          selectedPieceKey={selectedPieceKey} onSelectPiece={setSelectedPieceKey}
          onChange={onChange} onAddInline={onAddInline} onPickBoard={onPickBoard} onEditPanel={onEditBoard}
        />
        <AssemblyCanvas
          composite={composite} boards={boards} woods={woods}
          selectedPieceKey={selectedPieceKey} onChange={onChange}
          onConsumeSelection={() => setSelectedPieceKey(null)}
        />
        <CompositeSummary composite={composite} boards={boards} woods={woods} />
      </div>
    </div>
  )
}
