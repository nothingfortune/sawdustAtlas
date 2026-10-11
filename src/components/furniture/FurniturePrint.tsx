import type { DrawingView } from '../../domain/furniture/projection'
import type { FurniturePartsList, FurnitureProject, ResolvedFurniture } from '../../domain/furniture/types'
import { formatDimensions, lengthUnitLabel } from '../../domain/lengthUnits'
import type { InstructionPlan } from '../../domain/instructions/types'
import { PlanStepsBody } from '../instructions/PlanStepList'
import { useUnitSystem } from '../unitSystem'
import { FurnitureCutList } from './FurnitureCutList'
import { FurnitureDrawing } from './FurnitureDrawing'

const PRINT_VIEWS: readonly { view: DrawingView; title: string }[] = [
  { view: 'front', title: 'Front' },
  { view: 'side', title: 'Side' },
  { view: 'top', title: 'Top' },
  { view: 'iso', title: 'Isometric' },
]

// The printed build sheet: cover, the four drawings, the cut list with hardware, and the
// steps. Always in the DOM but hidden on screen; the print rules reveal it and hide the
// designer, as the board designer does for its build sheet.
export function FurniturePrint({ project, resolved, list, plan }: {
  project: FurnitureProject
  resolved: ResolvedFurniture
  list: FurniturePartsList
  plan: InstructionPlan
}) {
  const { lengthUnit } = useUnitSystem()
  const { bounds } = resolved
  return <article className="furniture-print" aria-label="Printable build sheet">
    <header className="furniture-print-cover">
      <div>
        <span className="eyebrow">BUILD SHEET</span>
        <h1>{project.name}</h1>
      </div>
      <dl className="print-sheet-facts">
        <div><dt>Overall size (W × D × H)</dt><dd>{bounds ? formatDimensions([bounds.sx, bounds.sy, bounds.sz], lengthUnit) : 'Not sized yet'}</dd></div>
        <div><dt>Units</dt><dd>{lengthUnit === 'imperial' ? 'Inches' : 'Millimeters'} ({lengthUnitLabel(lengthUnit)})</dd></div>
        <div><dt>Parts</dt><dd>{project.parts.length}</dd></div>
        <div><dt>Plan revision</dt><dd>{plan.revision}</dd></div>
      </dl>
    </header>
    <section className="furniture-print-drawings" aria-label="Drawings">
      {PRINT_VIEWS.map(({ view, title }) => <figure key={view}>
        <FurnitureDrawing parts={resolved.parts} view={view} showLabels />
        <figcaption>{title}</figcaption>
      </figure>)}
    </section>
    <section className="furniture-print-section" aria-label="Cut list">
      <h2>Cut list</h2>
      <FurnitureCutList list={list} />
    </section>
    <section className="furniture-print-section furniture-print-steps" aria-label="Build steps">
      <h2>Build steps</h2>
      <PlanStepsBody plan={plan} lengthUnit={lengthUnit} />
    </section>
  </article>
}
