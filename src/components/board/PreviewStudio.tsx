import { Maximize2, Minimize2, X } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { BoardProject, WoodSpecies } from '../../types'
import type { EndGrainMetrics, EndGrainTemplate } from '../../domain/boardGeometry'
import type { SliceState } from '../../domain/boardSlices'
import { fitPxPerMm } from '../../domain/boardScale'
import { formatDimensions, formatLength } from '../../domain/lengthUnits'
import { useElementSize } from '../useElementSize'
import { usePinchPan } from '../usePinchPan'
import { useModalDialog } from '../useModalDialog'
import { useUnitSystem } from '../unitSystem'
import { ScaledBoardFrame } from './ScaledBoardFrame'
import { LongGrainFace } from './LongGrainFace'
import { AssembledBoard, SliceFace } from './AssembledBoard'
import { DraggableAssembledBoard } from './DraggableAssembledBoard'
import { CrosscutOverlay } from './CrosscutOverlay'

// One entry in the floating studio's tab strip. wMm/hMm are the piece's true
// dimensions (used only for aspect-ratio fitting); render() draws it at whatever
// fitted scale the stage resolves. idPrefix keeps SVG clip ids unique between the
// docked rail and the pop-out, which mount the same tab simultaneously.
interface StudioTab {
  id: string
  label: string
  wMm: number
  hMm: number
  note: string
  scaleBar?: boolean
  render: (pxPerMm: number, idPrefix: string, interactive: boolean) => ReactNode
}

function buildStudioTabs({ project, metrics, template, edgeWidth, sliceState, sliceIndex, onToggleRow, onReorder, lengthUnit }: { project: BoardProject; metrics: EndGrainMetrics; template: EndGrainTemplate; edgeWidth: number; sliceState: SliceState | undefined; sliceIndex: number; onToggleRow: (index: number) => void; onReorder: (order: number[]) => void; lengthUnit: 'metric' | 'imperial' }): StudioTab[] {
  if (project.construction === 'edge') {
    const len = Math.max(project.length, 1)
    const wid = Math.max(edgeWidth, 1)
    const face = () => <LongGrainFace strips={project.strips} lengthMm={len}/>
    return [
      { id: 'finished', label: 'Finished board', wMm: len, hMm: wid, scaleBar: true, note: 'Top view, true to scale · pop out to zoom', render: face },
      { id: 'glueup', label: 'Glue-up order', wMm: len, hMm: wid, note: 'Strips glued edge to edge · grain runs along the length', render: face },
    ]
  }
  const source = Math.max(project.endGrain.sourceLength, 1)
  const panel = Math.max(metrics.panelWidth, 1)
  const finalLen = Math.max(metrics.finalLength, 1)
  const tabs: StudioTab[] = [
    { id: 'finished', label: 'Finished board', wMm: finalLen, hMm: panel, scaleBar: true, note: `Tap a slice to rotate/flip · drag to reorder · slice ${formatLength(project.endGrain.stockThickness, lengthUnit)} · board ${formatDimensions([finalLen, panel], lengthUnit)}`,
      render: (px, idp, interactive) => interactive
        ? <DraggableAssembledBoard project={project} template={template} sliceCount={metrics.sliceCount} pxPerMm={px} onToggleRow={onToggleRow} onReorder={onReorder} clipIdPrefix={`${idp}-fin`}/>
        : <AssembledBoard project={project} template={template} sliceCount={metrics.sliceCount} pxPerMm={px} clipIdPrefix={`${idp}-fin`}/> },
    { id: 'glueup', label: 'Glue-up', wMm: source, hMm: panel, note: `Long boards stacked across the panel · ${formatDimensions([project.endGrain.sourceLength, metrics.panelWidth], lengthUnit)}`,
      render: () => <LongGrainFace strips={project.strips} lengthMm={source}/> },
    { id: 'crosscut', label: 'Crosscut', wMm: source, hMm: panel, note: `${metrics.sliceCount} slices cut across the grain at ${formatLength(project.endGrain.sliceThickness, lengthUnit)}`,
      render: px => <><LongGrainFace strips={project.strips} lengthMm={source}/><CrosscutOverlay project={project} metrics={metrics} heightMm={panel} pxPerMm={px}/></> },
    { id: 'turn', label: '90° turn', wMm: finalLen, hMm: panel, note: 'Slices stood on end and re-glued into the end-grain panel · tap a slice to rotate/flip · drag to reorder',
      render: (px, idp, interactive) => interactive
        ? <DraggableAssembledBoard project={project} template={template} sliceCount={metrics.sliceCount} pxPerMm={px} onToggleRow={onToggleRow} onReorder={onReorder} clipIdPrefix={`${idp}-turn`}/>
        : <AssembledBoard project={project} template={template} sliceCount={metrics.sliceCount} pxPerMm={px} clipIdPrefix={`${idp}-turn`}/> },
  ]
  if (sliceState) {
    tabs.push({ id: 'wafer', label: 'Single wafer', wMm: Math.max(project.endGrain.stockThickness, 1), hMm: Math.max(template.height, 1),
      note: `Slice ${sliceState.sourceIndex + 1}, currently in slot ${sliceIndex + 1} · one crosscut wafer before assembly`,
      render: (_px, idp) => <SliceFace project={project} template={template} state={sliceState} clipId={`${idp}-wafer`}/> })
  }
  return tabs
}

