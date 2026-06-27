import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, X } from 'lucide-react'
import type { BoardProject, CompositeBoard, WoodSpecies } from '../../types'
import { croppedLayout } from '../../domain/compositeBoard'
import { useModalDialog } from '../useModalDialog'
import { usePinchPan } from '../usePinchPan'
import { WoodPatterns } from '../board/WoodPatterns'
import { WaferFace } from './WaferFace'

// Running offsets (module-level so the prefix-sum isn't an in-render reassignment).
function offsets(sizes: number[]): number[] {
  const out: number[] = []
  let sum = 0
  for (const s of sizes) { out.push(sum); sum += s }
  return out
}

export interface FinalPreviewProps {
  composite: CompositeBoard
  boards: BoardProject[]
  woods: WoodSpecies[]
}

// The finished, 4-sided board: cropped rows butted with no gaps, each wafer drawn
// at only its kept rect. Pure SVG with a viewBox so it scales to fill whatever
// box it's given (inline panel, gallery thumbnail, or full-screen pop-out).
export function CroppedBoard({ composite, boards, woods, idPrefix }: FinalPreviewProps & { idPrefix: string }) {
  const layout = croppedLayout(composite, boards)
  if (!(layout.widthMm > 0) || !(layout.lengthMm > 0)) {
    return <p className="muted small">Place some wafers to see the finished board.</p>
  }
  const rowTops = offsets(layout.rows.map(r => r.heightMm))
  const rows = layout.rows.map((row, ri) => {
    const top = rowTops[ri] ?? 0
    const lefts = offsets(row.placed.map(p => p.keptWidthMm))
    const cells = row.placed.map((pr, i) => {
      const left = lefts[i] ?? 0
      const clipId = `${idPrefix}-${row.rowId}-${i}`
      return (
        <g key={i}>
          <clipPath id={clipId}><rect x={left} y={top} width={pr.keptWidthMm} height={row.heightMm} /></clipPath>
          <g clipPath={`url(#${clipId})`}>
            <g transform={`translate(${left - pr.trimLeftMm} ${top - pr.trimTopMm})`}>
              <WaferFace piece={pr.piece} cell={pr.wafer} board={boards.find(b => b.id === pr.piece.boardId)} />
            </g>
          </g>
        </g>
      )
    })
    return <g key={row.rowId}>{cells}</g>
  })

  return (
    <svg className="cropped-board" viewBox={`0 0 ${layout.widthMm} ${layout.lengthMm}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Finished composite board">
      <defs><WoodPatterns woods={woods} /></defs>
      {rows}
      <rect className="board-outline" x={0} y={0} width={layout.widthMm} height={layout.lengthMm} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function FinalPreview(props: FinalPreviewProps) {
  const [popout, setPopout] = useState(false)
  return (
    <section className="final-preview" aria-label="Final preview">
      <header className="final-preview-head">
        <span className="eyebrow">FINISHED BOARD</span>
        <button type="button" className="studio-icon" aria-label="Pop out at full size" onClick={() => setPopout(true)}><Maximize2 size={16} /></button>
      </header>
      <div className="final-preview-stage">
        <CroppedBoard {...props} idPrefix="final" />
      </div>
      {popout && <FinalPreviewPopout {...props} onClose={() => setPopout(false)} />}
    </section>
  )
}

function FinalPreviewPopout({ onClose, ...props }: FinalPreviewProps & { onClose: () => void }) {
  const pinch = usePinchPan()
  const dialogRef = useModalDialog<HTMLDivElement>(onClose)
  return createPortal(
    <div className="modal-scrim" role="presentation" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={dialogRef} tabIndex={-1} className="preview-popout" role="dialog" aria-modal="true" aria-label="Finished composite board">
        <header>
          <strong>Finished board</strong>
          <button className="icon-button" onClick={onClose} aria-label="Close preview"><X /></button>
        </header>
        <div className="popout-body pinch-viewport" {...pinch.handlers}>
          <div className="pinch-content" style={{ transform: `translate(${pinch.x}px, ${pinch.y}px) scale(${pinch.scale})` }}>
            <CroppedBoard {...props} idPrefix="final-pop" />
          </div>
          {pinch.active && <button className="zoom-reset" onClick={pinch.reset}>Reset zoom</button>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
