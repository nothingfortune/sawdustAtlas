import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { AssemblyCell, BoardProject, CompositeBoard, WoodSpecies } from '../../types'
import { panelPieces, placedFootprint } from '../../domain/compositeBoard'
import { cellFromPointer, clearCell, cycleTransform, flipX, flipY, moveCell, placeCell, rotateLeft, rotateRight, type CellRect } from '../../domain/compositeAssembly'
import { fitPxPerMm } from '../../domain/boardScale'
import { useElementSize } from '../useElementSize'
import { usePinchPan } from '../usePinchPan'
import { WoodPatterns } from '../board/WoodPatterns'
import { CompositePieceFace } from './CompositePieceFace'

export interface AssemblyCanvasProps {
  composite: CompositeBoard
  boards: BoardProject[]
  woods: WoodSpecies[]
  selectedPieceKey: string | null
  onChange: (composite: CompositeBoard) => void
  onConsumeSelection: () => void
}

export function AssemblyCanvas({ composite, boards, woods, selectedPieceKey, onChange, onConsumeSelection }: AssemblyCanvasProps) {
  const [boxRef, box] = useElementSize()
  const pinch = usePinchPan()
  const gridRef = useRef<SVGSVGElement | null>(null)
  const [drag, setDrag] = useState<{ from: number; startX: number; startY: number; moved: boolean } | null>(null)
  const [selectedCell, setSelectedCell] = useState<number | null>(null)

  const pieceFor = (cellValue: AssemblyCell | null) => {
    if (!cellValue) return undefined
    const panel = composite.panels.find(p => p.id === cellValue.panelId)
    if (!panel) return undefined
    return panelPieces(panel, boards)[cellValue.pieceIndex]
  }

  // Regular slot = max piece footprint across panels (fallback 50mm); the grid
  // fits its container so cells are large and touchable.
  const allDims = composite.panels.flatMap(panel => panelPieces(panel, boards).flatMap(p => [p.widthMm, p.heightMm]))
  const slot = Math.max(50, ...allDims)
  const contentW = slot * composite.cols
  const contentH = slot * composite.rows
  const pxPerMm = fitPxPerMm(contentW, contentH, Math.max(1, box.width), Math.max(1, box.height))

  const cellRectsClient = (): CellRect[] => {
    const svg = gridRef.current
    if (!svg) return []
    const r = svg.getBoundingClientRect()
    const sx = r.width / contentW
    const sy = r.height / contentH
    const rects: CellRect[] = []
    for (let row = 0; row < composite.rows; row += 1) {
      for (let col = 0; col < composite.cols; col += 1) {
        rects.push({
          index: row * composite.cols + col,
          left: r.left + col * slot * sx,
          top: r.top + row * slot * sy,
          right: r.left + (col + 1) * slot * sx,
          bottom: r.top + (row + 1) * slot * sy,
        })
      }
    }
    return rects
  }

  const placeOrTransform = (index: number) => {
    const existing = composite.cells[index] ?? null
    if (existing) {
      setSelectedCell(index)
      onChange({ ...composite, cells: placeCell(composite.cells, index, cycleTransform(existing)) })
      return
    }
    if (selectedPieceKey) {
      const [panelId, idxRaw] = selectedPieceKey.split(':')
      const pieceIndex = Number(idxRaw)
      if (panelId && Number.isFinite(pieceIndex)) {
        onChange({ ...composite, cells: placeCell(composite.cells, index, { panelId, pieceIndex, rotate: 0, flip: false }) })
        setSelectedCell(index)
        onConsumeSelection()
      }
    }
  }

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.isPrimary === false) { setDrag(null); return }
    const idx = cellFromPointer(cellRectsClient(), e.clientX, e.clientY)
    if (idx < 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ from: idx, startX: e.clientX, startY: e.clientY, moved: false })
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    setDrag(d => d ? { ...d, moved: d.moved || Math.abs(e.clientX - d.startX) > 10 || Math.abs(e.clientY - d.startY) > 10 } : d)
  }
  const onPointerUp = (e: ReactPointerEvent) => {
    const d = drag
    setDrag(null)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (!d) return
    const idx = cellFromPointer(cellRectsClient(), e.clientX, e.clientY)
    const fromCell = composite.cells[d.from] ?? null
    if (d.moved && fromCell && idx >= 0 && idx !== d.from) {
      onChange({ ...composite, cells: moveCell(composite.cells, d.from, idx) })
      setSelectedCell(idx)
    } else if (!d.moved && idx === d.from) {
      placeOrTransform(d.from)
    }
  }

  const applyToSelected = (fn: (c: AssemblyCell) => AssemblyCell) => {
    if (selectedCell === null) return
    const cv = composite.cells[selectedCell] ?? null
    if (!cv) return
    onChange({ ...composite, cells: placeCell(composite.cells, selectedCell, fn(cv)) })
  }
  const clearAt = (index: number) => {
    onChange({ ...composite, cells: clearCell(composite.cells, index) })
    if (selectedCell === index) setSelectedCell(null)
  }
  const hasSelected = selectedCell !== null && Boolean(composite.cells[selectedCell])

  return (
    <div className="assembly-canvas">
      <div className="transform-toolbar">
        <button className="button" disabled={!hasSelected} onClick={() => applyToSelected(rotateLeft)} aria-label="Rotate left">⟲</button>
        <button className="button" disabled={!hasSelected} onClick={() => applyToSelected(rotateRight)} aria-label="Rotate right">⟳</button>
        <button className="button" disabled={!hasSelected} onClick={() => applyToSelected(flipX)} aria-label="Flip horizontal">⇋</button>
        <button className="button" disabled={!hasSelected} onClick={() => applyToSelected(flipY)} aria-label="Flip vertical">⥯</button>
      </div>
      <div className="pinch-viewport" ref={boxRef} {...pinch.handlers} style={{ touchAction: 'none' }}>
        <div className="pinch-content" style={{ transform: `translate(${pinch.x}px, ${pinch.y}px) scale(${pinch.scale})`, transformOrigin: '0 0' }}>
          <svg ref={gridRef} viewBox={`0 0 ${contentW} ${contentH}`} width={contentW * pxPerMm} height={contentH * pxPerMm}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDrag(null)}
            role="group" aria-label="Composite board assembly grid">
            <defs><WoodPatterns woods={woods} /></defs>
            {Array.from({ length: composite.rows * composite.cols }, (_, index) => {
              const row = Math.floor(index / composite.cols)
              const col = index % composite.cols
              const cellValue = composite.cells[index] ?? null
              const piece = pieceFor(cellValue)
              const isSel = selectedCell === index
              return (
                <g key={index} transform={`translate(${col * slot} ${row * slot})`}>
                  <rect x={0} y={0} width={slot} height={slot} fill="#fff" stroke={isSel ? '#c47a3d' : '#0002'} strokeWidth={isSel ? 1.2 : 0.5} />
                  {piece && cellValue && (() => {
                    const fpp = placedFootprint(piece, cellValue)
                    return (
                      <g transform={`translate(${(slot - fpp.widthMm) / 2} ${(slot - fpp.heightMm) / 2})`}>
                        <CompositePieceFace piece={piece} cell={cellValue} />
                      </g>
                    )
                  })()}
                </g>
              )
            })}
          </svg>
        </div>
      </div>
      <div className="canvas-controls">
        <button className="button" onClick={() => pinch.reset()} disabled={!pinch.active}>Reset zoom</button>
        {composite.cells.some(Boolean) && <button className="button" onClick={() => onChange({ ...composite, cells: composite.cells.map((): null => null) })}>Clear all</button>}
        {hasSelected && <button className="button" onClick={() => { if (selectedCell !== null) clearAt(selectedCell) }}>Clear cell</button>}
      </div>
    </div>
  )
}
