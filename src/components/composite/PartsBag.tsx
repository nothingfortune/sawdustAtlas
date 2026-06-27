import { useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import type { BoardProject, CompositeBoard, CompositeCut, WoodSpecies } from '../../types'
import { panelPieces } from '../../domain/compositeBoard'
import { pieceKey } from '../../domain/compositeAssembly'
import { WaferFace } from './WaferFace'
import { NumberField } from '../fields'

export interface PartsBagProps {
  composite: CompositeBoard
  boards: BoardProject[]
  woods: WoodSpecies[]
  placedKeys: Set<string>
  onChange: (composite: CompositeBoard) => void
  onAddInline: () => void
  onPickBoard: (boardId: string) => void
  onEditPanel: (boardId: string) => void
  onPlaceWafer: (panelId: string, pieceIndex: number) => void
}

const constructionLabel = (c: 'edge' | 'end') => (c === 'end' ? 'End grain' : 'Edge grain')

export function PartsBag({ composite, boards, placedKeys, onChange, onAddInline, onPickBoard, onEditPanel, onPlaceWafer }: PartsBagProps) {
  const [adding, setAdding] = useState(false)

  const updateCut = (panelId: string, patch: Partial<CompositeCut>) =>
    onChange({ ...composite, panels: composite.panels.map(p => (p.id === panelId ? { ...p, cut: { ...p.cut, ...patch } } : p)) })

  const removePanel = (panelId: string) =>
    onChange({
      ...composite,
      panels: composite.panels.filter(p => p.id !== panelId),
      rows: composite.rows.map(r => ({ ...r, wafers: r.wafers.filter(w => w.panelId !== panelId) })),
    })

  return (
    <aside className="parts-bag" aria-label="Parts bag">
      <header className="parts-bag-head">
        <h3>Parts bag</h3>
        <span className="muted">{constructionLabel(composite.construction)}</span>
      </header>

      {composite.panels.map(panel => {
        const board = boards.find(b => b.id === panel.boardId)
        const pieces = panelPieces(panel, boards)
        return (
          <section key={panel.id} className="panel-card">
            <div className="panel-card-head">
              <button type="button" className="panel-name" onClick={() => onEditPanel(panel.boardId)} title="Edit this board">
                <Pencil size={13} /> {board?.name ?? 'Missing board'}
              </button>
              <button type="button" className="icon-button" aria-label="Remove panel" onClick={() => removePanel(panel.id)}><Trash2 size={14} /></button>
            </div>

            <div className="cut-control">
              <div className="axis-toggle" role="group" aria-label="Cut direction">
                <button type="button" className={panel.cut.axis === 'x' ? 'active' : ''} onClick={() => updateCut(panel.id, { axis: 'x' })}>Crosscut ↕</button>
                <button type="button" className={panel.cut.axis === 'y' ? 'active' : ''} onClick={() => updateCut(panel.id, { axis: 'y' })}>Rip ↔</button>
              </div>
              <div className="cut-steppers">
                <NumberField label="Slice" value={panel.cut.stripWidthMm} min={1} step={1} onChange={v => updateCut(panel.id, { stripWidthMm: v })} />
                <label className="field count-field">
                  <span>Count</span>
                  <input type="number" min={0} step={1} value={panel.cut.count} aria-label="Wafer count" onChange={e => updateCut(panel.id, { count: Math.max(0, Math.round(Number(e.target.value))) })} />
                </label>
              </div>
            </div>

            <div className="wafer-chips">
              {pieces.map(piece => {
                const placed = placedKeys.has(pieceKey(panel.id, piece.index))
                const aspect = piece.heightMm > 0 ? piece.widthMm / piece.heightMm : 1
                return (
                  <button
                    key={piece.index}
                    type="button"
                    className={`wafer-chip ${placed ? 'placed' : ''}`}
                    disabled={placed}
                    title={placed ? 'Already placed' : 'Tap to drop into the active row'}
                    onClick={() => onPlaceWafer(panel.id, piece.index)}
                  >
                    <svg viewBox={`0 0 ${Math.max(1, piece.widthMm)} ${Math.max(1, piece.heightMm)}`} preserveAspectRatio="xMidYMid meet" style={{ aspectRatio: `${aspect}` }}>
                      <WaferFace piece={piece} cell={{ panelId: panel.id, pieceIndex: piece.index, rotate: 0, flip: false }} />
                    </svg>
                  </button>
                )
              })}
              {pieces.length === 0 && <p className="muted small">No wafers — set a slice count.</p>}
            </div>
          </section>
        )
      })}

      {adding ? (
        <AddPanelMenu
          composite={composite}
          boards={boards}
          onAddInline={() => { setAdding(false); onAddInline() }}
          onPickBoard={id => { setAdding(false); onPickBoard(id) }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button type="button" className="add-panel" onClick={() => setAdding(true)}><Plus size={15} /> Add panel</button>
      )}
    </aside>
  )
}

function AddPanelMenu({ composite, boards, onAddInline, onPickBoard, onCancel }: {
  composite: CompositeBoard
  boards: BoardProject[]
  onAddInline: () => void
  onPickBoard: (boardId: string) => void
  onCancel: () => void
}) {
  const used = new Set(composite.panels.map(p => p.boardId))
  return (
    <div className="add-panel-menu">
      <div className="add-panel-menu-head">
        <strong>Add a panel</strong>
        <button type="button" className="icon-button" aria-label="Cancel" onClick={onCancel}><X size={14} /></button>
      </div>
      <button type="button" className="add-panel-new" onClick={onAddInline}><Plus size={14} /> Design a new board</button>
      <p className="muted small">…or slice an existing board:</p>
      <ul className="board-pick-list">
        {boards.map(board => {
          const wrongGrain = board.construction !== composite.construction
          const already = used.has(board.id)
          const disabled = wrongGrain || already
          const reason = wrongGrain
            ? `${constructionLabel(composite.construction)} composite can't include an ${constructionLabel(board.construction).toLowerCase()} board`
            : already ? 'Already in this composite' : ''
          return (
            <li key={board.id}>
              <button type="button" disabled={disabled} title={reason} onClick={() => onPickBoard(board.id)}>
                <span>{board.name}</span>
                <span className="muted small">{constructionLabel(board.construction)}</span>
              </button>
            </li>
          )
        })}
        {boards.length === 0 && <li className="muted small">No saved boards yet.</li>}
      </ul>
    </div>
  )
}
