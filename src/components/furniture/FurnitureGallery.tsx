import { memo, useMemo, useState } from 'react'
import { Armchair, Copy, Trash2, TriangleAlert } from 'lucide-react'
import type { BuildAllowances, WoodSpecies } from '../../types'
import type { FurnitureProject } from '../../domain/furniture/types'
import { formatDimensions } from '../../domain/lengthUnits'
import { useUnitSystem } from '../unitSystem'
import { NewFurnitureDialog } from './NewFurnitureDialog'
import type { NewFurnitureRequest } from './NewFurnitureDialog'
import { summarizeFurniture } from './summary'
import type { FurnitureSummary } from './summary'

export type { NewFurnitureRequest }

// One project card. Memoized on its project and the shared context so an edit to one
// project does not re-resolve every other card.
const FurnitureCard = memo(function FurnitureCard({ project, woods, allowances, onOpen, onDuplicate, onDelete }: {
  project: FurnitureProject
  woods: WoodSpecies[]
  allowances: BuildAllowances
  onOpen: (id: string) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
}) {
  const { lengthUnit } = useUnitSystem()
  const summary = useMemo(() => summarizeFurniture(project, { woods, allowances }), [project, woods, allowances])
  return <div className="gallery-card furniture-card">
    <button type="button" className="furniture-card-open" onClick={() => onOpen(project.id)}>
      <div className="gallery-thumb-wrap furniture-thumb"><Armchair size={32} strokeWidth={1.2} aria-hidden="true" /></div>
      <span className="gallery-name">{project.name}</span>
      <span className="gallery-meta">{sizeText(summary, lengthUnit)}</span>
      <span className="gallery-meta">{summary.partCount} part{summary.partCount === 1 ? '' : 's'}</span>
      <IssueBadge summary={summary} />
    </button>
    <div className="furniture-card-actions">
      <button type="button" className="icon-button" onClick={() => onDuplicate(project.id)} aria-label={`Duplicate ${project.name}`} title="Duplicate"><Copy /></button>
      <button type="button" className="icon-button danger" onClick={() => onDelete(project.id)} aria-label={`Delete ${project.name}`} title="Delete"><Trash2 /></button>
    </div>
  </div>
})

function sizeText(summary: FurnitureSummary, lengthUnit: 'metric' | 'imperial'): string {
  return summary.size ? formatDimensions(summary.size, lengthUnit) : 'No size yet'
}

// Text plus an icon, never color alone.
function IssueBadge({ summary }: { summary: FurnitureSummary }) {
  if (summary.errors === 0 && summary.warnings === 0) return null
  const errors = summary.errors > 0
  const count = errors ? summary.errors : summary.warnings
  const noun = errors ? 'error' : 'warning'
  return <span className={`furniture-issue-badge ${errors ? 'error' : 'warning'}`}><TriangleAlert size={13} aria-hidden="true" />{count} {noun}{count === 1 ? '' : 's'}</span>
}

export function FurnitureGallery({ projects, woods, allowances, onCreate, onOpen, onDuplicate, onDelete }: {
  projects: FurnitureProject[]
  woods: WoodSpecies[]
  allowances: BuildAllowances
  onCreate: (request: NewFurnitureRequest) => void
  onOpen: (id: string) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [creating, setCreating] = useState(false)
  return <div className="board-gallery furniture-gallery">
    <div className="gallery-grid">
      <button type="button" className="gallery-card gallery-new" onClick={() => setCreating(true)}>
        <span className="gallery-plus" aria-hidden="true">＋</span>
        <span>New project</span>
      </button>
      {projects.map(project => <FurnitureCard key={project.id} project={project} woods={woods} allowances={allowances} onOpen={onOpen} onDuplicate={onDuplicate} onDelete={onDelete} />)}
    </div>
    {projects.length === 0 && <p className="furniture-empty">No furniture yet. Start from a table, workbench, desk, or cabinet template, or from a blank project.</p>}
    {creating && <NewFurnitureDialog onCreate={request => { setCreating(false); onCreate(request) }} onClose={() => setCreating(false)} />}
  </div>
}
