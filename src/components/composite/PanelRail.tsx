import { useState } from 'react'
import type { BoardProject, CompositeBoard, CompositePanel, WoodSpecies } from '../../types'
import { panelPieces } from '../../domain/compositeBoard'
import { pieceKey } from '../../domain/compositeAssembly'
import { WoodPatterns } from '../board/WoodPatterns'
import { NumberField } from '../fields'
import { CompositePieceFace } from './CompositePieceFace'

export interface PanelRailProps {
  composite: CompositeBoard
  boards: BoardProject[]
  woods: WoodSpecies[]
  selectedPieceKey: string | null
  onSelectPiece: (key: string | null) => void
  onChange: (composite: CompositeBoard) => void
  onAddInline: () => void
  onPickBoard: (boardId: string) => void
  onEditPanel: (boardId: string) => void
}

export function PanelRail({ composite, boards, woods, selectedPieceKey, onSelectPiece, onChange, onAddInline, onPickBoard, onEditPanel }: PanelRailProps) {
  const [adding, setAdding] = useState(false)

  const setCrosscut = (panelId: string, patch: Partial<CompositePanel['crosscut']>) =>
    onChange({ ...composite, panels: composite.panels.map(p => p.id === panelId ? { ...p, crosscut: { ...p.crosscut, ...patch } } : p) })
  const removePanel = (panelId: string) =>
    onChange({ ...composite, panels: composite.panels.filter(p => p.id !== panelId), cells: composite.cells.map(c => c && c.panelId === panelId ? null : c) })

  const usedBoardIds = new Set(composite.panels.map(p => p.boardId))
  const pickable = boards.filter(b => !usedBoardIds.has(b.id))

  return (
    <div className="panel-rail">
      {composite.panels.map(panel => {
        const board = boards.find(b => b.id === panel.boardId)
        const pieces = panelPieces(panel, boards)
        return (
          <div className="panel-card" key={panel.id}>
            <div className="panel-card-head">
              <button className="panel-card-name" onClick={() => onEditPanel(panel.boardId)}>{board?.name ?? 'Missing board'}</button>
              <button className="icon-button" aria-label={`Remove panel ${board?.name ?? ''}`} onClick={() => removePanel(panel.id)}>✕</button>
            </div>
            <div className="crosscut-stepper">
              <button className="icon-button" aria-label="Fewer pieces" onClick={() => setCrosscut(panel.id, { count: Math.max(0, panel.crosscut.count - 1) })}>−</button>
              <span>crosscut into {panel.crosscut.count}</span>
              <button className="icon-button" aria-label="More pieces" onClick={() => setCrosscut(panel.id, { count: panel.crosscut.count + 1 })}>+</button>
            </div>
            <div className="crosscut-dims">
              <NumberField label="Piece width" value={panel.crosscut.stripWidthMm} min={1} step={1} onChange={v => setCrosscut(panel.id, { stripWidthMm: v })} />
              <NumberField label="Kerf" value={panel.crosscut.kerfMm} min={0} step={0.1} onChange={v => setCrosscut(panel.id, { kerfMm: v })} />
            </div>
            <div className="piece-tray">
              {pieces.map(piece => {
                const key = pieceKey(panel.id, piece.index)
                return (
                  <button key={key} className={`piece-chip${selectedPieceKey === key ? ' is-selected' : ''}`} aria-pressed={selectedPieceKey === key}
                    onClick={() => onSelectPiece(selectedPieceKey === key ? null : key)}>
                    <svg viewBox={`0 0 ${piece.widthMm} ${piece.heightMm}`} width={40} height={40} preserveAspectRatio="xMidYMid meet">
                      <defs><WoodPatterns woods={woods} /></defs>
                      <CompositePieceFace piece={piece} cell={{ panelId: panel.id, pieceIndex: piece.index, rotate: 0, flip: false }} />
                    </svg>
                    <span>#{piece.index + 1}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      <div className="panel-card add-panel">
        {!adding ? (
          <button className="button" onClick={() => setAdding(true)}>+ Add panel</button>
        ) : (
          <div className="add-panel-menu">
            <button className="button" onClick={() => { setAdding(false); onAddInline() }}>Design new</button>
            {pickable.length > 0 && (
              <select aria-label="Pick existing board" defaultValue="" onChange={e => { if (e.target.value) { onPickBoard(e.target.value); setAdding(false) } }}>
                <option value="" disabled>Pick existing board…</option>
                {pickable.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
            <button className="icon-button" aria-label="Cancel add panel" onClick={() => setAdding(false)}>✕</button>
          </div>
        )}
      </div>
    </div>
  )
}
