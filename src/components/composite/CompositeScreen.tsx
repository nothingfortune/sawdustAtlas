import { useEffect, useRef, useState } from 'react'
import type { BoardProject, CompositeBoard, CompositePanel, WoodSpecies } from '../../types'
import { resizeGrid, placeCell } from '../../domain/compositeAssembly'
import { panelPieces } from '../../domain/compositeBoard'
import { createId } from '../../id'
import { WoodPatterns } from '../board/WoodPatterns'
import { CompositePieceFace } from './CompositePieceFace'
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

interface Carry { key: string; startX: number; startY: number; dragging: boolean }

export function CompositeScreen({ composite, boards, woods, onChange, onCreateBoardForPanel, onEditBoard, onBack }: CompositeScreenProps) {
  const [selectedPieceKey, setSelectedPieceKey] = useState<string | null>(null)
  const carryRef = useRef<Carry | null>(null)
  const [ghost, setGhost] = useState<{ key: string; x: number; y: number } | null>(null)

  // Pointer drag from a tray chip to a grid cell. Listeners live on window so the
  // drag works across the rail/canvas boundary; a <8px press is treated as a tap
  // (selects the wafer for tap-to-place instead).
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const c = carryRef.current
      if (!c) return
      const dragging = c.dragging || Math.hypot(e.clientX - c.startX, e.clientY - c.startY) > 8
      carryRef.current = { ...c, dragging }
      if (dragging) setGhost({ key: c.key, x: e.clientX, y: e.clientY })
    }
    const up = (e: PointerEvent) => {
      const c = carryRef.current
      carryRef.current = null
      setGhost(null)
      if (!c) return
      if (c.dragging) {
        const cellEl = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-cell-index]')
        const index = cellEl ? Number(cellEl.getAttribute('data-cell-index')) : -1
        const [panelId, idxRaw] = c.key.split(':')
        const pieceIndex = Number(idxRaw)
        if (index >= 0 && panelId && Number.isFinite(pieceIndex)) {
          onChange({ ...composite, cells: placeCell(composite.cells, index, { panelId, pieceIndex, rotate: 0, flip: false }) })
        }
      } else {
        setSelectedPieceKey(prev => prev === c.key ? null : c.key)
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [composite, onChange])

  const onStartCarry = (key: string, startX: number, startY: number) => { carryRef.current = { key, startX, startY, dragging: false } }

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

  // Resolve the carried wafer for the floating ghost preview.
  const ghostPiece = (() => {
    if (!ghost) return null
    const [panelId, idxRaw] = ghost.key.split(':')
    const panel = composite.panels.find(p => p.id === panelId)
    if (!panel) return null
    return panelPieces(panel, boards)[Number(idxRaw)] ?? null
  })()

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
          selectedPieceKey={selectedPieceKey} onStartCarry={onStartCarry}
          onChange={onChange} onAddInline={onAddInline} onPickBoard={onPickBoard} onEditPanel={onEditBoard}
        />
        <AssemblyCanvas
          composite={composite} boards={boards} woods={woods}
          selectedPieceKey={selectedPieceKey} dropActive={selectedPieceKey !== null || ghost !== null}
          onChange={onChange} onConsumeSelection={() => setSelectedPieceKey(null)}
        />
        <CompositeSummary composite={composite} boards={boards} woods={woods} />
      </div>
      {ghost && ghostPiece && (
        <svg className="wafer-ghost" style={{ position: 'fixed', left: ghost.x - 30, top: ghost.y - 18, width: 60, height: 36, pointerEvents: 'none', zIndex: 50 }}
          viewBox={`0 0 ${ghostPiece.widthMm} ${ghostPiece.heightMm}`} preserveAspectRatio="xMidYMid meet">
          <defs><WoodPatterns woods={woods} /></defs>
          <CompositePieceFace piece={ghostPiece} cell={{ panelId: '', pieceIndex: 0, rotate: 0, flip: false }} />
        </svg>
      )}
    </div>
  )
}
