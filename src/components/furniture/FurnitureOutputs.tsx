import { ChevronDown, Printer } from 'lucide-react'
import { useMemo, useState } from 'react'
import { partsList } from '../../domain/furniture/partsList'
import type { FurnitureContext, FurnitureProject, ResolvedFurniture } from '../../domain/furniture/types'
import { generateFurniturePlan } from '../../domain/instructions/furnitureInstructions'
import { validatePlan } from '../../domain/instructions/validate'
import type { BuildAllowances, BoardProject, WoodSpecies } from '../../types'
import { FurnitureCutList } from './FurnitureCutList'
import { FurniturePrint } from './FurniturePrint'
import { FurnitureSteps } from './FurnitureSteps'

type OutputTab = 'cut-list' | 'steps'
const OUTPUT_TABS: readonly { id: OutputTab; label: string }[] = [
  { id: 'cut-list', label: 'Cut list' },
  { id: 'steps', label: 'Build steps' },
]

// Bottom tabs (cut list, build steps) plus the print sheet. The parts list and the
// plan are derived once per change and shared by the tabs and the printout. The panel
// starts collapsed so the design area keeps its room.
export function FurnitureOutputs({ project, resolved, woods, boards, allowances }: {
  project: FurnitureProject
  resolved: ResolvedFurniture
  woods: readonly WoodSpecies[]
  boards: readonly BoardProject[]
  allowances: BuildAllowances
}) {
  const [open, setOpen] = useState<OutputTab | null>(null)
  const list = useMemo(() => partsList(resolved, { woods, allowances } satisfies FurnitureContext), [resolved, woods, allowances])
  const plan = useMemo(() => generateFurniturePlan(project, { woods, boards, allowances }), [project, woods, boards, allowances])
  const validation = useMemo(() => validatePlan(plan), [plan])

  return <>
    <section className="furniture-bottom" aria-label="Project outputs">
      <div className="furniture-bottom-bar">
        <div role="tablist" aria-label="Project outputs" className="furniture-tabs">
          {OUTPUT_TABS.map(entry => <button key={entry.id} type="button" role="tab" id={`furniture-output-tab-${entry.id}`} aria-selected={open === entry.id} aria-controls={`furniture-output-${entry.id}`}
            className={open === entry.id ? 'active' : ''} onClick={() => setOpen(open === entry.id ? null : entry.id)}>{entry.label}</button>)}
        </div>
        {open && <button type="button" className="button secondary furniture-collapse" onClick={() => setOpen(null)} aria-label="Collapse outputs"><ChevronDown size={15} /></button>}
        <button type="button" className="button secondary" onClick={() => window.print()}><Printer size={15} />Print</button>
      </div>
      {open && <div role="tabpanel" id={`furniture-output-${open}`} aria-labelledby={`furniture-output-tab-${open}`} className="furniture-bottom-panel">
        {open === 'cut-list' ? <FurnitureCutList list={list} joints={project.joints} /> : <FurnitureSteps plan={plan} validation={validation} />}
      </div>}
    </section>
    <FurniturePrint project={project} resolved={resolved} list={list} plan={plan} />
  </>
}
