import { useMemo } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { BuildAllowances, WoodSpecies } from '../../types'
import type { FurnitureProject } from '../../domain/furniture/types'
import { resolveFurniture } from '../../domain/furniture/geometry'
import { formatDimensions } from '../../domain/lengthUnits'
import { useUnitSystem } from '../unitSystem'
import { summarizeResolved } from './summary'

// Designer shell. The gallery opens it; the editing panels arrive in the next change.
export function FurnitureDesigner({ project, woods, allowances, onBack }: {
  project: FurnitureProject
  woods: WoodSpecies[]
  allowances: BuildAllowances
  /** A part id (from the warning center) to select once the parts panel exists. */
  focusId?: string
  onBack: () => void
}) {
  const { lengthUnit } = useUnitSystem()
  const summary = useMemo(() => summarizeResolved(resolveFurniture(project, { woods, allowances }), { woods, allowances }), [project, woods, allowances])
  const issueCount = summary.errors + summary.warnings
  return <div className="furniture-designer">
    <header className="furniture-header">
      <button type="button" className="button secondary" onClick={onBack}><ArrowLeft size={15} />Furniture</button>
      <h2>{project.name}</h2>
      <span className="furniture-size">{summary.size ? formatDimensions(summary.size, lengthUnit) : 'No size yet'}</span>
      <span className="furniture-parts">{summary.partCount} part{summary.partCount === 1 ? '' : 's'}</span>
      <span className="furniture-issue-count">{issueCount} issue{issueCount === 1 ? '' : 's'}</span>
    </header>
    <div className="furniture-empty-center"><p>The editing panels open here.</p></div>
  </div>
}
