import type { CompositeBoard, SourcePanel, WoodSpecies } from '../../types'
import { panelPieces } from '../../domain/compositeBoard'
import { buildRegistry, pieceKey, selectableSourceBoardIds } from '../../domain/compositeAssembly'
import { CompositePieceFace } from './CompositePieceFace'
import { createId } from '../../id'

export interface PanelRailProps {
  board: CompositeBoard
  boards: CompositeBoard[]
  woods: WoodSpecies[]
  selectedPieceKey: string | null
  onSelectPiece: (key: string | null) => void
  onChangeBoard: (board: CompositeBoard) => void
  onEditPanel: (panelId: string) => void
}

export function PanelRail({ board, boards, woods, selectedPieceKey, onSelectPiece, onChangeBoard, onEditPanel }: PanelRailProps) {
  const registry = buildRegistry(boards)

  const addRipPanel = () => {
    const panel: SourcePanel = {
      id: createId(),
      name: `Panel ${board.panels.length + 1}`,
      kind: 'rip',
      construction: 'edge',
      thicknessMm: 38,
      strips: [{ id: createId(), speciesId: woods[0]?.id ?? 'walnut', width: 38, trailingAngle: 0 }],
      crosscut: { stripWidthMm: 25, kerfMm: 3, count: 4 },
    }
    onChangeBoard({ ...board, panels: [...board.panels, panel] })
    onEditPanel(panel.id)
  }

  const addDerivedPanel = (sourceBoardId: string) => {
    const panel: SourcePanel = {
      id: createId(),
      name: `From ${registry.get(sourceBoardId)?.name ?? 'board'}`,
      kind: 'derived',
      construction: 'edge',
      sourceBoardId,
      crosscut: { stripWidthMm: 25, kerfMm: 3, count: 4 },
    }
    onChangeBoard({ ...board, panels: [...board.panels, panel] })
  }

  const setCount = (panelId: string, count: number) =>
    onChangeBoard({
      ...board,
      panels: board.panels.map(p =>
        p.id === panelId ? { ...p, crosscut: { ...p.crosscut, count: Math.max(0, count) } } : p
      ),
    })

  const candidates = selectableSourceBoardIds(boards, board.id)

  return (
    <div className="panel-rail">
      {board.panels.map(panel => {
        const pieces = panelPieces(panel, registry)
        return (
          <div className="panel-card" key={panel.id}>
            <button className="panel-card-head" onClick={() => onEditPanel(panel.id)}>
              <span className="panel-card-name">{panel.name}</span>
              <span className="panel-card-meta">
                {panel.kind === 'rip' ? `${panel.strips.length} strips` : 'derived'}
              </span>
            </button>
            <div className="crosscut-stepper">
              <button
                className="icon-button"
                aria-label="Fewer pieces"
                onClick={() => setCount(panel.id, panel.crosscut.count - 1)}
              >−</button>
              <span>crosscut into {panel.crosscut.count}</span>
              <button
                className="icon-button"
                aria-label="More pieces"
                onClick={() => setCount(panel.id, panel.crosscut.count + 1)}
              >+</button>
            </div>
            <div className="piece-tray">
              {pieces.map(piece => {
                const key = pieceKey(panel.id, piece.index)
                return (
                  <button
                    key={key}
                    className={`piece-chip${selectedPieceKey === key ? ' is-selected' : ''}`}
                    aria-pressed={selectedPieceKey === key}
                    onClick={() => onSelectPiece(selectedPieceKey === key ? null : key)}
                  >
                    <svg
                      viewBox={`0 0 ${piece.widthMm} ${piece.heightMm}`}
                      width={40}
                      height={40}
                      preserveAspectRatio="xMidYMid meet"
                    >
                      <CompositePieceFace
                        piece={piece}
                        panel={panel}
                        cell={{ panelId: panel.id, pieceIndex: piece.index, rotate: 0, flip: false }}
                        pxPerMm={1}
                      />
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
        <button className="button" onClick={addRipPanel}>+ Add rip panel</button>
        {candidates.length > 0 && (
          <select
            aria-label="Add panel from a finished board"
            defaultValue=""
            onChange={e => {
              if (e.target.value) {
                addDerivedPanel(e.target.value)
                e.target.value = ''
              }
            }}
          >
            <option value="" disabled>+ From a finished board…</option>
            {candidates.map(id => (
              <option key={id} value={id}>{boards.find(b => b.id === id)?.name ?? id}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}
