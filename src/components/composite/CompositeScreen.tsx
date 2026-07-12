import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { BoardProject, CompositeBoard, PricingSettings, WoodSpecies } from '../../types'
import { addRow, addWaferToRow, pieceKey } from '../../domain/compositeAssembly'
import { DEFAULT_KERF_MM } from '../../data'
import { createId } from '../../id'
import { PartsBag } from './PartsBag'
import { AssemblyDesk } from './AssemblyDesk'
import { FinalPreview } from './FinalPreview'
import { CompositeSummary } from './CompositeSummary'

export interface CompositeScreenProps {
  composite: CompositeBoard
  boards: BoardProject[]
  woods: WoodSpecies[]
  pricing: PricingSettings
  onChange: (composite: CompositeBoard) => void
  onCreateBoardForPanel: (construction: 'edge' | 'end') => string
  onEditBoard: (boardId: string) => void
  onBack: () => void
}

const defaultCut = () => ({ axis: 'x' as const, stripWidthMm: 25, kerfMm: DEFAULT_KERF_MM, count: 4 })

export function CompositeScreen({ composite, boards, woods, pricing, onChange, onCreateBoardForPanel, onEditBoard, onBack }: CompositeScreenProps) {
  const [activeRowId, setActiveRowId] = useState(composite.rows[0]?.id ?? '')
  const effectiveRow = composite.rows.find(r => r.id === activeRowId) ?? composite.rows[0]
  const effectiveRowId = effectiveRow?.id ?? ''

  const placedKeys = new Set(composite.rows.flatMap(r => r.wafers.map(w => pieceKey(w.panelId, w.pieceIndex))))

  const addPanel = (boardId: string) =>
    onChange({ ...composite, panels: [...composite.panels, { id: createId(), boardId, cut: defaultCut() }] })

  const onAddInline = () => {
    const boardId = onCreateBoardForPanel(composite.construction)
    addPanel(boardId)
    onEditBoard(boardId)
  }

  const onPlaceWafer = (panelId: string, pieceIndex: number) => {
    const cell = { panelId, pieceIndex, rotate: 0 as const, flip: false }
    if (effectiveRowId) { onChange(addWaferToRow(composite, effectiveRowId, cell)); return }
    // No rows yet — create one, place into it, and make it active.
    const withRow = addRow(composite, 'below', createId)
    const newRow = withRow.rows[withRow.rows.length - 1]
    if (!newRow) return
    onChange(addWaferToRow(withRow, newRow.id, cell))
    setActiveRowId(newRow.id)
  }

  return (
    <div className="composite-screen">
      <header className="composite-screen-head">
        <button type="button" className="backup-button" onClick={onBack}><ArrowLeft size={15} /> Boards</button>
        <input
          className="composite-name"
          aria-label="Composite name"
          value={composite.name}
          onChange={e => onChange({ ...composite, name: e.target.value })}
        />
        <span className="composite-badge">{composite.construction === 'end' ? 'End grain' : 'Edge grain'}</span>
      </header>

      <div className="composite-body">
        <PartsBag
          composite={composite}
          boards={boards}
          woods={woods}
          placedKeys={placedKeys}
          onChange={onChange}
          onAddInline={onAddInline}
          onPickBoard={addPanel}
          onEditPanel={onEditBoard}
          onPlaceWafer={onPlaceWafer}
        />
        <AssemblyDesk
          composite={composite}
          boards={boards}
          woods={woods}
          activeRowId={effectiveRowId}
          onSelectRow={setActiveRowId}
          onChange={onChange}
        />
        <div className="composite-aside">
          <FinalPreview composite={composite} boards={boards} woods={woods} />
          <CompositeSummary composite={composite} boards={boards} woods={woods} pricing={pricing} />
        </div>
      </div>
    </div>
  )
}
