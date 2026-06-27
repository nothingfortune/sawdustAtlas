import type { BoardProject, CompositeBoard, WoodSpecies } from '../types'
import { panelPieces, placedFootprint } from '../domain/compositeBoard'
import { WoodPatterns } from './board/WoodPatterns'
import { LongGrainFace } from './board/LongGrainFace'
import { CompositePieceFace } from './composite/CompositePieceFace'

// True-to-scale mini of a board's long-grain face.
function BoardThumb({ board, woods }: { board: BoardProject; woods: WoodSpecies[] }) {
  const widthMm = board.strips.reduce((acc, s) => acc + Math.max(0, s.width), 0)
  if (widthMm <= 0 || board.length <= 0) return <div className="thumb-empty">No strips yet</div>
  return (
    <svg className="gallery-thumb" viewBox={`0 0 ${board.length} ${widthMm}`} preserveAspectRatio="xMidYMid meet">
      <defs><WoodPatterns woods={woods} /></defs>
      <LongGrainFace strips={board.strips} lengthMm={board.length} />
    </svg>
  )
}

// Mini of the assembled composite grid.
function CompositeThumb({ composite, boards, woods }: { composite: CompositeBoard; boards: BoardProject[]; woods: WoodSpecies[] }) {
  const dims = composite.panels.flatMap(p => panelPieces(p, boards).flatMap(pc => [pc.widthMm, pc.heightMm]))
  const slot = Math.max(50, ...dims)
  const contentW = slot * composite.cols
  const contentH = slot * composite.rows
  const map = new Map(composite.panels.map(p => [p.id, panelPieces(p, boards)]))
  if (!composite.cells.some(Boolean)) return <div className="thumb-empty">Empty grid</div>
  return (
    <svg className="gallery-thumb" viewBox={`0 0 ${contentW} ${contentH}`} preserveAspectRatio="xMidYMid meet">
      <defs><WoodPatterns woods={woods} /></defs>
      {composite.cells.map((cell, index) => {
        if (!cell) return null
        const piece = map.get(cell.panelId)?.[cell.pieceIndex]
        if (!piece) return null
        const row = Math.floor(index / composite.cols)
        const col = index % composite.cols
        const fp = placedFootprint(piece, cell)
        return (
          <g key={index} transform={`translate(${col * slot + (slot - fp.widthMm) / 2} ${row * slot + (slot - fp.heightMm) / 2})`}>
            <CompositePieceFace piece={piece} cell={cell} />
          </g>
        )
      })}
    </svg>
  )
}

export function BoardGallery({ boards, composites, woods, onOpenBoard, onOpenComposite, onCreateBoard }: {
  boards: BoardProject[]
  composites: CompositeBoard[]
  woods: WoodSpecies[]
  onOpenBoard: (id: string) => void
  onOpenComposite: (id: string) => void
  onCreateBoard: () => void
}) {
  return (
    <div className="board-gallery">
      <div className="gallery-grid">
        <button className="gallery-card gallery-new" onClick={onCreateBoard}>
          <span className="gallery-plus">＋</span>
          <span>New board</span>
        </button>
        {boards.map(board => (
          <button key={board.id} className="gallery-card" onClick={() => onOpenBoard(board.id)}>
            <div className="gallery-thumb-wrap"><BoardThumb board={board} woods={woods} /></div>
            <span className="gallery-name">{board.name}</span>
            <span className="gallery-meta">{Math.round(board.length)} mm · {board.construction === 'end' ? 'End grain' : 'Edge grain'} · {board.strips.length} strips</span>
          </button>
        ))}
        {composites.map(composite => (
          <button key={composite.id} className="gallery-card gallery-composite" onClick={() => onOpenComposite(composite.id)}>
            <div className="gallery-thumb-wrap"><CompositeThumb composite={composite} boards={boards} woods={woods} /></div>
            <span className="gallery-badge">Composite</span>
            <span className="gallery-name">{composite.name}</span>
            <span className="gallery-meta">{composite.rows}×{composite.cols} grid · {composite.panels.length} panels</span>
          </button>
        ))}
      </div>
    </div>
  )
}
