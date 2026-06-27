import type { BoardProject, CompositeBoard } from '../types'

// Cutting Boards landing: a gallery of boards (and composites, badged) plus a
// create-new card. Selecting a card opens the designer or the composite screen.
export function BoardGallery({ boards, composites, onOpenBoard, onOpenComposite, onCreateBoard }: {
  boards: BoardProject[]
  composites: CompositeBoard[]
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
            <span className="gallery-name">{board.name}</span>
            <span className="gallery-meta">{Math.round(board.length)} mm · {board.construction === 'end' ? 'End grain' : 'Edge grain'} · {board.strips.length} strips</span>
          </button>
        ))}
        {composites.map(composite => (
          <button key={composite.id} className="gallery-card gallery-composite" onClick={() => onOpenComposite(composite.id)}>
            <span className="gallery-badge">Composite</span>
            <span className="gallery-name">{composite.name}</span>
            <span className="gallery-meta">{composite.rows}×{composite.cols} grid · {composite.panels.length} panels</span>
          </button>
        ))}
      </div>
    </div>
  )
}