// Draws one studio tab fitted to fill its measured box (aspect ratio preserved),
// so narrow pieces use the whole frame instead of rendering as a sliver.
function StudioStage({ tab, woods, idPrefix, big = false, interactive = false }: { tab: StudioTab; woods: WoodSpecies[]; idPrefix: string; big?: boolean; interactive?: boolean }) {
  const [ref, size] = useElementSize()
  // Big (pop-out) carries dimensioned rulers — the top one spans and labels the
  // full board length, the left one the full width — instead of a generic scale
  // bar. Reserve the ruler gutters in the fit so nothing clips.
  const rulers: ('top' | 'left')[] = big ? ['top', 'left'] : []
  const pxPerMm = fitPxPerMm(tab.wMm, tab.hMm, size.width, size.height, { maxPxPerMm: big ? 14 : 7, padX: big ? 56 : 24, padY: big ? 52 : (tab.scaleBar ? 48 : 22) })
  return <div className="studio-stage" ref={ref}>
    <ScaledBoardFrame woods={woods} lengthMm={tab.wMm} widthMm={tab.hMm} pxPerMm={pxPerMm} rulers={rulers} scaleBar={!big && !!tab.scaleBar} ariaLabel={tab.label}>
      {tab.render(pxPerMm, idPrefix, interactive)}
    </ScaledBoardFrame>
  </div>
}

// The "current render": a compact thumbnail pinned to the top of the editor
// panel, co-located with the controls so it updates as you edit. Tapping it pops
// out the full interactive view (rulers, drag-reorder, rotate/flip, pinch); the
// minimize button collapses it to a slim bar to reclaim panel height.
export function PreviewStudio(props: { project: BoardProject; woods: WoodSpecies[]; metrics: EndGrainMetrics; template: EndGrainTemplate; edgeWidth: number; sliceState: SliceState | undefined; sliceIndex: number; onToggleRow: (index: number) => void; onReorder: (order: number[]) => void; minimized: boolean; onMinimize: () => void; onExpand: () => void }) {
  const { lengthUnit } = useUnitSystem()
  const tabs = buildStudioTabs({ ...props, lengthUnit })
  const [activeId, setActiveId] = useState('finished')
  const [popout, setPopout] = useState(false)
  const active = tabs.find(tab => tab.id === activeId) ?? tabs[0]
  if (!active) return null

  if (props.minimized) {
    return <button className="studio-restore" onClick={props.onExpand} aria-label="Show preview" aria-expanded={false}>
      <Maximize2/><span>Preview</span><small>{active.label}</small>
    </button>
  }

  return <section className="preview-studio" aria-label="Live preview">
    <div className="studio-head">
      <span className="eyebrow">CURRENT RENDER</span>
      <div className="studio-head-actions">
        <button className="studio-icon" onClick={() => setPopout(true)} aria-label="Pop out preview at full size"><Maximize2/></button>
        <button className="studio-icon" onClick={props.onMinimize} aria-label="Minimize preview"><Minimize2/></button>
      </div>
    </div>
    <div className="studio-tabs" role="tablist">{tabs.map(tab => <button key={tab.id} role="tab" aria-selected={tab.id === active.id} className={tab.id === active.id ? 'active' : ''} onClick={() => setActiveId(tab.id)}>{tab.label}</button>)}</div>
    <div className="studio-tap" role="button" tabIndex={0} onClick={() => setPopout(true)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setPopout(true) } }} aria-label="Open full-size preview">
      <StudioStage tab={active} woods={props.woods} idPrefix="studio"/>
      <span className="studio-tap-hint"><Maximize2/>Tap to enlarge</span>
    </div>
    <p className="studio-note">{active.note}</p>
    {popout && <PreviewPopout tabs={tabs} activeId={active.id} woods={props.woods} onSelect={setActiveId} onClose={() => setPopout(false)}/>}
  </section>
}

// Full-size pop-out of the studio, with the same tab strip plus pinch-zoom/pan —
// for inspecting the render large on a tablet. Escape or backdrop tap closes it.
function PreviewPopout({ tabs, activeId, woods, onSelect, onClose }: { tabs: StudioTab[]; activeId: string; woods: WoodSpecies[]; onSelect: (id: string) => void; onClose: () => void }) {
  const pinch = usePinchPan()
  const active = tabs.find(tab => tab.id === activeId) ?? tabs[0]
  const dialogRef = useModalDialog<HTMLDivElement>(onClose)
  if (!active) return null
  return createPortal(<div className="modal-scrim" role="presentation" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={dialogRef} tabIndex={-1} className="preview-popout" role="dialog" aria-modal="true" aria-label={`${active.label} preview`}>
      <header>
        <div className="studio-tabs" role="tablist">{tabs.map(tab => <button key={tab.id} role="tab" aria-selected={tab.id === active.id} className={tab.id === active.id ? 'active' : ''} onClick={() => onSelect(tab.id)}>{tab.label}</button>)}</div>
        <button className="icon-button" onClick={onClose} aria-label="Close preview"><X/></button>
      </header>
      <div className="popout-body pinch-viewport" {...pinch.handlers}>
        <div className="pinch-content" style={{ transform: `translate(${pinch.x}px, ${pinch.y}px) scale(${pinch.scale})` }}>
          <StudioStage tab={active} woods={woods} idPrefix="studio-pop" big interactive/>
        </div>
        {pinch.active && <button className="zoom-reset" onClick={pinch.reset}>Reset zoom</button>}
      </div>
      <p className="studio-note">{active.note}</p>
    </div>
  </div>, document.body)
}
