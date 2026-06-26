import { useState } from 'react'
import type { CompositeBoard, SourcePanel, WoodSpecies } from '../../types'
import { NumberField } from '../fields'
import { resizeGrid } from '../../domain/compositeAssembly'
import { PanelRail } from './PanelRail'
import { PanelEditorDrawer } from './PanelEditorDrawer'
import { AssemblyCanvas } from './AssemblyCanvas'
import { CompositeSummary } from './CompositeSummary'

export interface CompositeBoardsProps {
  projects: CompositeBoard[]
  project: CompositeBoard | undefined
  woods: WoodSpecies[]
  onSelect: (id: string) => void
  onCreate: () => void
  onChange: (project: CompositeBoard) => void
  onDelete: (id: string) => void
}

export function CompositeBoards({ projects, project, woods, onSelect, onCreate, onChange, onDelete }: CompositeBoardsProps) {
  const [selectedPieceKey, setSelectedPieceKey] = useState<string | null>(null)
  const [editingPanelId, setEditingPanelId] = useState<string | null>(null)

  if (!project) {
    return (
      <div className="composite-empty">
        <p>No composite board yet.</p>
        <button className="button" onClick={onCreate}>+ New composite board</button>
      </div>
    )
  }

  const setRows = (rows: number) => onChange({ ...project, rows: Math.max(1, rows), cells: resizeGrid(project.cells, project.cols, Math.max(1, rows), project.cols) })
  const setCols = (cols: number) => onChange({ ...project, cols: Math.max(1, cols), cells: resizeGrid(project.cells, project.cols, project.rows, Math.max(1, cols)) })
  const editingPanel = project.panels.find(p => p.id === editingPanelId)
  const changePanel = (panel: SourcePanel) => onChange({ ...project, panels: project.panels.map(p => p.id === panel.id ? panel : p) })

  return (
    <div className="composite-board">
      <header className="composite-head">
        <select value={project.id} onChange={e => onSelect(e.target.value)} aria-label="Select composite board">
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input className="composite-name" value={project.name} onChange={e => onChange({ ...project, name: e.target.value })} />
        <button className="button" onClick={onCreate}>+ New</button>
        <button className="button danger" onClick={() => onDelete(project.id)}>Delete</button>
        <NumberField label="Rows" value={project.rows} min={1} step={1} onChange={setRows} />
        <NumberField label="Cols" value={project.cols} min={1} step={1} onChange={setCols} />
      </header>

      <div className="composite-body">
        <PanelRail
          board={project} boards={projects} woods={woods}
          selectedPieceKey={selectedPieceKey} onSelectPiece={setSelectedPieceKey}
          onChangeBoard={onChange} onEditPanel={setEditingPanelId}
        />
        <AssemblyCanvas
          board={project} boards={projects} woods={woods}
          selectedPieceKey={selectedPieceKey} onChangeBoard={onChange}
          onConsumeSelection={() => setSelectedPieceKey(null)}
        />
        <CompositeSummary board={project} boards={projects} woods={woods} />
      </div>

      {editingPanel && (
        <PanelEditorDrawer panel={editingPanel} woods={woods} onChange={changePanel} onClose={() => setEditingPanelId(null)} />
      )}
    </div>
  )
}
