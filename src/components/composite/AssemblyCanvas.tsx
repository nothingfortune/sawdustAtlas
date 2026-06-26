import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { AssemblyCell, CompositeBoard, WoodSpecies } from '../../types'
import { panelPieces, placedFootprint } from '../../domain/compositeBoard'
import { buildRegistry, cellFromPointer, clearCell, cycleTransform, moveCell, placeCell, type CellRect } from '../../domain/compositeAssembly'
import { resolveScale } from '../../domain/boardScale'
import { useContainerWidth } from '../useContainerWidth'
import { usePinchPan } from '../usePinchPan'
import { WoodPatterns } from '../board/WoodPatterns'
import { CompositePieceFace } from './CompositePieceFace'

export interface AssemblyCanvasProps {
  board: CompositeBoard
  boards: CompositeBoard[]
  woods: WoodSpecies[]
  selectedPieceKey: string | null
  onChangeBoard: (board: CompositeBoard) => void
  onConsumeSelection: () => void
}

export function AssemblyCanvas({
  board,
  boards,
  woods,
  selectedPieceKey,
  onChangeBoard,
  onConsumeSelection,
}: AssemblyCanvasProps) {
  const registry = buildRegistry(boards)
  const [canvasRef, canvasWidth] = useContainerWidth(820)
  const pinch = usePinchPan()
  const gridRef = useRef<SVGSVGElement | null>(null)
  const [drag, setDrag] = useState<{ from: number; startX: number; startY: number; moved: boolean } | null>(null)

  // Resolve the piece + panel for an AssemblyCell (returns undefined when out-of-range).
  const pieceFor = (cellValue: AssemblyCell | null) => {
    if (!cellValue) return undefined
    const panel = board.panels.find(p => p.id === cellValue.panelId)
    if (!panel) return undefined
    const piece = panelPieces(panel, registry)[cellValue.pieceIndex]
    return piece ? { panel, piece } : undefined
  }

  // Regular slot size: max piece dimension across all panels (fallback 50mm).
  // Computed functionally — no render-body mutation.
  const allDims = board.panels.flatMap(panel =>
    panelPieces(panel, registry).flatMap(piece => [piece.widthMm, piece.heightMm])
  )
  const slotSize = Math.max(50, ...allDims)
  const slotW = slotSize
  const slotH = slotSize
  const contentW = slotW * board.cols
  const contentH = slotH * board.rows
  const { pxPerMm } = resolveScale(contentW, canvasWidth)

  // Build client-coordinate rects for each grid cell (computed on demand during
  // pointer events so they reflect the current rendered position after pinch/pan).
  const cellRectsClient = (): CellRect[] => {
    const svg = gridRef.current
    if (!svg) return []
    const box = svg.getBoundingClientRect()
    const sx = box.width / contentW
    const sy = box.height / contentH
    const rects: CellRect[] = []
    for (let r = 0; r < board.rows; r += 1) {
      for (let c = 0; c < board.cols; c += 1) {
        rects.push({
          index: r * board.cols + c,
          left: box.left + c * slotW * sx,
          top: box.top + r * slotH * sy,
          right: box.left + (c + 1) * slotW * sx,
          bottom: box.top + (r + 1) * slotH * sy,
        })
      }
    }
    return rects
  }

  // Tap an empty cell with a selected tray piece → place; tap a placed piece → cycleTransform.
  const placeOrTransform = (index: number) => {
    const existing = board.cells[index] ?? null
    if (existing) {
      onChangeBoard({ ...board, cells: placeCell(board.cells, index, cycleTransform(existing)) })
      return
    }
    if (selectedPieceKey) {
      const [panelId, pieceIndexRaw] = selectedPieceKey.split(':')
      const pieceIndex = Number(pieceIndexRaw)
      if (panelId && Number.isFinite(pieceIndex)) {
        onChangeBoard({
          ...board,
          cells: placeCell(board.cells, index, { panelId, pieceIndex, rotate: 0, flip: false }),
        })
        onConsumeSelection()
      }
    }
  }

  // Single-pointer handlers. usePinchPan only engages on a 2nd pointer, so taps/drags
  // on the SVG pass through; the pinch handlers on the wrapper div see the same events.
  const onPointerDown = (e: ReactPointerEvent) => {
    // Fix #1: when a second pointer arrives (pinch), cancel any pending single-finger drag
    // so the primary finger's eventual pointerup cannot fire moveCell mid-pinch.
    if (e.isPrimary === false) { setDrag(null); return }
    const idx = cellFromPointer(cellRectsClient(), e.clientX, e.clientY)
    if (idx < 0) return
    setDrag({ from: idx, startX: e.clientX, startY: e.clientY, moved: false })
    // Fix #2: capture the primary pointer so move/up fire even when the finger drifts
    // outside the SVG. Capture is per-pointerId; usePinchPan on the wrapper div captures
    // the 2nd pointerId independently, so pinch is unaffected.
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    setDrag(d =>
      d
        ? { ...d, moved: d.moved || Math.abs(e.clientX - d.startX) > 10 || Math.abs(e.clientY - d.startY) > 10 }
        : d
    )
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    // Defensive release in case the browser didn't auto-release on pointerup.
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    const d = drag
    setDrag(null)
    if (!d) return
    const idx = cellFromPointer(cellRectsClient(), e.clientX, e.clientY)
    const fromCell = board.cells[d.from] ?? null
    if (d.moved && fromCell && idx >= 0 && idx !== d.from) {
      onChangeBoard({ ...board, cells: moveCell(board.cells, d.from, idx) })
    } else if (!d.moved && idx === d.from) {
      placeOrTransform(d.from)
    }
  }

  const clearAt = (index: number) =>
    onChangeBoard({ ...board, cells: clearCell(board.cells, index) })

  return (
    <div className="assembly-canvas">
      {/* touch-action:none lets usePinchPan capture all pointer events on mobile */}
      <div
        className="pinch-viewport"
        ref={canvasRef}
        {...pinch.handlers}
        style={{ touchAction: 'none' }}
      >
        <div
          className="pinch-content"
          style={{
            transform: `translate(${pinch.x}px, ${pinch.y}px) scale(${pinch.scale})`,
            transformOrigin: '0 0',
          }}
        >
          <svg
            ref={gridRef}
            viewBox={`0 0 ${contentW} ${contentH}`}
            width={contentW * pxPerMm}
            height={contentH * pxPerMm}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={(e) => { e.currentTarget.releasePointerCapture?.(e.pointerId); setDrag(null) }}
            role="group"
            aria-label="Composite board assembly grid"
          >
            <WoodPatterns woods={woods} />
            {Array.from({ length: board.rows * board.cols }, (_, index) => {
              const r = Math.floor(index / board.cols)
              const c = index % board.cols
              const cellValue = board.cells[index] ?? null
              const resolved = pieceFor(cellValue)
              return (
                <g key={index} transform={`translate(${c * slotW} ${r * slotH})`}>
                  <rect x={0} y={0} width={slotW} height={slotH} fill="#fff" stroke="#0002" strokeWidth={0.5} />
                  {resolved && cellValue && (() => {
                    const fp = placedFootprint(resolved.piece, cellValue)
                    return (
                      <g transform={`translate(${(slotW - fp.widthMm) / 2} ${(slotH - fp.heightMm) / 2})`}>
                        <CompositePieceFace
                          piece={resolved.piece}
                          panel={resolved.panel}
                          cell={cellValue}
                          pxPerMm={pxPerMm}
                        />
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
        <button className="button" onClick={() => pinch.reset()} disabled={!pinch.active}>
          Reset zoom
        </button>
        {board.cells.some(Boolean) && (
          <button
            className="button"
            onClick={() => onChangeBoard({ ...board, cells: board.cells.map((): null => null) })}
          >
            Clear all
          </button>
        )}
      </div>
      {/* Per-occupied-cell ✕ affordance rendered outside the SVG for easy touch targeting */}
      <div className="cell-clear-row">
        {board.cells.map((cv, index) =>
          cv ? (
            <button
              key={index}
              className="icon-button"
              aria-label={`Clear cell ${index + 1}`}
              onClick={() => clearAt(index)}
            >
              ✕{index + 1}
            </button>
          ) : null
        )}
      </div>
    </div>
  )
}
