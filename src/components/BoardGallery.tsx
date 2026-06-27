import type { BoardProject, CompositeBoard, WoodSpecies } from '../types'
import { WoodPatterns } from './board/WoodPatterns'
import { LongGrainFace } from './board/LongGrainFace'

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
            <div className="gallery-thumb-wrap"><div className="thumb-empty">Composite</div></div>
            <span className="gallery-badge">Composite</span>
            <span className="gallery-name">{composite.name}</span>
            <span className="gallery-meta">{composite.panels.length} panels</span>
          </button>
        ))}
      </div>
    </div>
  )
}
