import { Check, X } from 'lucide-react'
import type { BoardProject, WoodSpecies } from '../../types'
import type { EndGrainMetrics, EndGrainTemplate } from '../../domain/boardGeometry'
import { buildEndGrainTemplate, calculateEndGrainMetrics } from '../../domain/boardGeometry'
import { resolveScale } from '../../domain/boardScale'
import { MM_PER_INCH } from '../../domain/lengthUnits'
import { BOARD_PATTERNS } from '../../domain/boardPatterns'
import { useModalDialog } from '../useModalDialog'
import { useUnitSystem } from '../unitSystem'
import { ScaledBoardFrame } from './ScaledBoardFrame'
import { AssembledBoard } from './AssembledBoard'

export function PatternPreviewDialog({ pattern, current, preview, woods, onApply, onDismiss }: { pattern: (typeof BOARD_PATTERNS)[number] | undefined; current: BoardProject; preview: BoardProject; woods: WoodSpecies[]; onApply: () => void; onDismiss: () => void }) {
  const dialogRef = useModalDialog<HTMLDivElement>(onDismiss)
  const { lengthUnit } = useUnitSystem()
  if (!pattern) return null
  const currentMetrics = calculateEndGrainMetrics(current)
  const previewMetrics = calculateEndGrainMetrics(preview)
  const currentTemplate = buildEndGrainTemplate(current)
  const previewTemplate = buildEndGrainTemplate(preview)
  const lengthMm = Math.max(currentMetrics.finalLength, previewMetrics.finalLength, 1)
  const widthMm = Math.max(currentMetrics.panelWidth, previewMetrics.panelWidth, 1)
  const { pxPerMm } = resolveScale(lengthMm, 420, lengthUnit === 'imperial' ? { snapUnitMm: MM_PER_INCH / 2 } : {})
  return <div className="modal-scrim" role="presentation" onClick={event => { if (event.target === event.currentTarget) onDismiss() }}>
    <div ref={dialogRef} tabIndex={-1} className="pattern-dialog" role="dialog" aria-modal="true" aria-label={`Preview ${pattern.name} pattern`}>
      <header>
        <div><span className="eyebrow">PATTERN PREVIEW</span><h2>{pattern.name}</h2><p>{pattern.description}</p></div>
        <button className="icon-button" onClick={onDismiss} aria-label="Dismiss pattern preview"><X/></button>
      </header>
      <div className="pattern-preview-grid">
        <PatternPreviewPanel title="Current" project={current} woods={woods} metrics={currentMetrics} template={currentTemplate} lengthMm={lengthMm} widthMm={widthMm} pxPerMm={pxPerMm}/>
        <PatternPreviewPanel title="Preview" project={preview} woods={woods} metrics={previewMetrics} template={previewTemplate} lengthMm={lengthMm} widthMm={widthMm} pxPerMm={pxPerMm}/>
      </div>
      <footer><button className="button secondary" onClick={onDismiss}><X/>Dismiss</button><button className="button" onClick={onApply}><Check/>Apply pattern</button></footer>
    </div>
  </div>
}

function PatternPreviewPanel({ title, project, woods, metrics, template, lengthMm, widthMm, pxPerMm }: { title: string; project: BoardProject; woods: WoodSpecies[]; metrics: EndGrainMetrics; template: EndGrainTemplate; lengthMm: number; widthMm: number; pxPerMm: number }) {
  return <section>
    <h3>{title}</h3>
    <ScaledBoardFrame woods={woods} lengthMm={lengthMm} widthMm={widthMm} pxPerMm={pxPerMm} ariaLabel={`${title} ${project.name} pattern preview`}>
      <AssembledBoard project={project} template={template} sliceCount={metrics.sliceCount} pxPerMm={pxPerMm} clipIdPrefix={`pattern-${title.toLowerCase()}`}/>
    </ScaledBoardFrame>
    <p>{project.strips.length} strips · {metrics.sliceCount} slices</p>
  </section>
}
