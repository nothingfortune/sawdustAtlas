import { ArrowUpNarrowWide, Check, ChevronDown, Copy, Eye, FlipHorizontal2, Layers3, Maximize2, Minimize2, Plus, Printer, RotateCcw, Scissors, Shuffle, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { memo, useMemo, useRef, useState } from 'react'
import type { ReactNode, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { StripList } from './StripList'
import { applySliceOrder, clampTransforms, readSliceStates } from '../domain/boardSlices'
import type { SliceState } from '../domain/boardSlices'
import { buildEndGrainTemplate, calculateEndGrainMetrics, calculateWoodUsage, crosscutOverlaySegments } from '../domain/boardGeometry'
import type { EndGrainMetrics, EndGrainTemplate } from '../domain/boardGeometry'
import { calculateBuildDimensions } from '../domain/boardAllowances'
import type { BuildDimensions } from '../domain/boardAllowances'
import { generateCuttingBoardPlan } from '../domain/boardCutPlan'
import type { CuttingBoardPlan } from '../domain/boardCutPlan'
import { resolveScale, fitPxPerMm } from '../domain/boardScale'
import { isSquareAngle } from '../domain/units'
import { useContainerWidth } from './useContainerWidth'
import { useElementSize } from './useElementSize'
import { usePinchPan } from './usePinchPan'
import { useModalDialog } from './useModalDialog'
import { dropTargetFromX, orderWithKeyAt } from './sliceDrag'
import { ScaledBoardFrame } from './board/ScaledBoardFrame'
import { LongGrainFace } from './board/LongGrainFace'
import { AssembledBoard, SliceFace } from './board/AssembledBoard'
import { FaceShiftWedge } from './board/FaceShiftWedge'
import type { BoardProject, BoardStrip, EndGrainSettings, PriceBreakdown, PricingSettings, WoodSpecies } from '../types'
import { createId } from '../id'
import { NumberField as Field } from './fields'
import { alternateStrips, applyBoardPattern, BOARD_PATTERNS, gradientStrips, shuffleStripsAvoidingAdjacent } from '../domain/boardPatterns'
import type { BoardPatternId } from '../domain/boardPatterns'
import { calculateStockRequirements } from '../domain/boardStock'
import type { StockRequirements } from '../domain/boardStock'
import { calculateAngleSetup } from '../domain/boardAngle'
import type { AngleSetup } from '../domain/boardAngle'
import { summarizeBenchSetup } from '../domain/boardBench'
import type { BenchSetup } from '../domain/boardBench'
import { convertMetricText, formatDimensions, formatLength, formatNumber, MM_PER_INCH } from '../domain/lengthUnits'
import { useUnitSystem } from './unitSystem'
import { calculatePrice, classifyBoard, materialCost, roughPieceCost } from '../domain/pricing'
import { PriceBreakdownCard } from './board/PriceBreakdownCard'

interface Props { projects: BoardProject[]; project: BoardProject | undefined; woods: WoodSpecies[]; pricing: PricingSettings; onSelect: (id: string) => void; onCreate: () => void; onChange: (project: BoardProject) => void; onDelete: (id: string) => void; onMakeComposite: (board: BoardProject) => void; onBack: () => void }

export function BoardDesigner({ projects, project, woods, pricing, onSelect, onCreate, onChange, onDelete, onMakeComposite, onBack }: Props) {
  const { lengthUnit } = useUnitSystem()
  const [canvasRef, canvasWidth] = useContainerWidth(820)
  const [panelOpen, setPanelOpen] = useState(false)
  // Preview lives at the top of the editor panel; collapsible to reclaim panel
  // height when focusing on strip edits.
  const [studioMinimized, setStudioMinimized] = useState(false)
  const [pendingPattern, setPendingPattern] = useState<BoardPatternId | null>(null)
  // Memoize the full derived domain pipeline so it only recomputes when the project
  // or wood library actually change — not on every unrelated re-render (panel toggle,
  // resize, child drag state). Kept above the early return to satisfy hook ordering.
  const derived = useMemo(() => {
    if (!project) return null
    const end = calculateEndGrainMetrics(project)
    const sliceStates = readSliceStates(project.endGrain, end.sliceCount)
    // Reuse the single `end` computation through the rest of the pipeline rather than
    // recomputing the geometry inside each of these.
    const build = calculateBuildDimensions(project, end)
    const template = buildEndGrainTemplate(project)
    const cutPlan = generateCuttingBoardPlan(project, woods, build, end)
    const woodUsage = calculateWoodUsage(project, woods, end)
    const stock = calculateStockRequirements(project, woods, build, end)
    const bench = summarizeBenchSetup(project, woods, build, end)
    const angleRows = project.construction === 'end'
      ? [...new Map(project.strips
          .filter(strip => !isSquareAngle(strip.trailingAngle))
          .map(strip => [Math.round(strip.trailingAngle * 100) / 100, strip] as const)).entries()]
          .map(([angle, strip]) => ({
            angle,
            count: project.strips.filter(other => Math.round(other.trailingAngle * 100) / 100 === angle).length,
            setup: calculateAngleSetup({ trailingAngleDeg: strip.trailingAngle, stockThicknessMm: project.endGrain.stockThickness, stripLengthMm: project.endGrain.sourceLength }),
          }))
          .sort((a, b) => a.angle - b.angle)
      : []
    const woodById = new Map(woods.map(wood => [wood.id, wood]))
    const width = project.strips.reduce((sum, strip) => sum + strip.width, 0)
    const boardFeet = build.roughBoardFeet
    const finishedSize = formatDimensions([build.length.finished, build.width.finished, build.thickness.finished], lengthUnit)
    const edgeEstimatedCost = project.strips.reduce((sum, strip, index) => {
      const roughWidth = build.stripRoughWidths[index] ?? strip.width
      const pricePerBf = woodById.get(strip.speciesId)?.pricePerBoardFoot ?? 0
      return sum + roughPieceCost(roughWidth, build.length.rough, build.thickness.rough, pricePerBf)
    }, 0)
    const estimatedCost = project.construction === 'end'
      ? woodUsage.reduce((sum, usage) => sum + materialCost(usage.requiredBoardFeet, woodById.get(usage.speciesId)?.pricePerBoardFoot ?? 0), 0)
      : edgeEstimatedCost
    const tier = classifyBoard(project, end.sliceCount)
    const price = calculatePrice({ materialCost: estimatedCost, roughBoardFeet: build.roughBoardFeet, construction: project.construction, tier, pricing })
    return { end, sliceStates, build, template, cutPlan, woodUsage, stock, bench, angleRows, width, boardFeet, finishedSize, estimatedCost, price }
  }, [lengthUnit, project, woods, pricing])
  // The pattern-preview project (with stable preview-* ids) only needs recomputing
  // when the pending pattern or inputs change — not on every render while the
  // dialog is open. Null unless a preview is pending.
  const previewProject = useMemo(() => {
    if (!project || !pendingPattern) return null
    let nextId = 0
    const sliceCount = calculateEndGrainMetrics(project).sliceCount
    return { ...project, ...applyBoardPattern(pendingPattern, project, woods, sliceCount, () => `preview-${pendingPattern}-${nextId++}`) }
  }, [project, woods, pendingPattern])
  if (!project) return <div className="empty-page"><h2>No cutting board designs yet</h2><button className="button" onClick={onCreate}><Plus/>Create one</button></div>

  const update = (patch: Partial<BoardProject>) => onChange({ ...project, ...patch, updatedAt: new Date().toISOString() })
  // Apply an end-grain settings patch, then clamp the per-slice transform arrays to
  // the resulting slice count so a count that shrank (e.g. thicker slices) can't keep
  // stale transforms that would resurrect if the count later grew back.
  const updateEnd = (patch: Partial<EndGrainSettings>) => {
    const nextSettings = { ...project.endGrain, ...patch }
    const count = calculateEndGrainMetrics({ ...project, endGrain: nextSettings }).sliceCount
    update({ endGrain: { ...nextSettings, ...clampTransforms(nextSettings, count) } })
  }
  const updateStrip = (id: string, patch: Partial<BoardStrip>) => update({ strips: project.strips.map(strip => strip.id === id ? { ...strip, ...patch } : strip) })
  const { end, sliceStates, build, template, cutPlan, woodUsage, stock, bench, angleRows, width, boardFeet, finishedSize, estimatedCost, price } = derived!

  // One shared px-per-mm so every preview is true-to-scale and comparable.
  const governingLength = project.construction === 'end'
    ? Math.max(project.endGrain.sourceLength, end.finalLength, 1)
    : Math.max(project.length, 1)
  // In imperial (Preston's button) snap the fit so ½" lands on whole pixels, unless
  // the user is driving the zoom directly (the studio pop-out's pinch path).
  const { pxPerMm } = resolveScale(governingLength, Math.max(260, canvasWidth - 56), lengthUnit === 'imperial' ? { snapUnitMm: MM_PER_INCH / 2 } : {})

  const addStrip = (speciesId = woods[0]?.id ?? 'walnut') => update({ strips: [...project.strips, { id: createId(), speciesId, width: 38, trailingAngle: 0 }] })
  const duplicatePattern = () => update({ strips: [...project.strips, ...project.strips.map(strip => ({ ...strip, id: createId() }))] })
  const mirrorPattern = () => update({ strips: [...project.strips, ...[...project.strips].reverse().map(strip => ({ ...strip, id: createId() }))] })
  const reverseStrips = () => update({ strips: [...project.strips].reverse() })
  const reorderStrips = (orderedIds: string[]) => update({ strips: orderedIds.map(id => project.strips.find(strip => strip.id === id)).filter((strip): strip is BoardStrip => !!strip) })
  const deleteStrip = (id: string) => update({ strips: project.strips.filter(strip => strip.id !== id) })

  const alternateArrangement = () => update({ strips: alternateStrips(project.strips) })
  const gradientArrangement = () => update({ strips: gradientStrips(project.strips) })
  // Reorder in place (each strip keeps its id, so StripList rows move rather than
  // remount and drop focus). Avoids seating two of the same species side by side.
  const randomizeArrangement = () => update({ strips: shuffleStripsAvoidingAdjacent(project.strips) })
  const applyPattern = (pattern: BoardPatternId) => { update(applyBoardPattern(pattern, project, woods, end.sliceCount, createId)); setPendingPattern(null) }
  const setRowPattern = (pattern: 'same' | 'rotate' | 'flip' | 'invert') => {
    const flips = Array.from({ length: end.sliceCount }, (_, index) => project.endGrain.rowFlips[index] ?? false)
    const rotations = Array.from({ length: end.sliceCount }, (_, index) => project.endGrain.rowRotations[index] ?? false)
    updateEnd({
      rowFlips: flips.map((flipped, index) => pattern === 'flip' ? index % 2 === 1 : pattern === 'invert' ? !flipped : false),
      rowRotations: rotations.map((rotated, index) => pattern === 'rotate' ? index % 2 === 1 : pattern === 'invert' ? !rotated : false),
      rowOffsets: [],
    })
  }
  const reorderSlices = (order: number[]) => updateEnd(applySliceOrder(project.endGrain, end.sliceCount, order))
  const cycleRow = (index: number) => {
    const flips = Array.from({ length: end.sliceCount }, (_, row) => project.endGrain.rowFlips[row] ?? false)
    const rotations = Array.from({ length: end.sliceCount }, (_, row) => project.endGrain.rowRotations[row] ?? false)
    const state = (rotations[index] ? 1 : 0) + (flips[index] ? 2 : 0)
    const next = (state + 1) % 4
    rotations[index] = next === 1 || next === 3
    flips[index] = next === 2 || next === 3
    updateEnd({ rowFlips: flips, rowRotations: rotations })
  }

  return <div className="board-layout">
    <div className="designer-toolbar">
      <div><span className="eyebrow">CUTTING BOARD DESIGNER</span><div className="project-switcher"><select aria-label="Select board" value={project.id} onChange={event => onSelect(event.target.value)}>{projects.map(candidate => <option value={candidate.id} key={candidate.id}>{candidate.name}</option>)}</select><ChevronDown/></div><div className="toolbar-finished-size"><span>Finished</span><b>{finishedSize}</b></div></div>
      <div className="toolbar-actions"><button className="button secondary" onClick={onBack} aria-label="Back to boards">← Boards</button><button className="button secondary" onClick={() => onMakeComposite(project)} aria-label="Make a composite board from this design"><Layers3/>Make composite</button><button className="button secondary" onClick={() => window.print()} aria-label="Print build sheet"><Printer/>Print build sheet</button><button className="button secondary" onClick={onCreate}><Plus/>New design</button><button className="button secondary danger" onClick={() => onDelete(project.id)} aria-label="Delete this design"><Trash2/>Delete</button></div>
    </div>
    <div className="board-main">
      <div className="board-canvas-area" ref={canvasRef}>
        <BuildSheetHeader project={project} build={build} boardFeet={boardFeet} estimatedCost={estimatedCost} price={price}/>
        <div className="board-intro"><span className="eyebrow">LIVE PREVIEW</span><h2>{project.name}</h2><p>{project.construction === 'end' ? 'End-grain workflow · measurements before final surfacing' : 'Edge-grain board · finished dimensions'}</p></div>
        {project.construction === 'end' && end.errors.length > 0 && <div className="geometry-errors"><strong>Geometry needs attention</strong>{end.errors.map(error => <span key={error}>{error}</span>)}</div>}
        {project.construction === 'end' && end.warnings.length > 0 && <div className="geometry-warnings"><strong>Check the geometry</strong>{end.warnings.map(warning => <span key={warning}>{warning}</span>)}</div>}

        <HowItsBuilt project={project} woods={woods} metrics={end} template={template} pxPerMm={pxPerMm} edgeWidth={width}/>

        <div className="board-stats">
          <Stat label="Finished size" value={formatDimensions([build.length.finished, build.width.finished, build.thickness.finished], lengthUnit)}/>
          <Stat label="Material" value={`$${estimatedCost.toFixed(2)}`}/>
          <Stat label="Price" value={`$${price.total.toFixed(2)}`}/>
          <Stat label={project.construction === 'end' ? 'Total waste' : 'Glue joints'} value={project.construction === 'end' ? `${formatNumber(end.totalWasteBoardFeet)} bf · ${formatNumber(end.totalWastePercent)}%` : String(Math.max(project.strips.length - 1, 0))}/>
        </div>
        <BenchSetupCard bench={bench}/>
        <PriceBreakdownCard price={price} roughBoardFeet={boardFeet} construction={project.construction}/>
        <BuildSummary build={build}/>
        <CutPlanView plan={cutPlan}/>
        <StockRequirementsCard stock={stock}/>
        {angleRows.length > 0 && <AngleSetupCard rows={angleRows} thicknessMm={project.endGrain.stockThickness} lengthMm={project.endGrain.sourceLength}/>}
        <BuildAssumptions project={project}/>
      </div>
      <aside className={`board-panel${panelOpen ? ' open' : ''}`}>
        <button className="drawer-close" onClick={() => setPanelOpen(false)} aria-label="Close editor panel"><X/></button>
        <PreviewStudio project={project} woods={woods} metrics={end} template={template} edgeWidth={width} sliceState={sliceStates[0]} sliceIndex={0} onToggleRow={cycleRow} onReorder={reorderSlices} minimized={studioMinimized} onMinimize={() => setStudioMinimized(true)} onExpand={() => setStudioMinimized(false)}/>
        <div className="panel-section first">
          <h3>Construction</h3>
          <div className="construction-toggle"><button className={project.construction === 'edge' ? 'active' : ''} onClick={() => update({ construction: 'edge' })}>Edge grain</button><button className={project.construction === 'end' ? 'active' : ''} onClick={() => update({ construction: 'end' })}>End grain</button></div>
          <label className="field"><span>Name</span><input value={project.name} onChange={event => update({ name: event.target.value })}/></label>
          {project.construction === 'edge'
            ? <div className="field-row"><Field label="Length (mm)" value={project.length} onChange={value => update({ length: value })}/><Field label="Thickness (mm)" value={project.thickness} onChange={value => update({ thickness: value })}/></div>
            : <EndGrainFields settings={project.endGrain} onChange={updateEnd}/>
          }
        </div>
        {project.construction === 'end' && <div className="panel-section row-tools"><h3>End-grain pattern</h3><p>Preview a recipe before replacing the strip layout. Recipes remain fully editable after applying.</p><div>{BOARD_PATTERNS.map(pattern => <button key={pattern.id} title={pattern.description} onClick={() => setPendingPattern(pattern.id)}><Eye/>{pattern.name}</button>)}</div></div>}
        {project.construction === 'end' && <><div className="waste-card"><Scissors/><div><span>{end.sliceCount} usable slices</span><b>{formatLength(end.kerfWaste, lengthUnit)} kerf + {formatLength(end.trimWaste + end.offcutWaste, lengthUnit)} trim/offcut</b></div></div><div className="wood-usage"><span className="eyebrow">STOCK BY SPECIES</span>{woodUsage.map(usage => <div key={usage.speciesId}><i style={{ background: usage.color }}/><span>{usage.name}<small>{formatNumber(usage.requiredBoardFeet)} bf stock</small></span><b>{formatNumber(usage.wasteBoardFeet)} bf waste</b></div>)}</div></>}
        <div className="panel-section"><div className="panel-title-row"><div><h3>First glue-up strips</h3><p>{project.strips.length} strips · {formatLength(width, lengthUnit)} panel width · drag to reorder</p></div><button className="icon-button" onClick={() => addStrip()} aria-label="Add strip"><Plus/></button></div>
          <StripList strips={project.strips} woods={woods} construction={project.construction} stockThicknessMm={project.endGrain.stockThickness} onReorder={reorderStrips} onUpdateStrip={updateStrip} onDeleteStrip={deleteStrip}/>
          <button className="add-strip" onClick={() => addStrip()}><Plus/>Add strip</button>
        </div>
        <div className="panel-section pattern-actions"><h3>Strip arrangement</h3><div><button onClick={alternateArrangement} title="Alternate strips between two species"><Layers3/>Alternate</button><button onClick={gradientArrangement} title="Order strips by width, narrow → wide"><ArrowUpNarrowWide/>By width</button><button onClick={randomizeArrangement} title="Shuffle strip order without placing two of the same species side by side"><Shuffle/>Randomize</button><button onClick={mirrorPattern} title="Duplicate the strips in reverse to mirror the layout"><FlipHorizontal2/>Mirror</button><button onClick={duplicatePattern} title="Repeat the current strips again after themselves"><Copy/>Repeat</button><button onClick={reverseStrips} title="Reverse the strip order"><RotateCcw/>Reverse</button></div></div>
        {project.construction === 'end' && <div className="panel-section row-tools"><h3>Per-row override</h3><p>Rotate and flip are distinct when a strip has an angle.</p><div><button onClick={() => setRowPattern('same')}>All same</button><button onClick={() => setRowPattern('rotate')}>Rotate alternate</button><button onClick={() => setRowPattern('flip')}>Flip alternate</button><button onClick={() => setRowPattern('invert')}>Invert all</button></div></div>}
        <div className="panel-section milling-hint"><h3>Milling &amp; wood</h3><p>Milling allowances and the wood library are now shared workspace modules — find them in the left sidebar under Library.</p></div>
      </aside>
      {panelOpen && <div className="panel-scrim" role="presentation" onClick={() => setPanelOpen(false)}/>}
      <button className="panel-fab" onClick={() => setPanelOpen(open => !open)} aria-label="Toggle editor panel"><SlidersHorizontal/>Edit</button>
    </div>
    {pendingPattern && <PatternPreviewDialog
      pattern={BOARD_PATTERNS.find(candidate => candidate.id === pendingPattern)}
      current={project}
      preview={previewProject ?? project}
      woods={woods}
      onApply={() => applyPattern(pendingPattern)}
      onDismiss={() => setPendingPattern(null)}
    />}
  </div>
}

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
function PreviewStudio(props: { project: BoardProject; woods: WoodSpecies[]; metrics: EndGrainMetrics; template: EndGrainTemplate; edgeWidth: number; sliceState: SliceState | undefined; sliceIndex: number; onToggleRow: (index: number) => void; onReorder: (order: number[]) => void; minimized: boolean; onMinimize: () => void; onExpand: () => void }) {
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

function PatternPreviewDialog({ pattern, current, preview, woods, onApply, onDismiss }: { pattern: (typeof BOARD_PATTERNS)[number] | undefined; current: BoardProject; preview: BoardProject; woods: WoodSpecies[]; onApply: () => void; onDismiss: () => void }) {
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

// Memoized: this "how it's built" step tower renders several full ScaledBoardFrame /
// AssembledBoard SVG subtrees. Its props come from the memoized `derived` pipeline and
// are stable across the editor's frequent unrelated re-renders (panel toggles, studio
// state, pending-pattern preview), so shallow-prop memo skips the heavy redraw there.
const HowItsBuilt = memo(function HowItsBuilt({ project, woods, metrics, template, pxPerMm, edgeWidth }: { project: BoardProject; woods: WoodSpecies[]; metrics: EndGrainMetrics; template: EndGrainTemplate; pxPerMm: number; edgeWidth: number }) {
  const { lengthUnit } = useUnitSystem()
  if (project.construction === 'edge') {
    return <section className="how-its-built">
      <header><span className="eyebrow">HOW IT'S BUILT</span></header>
      <div className="build-step">
        <div className="step-heading"><span>1</span><div><h3>Glue-up order</h3><p>Glue strips edge to edge in this order · grain runs along the length</p></div></div>
        <ScaledBoardFrame woods={woods} lengthMm={Math.max(project.length, 1)} widthMm={Math.max(edgeWidth, 1)} pxPerMm={pxPerMm} rulers={['top']} ariaLabel="Edge-grain glue-up order">
          <LongGrainFace strips={project.strips} lengthMm={Math.max(project.length, 1)}/>
        </ScaledBoardFrame>
      </div>
    </section>
  }

  const source = Math.max(project.endGrain.sourceLength, 1)
  const panel = Math.max(metrics.panelWidth, 1)
  const angled = project.strips.some(strip => strip.trailingAngle !== 0)
  return <section className="how-its-built">
    <header><span className="eyebrow">HOW IT'S BUILT</span></header>

    <div className="build-step">
      <div className="step-heading"><span>1</span><div><h3>First glue-up</h3><p>Long boards stacked across the panel · {formatDimensions([project.endGrain.sourceLength, metrics.panelWidth, project.endGrain.stockThickness], lengthUnit)}</p></div></div>
      <ScaledBoardFrame woods={woods} lengthMm={source} widthMm={panel} pxPerMm={pxPerMm} rulers={['top', 'left']} ariaLabel="First glue-up panel">
        <LongGrainFace strips={project.strips} lengthMm={source}/>
      </ScaledBoardFrame>
      {angled && Math.abs(metrics.faceShift) > 0.1 && <FaceShiftWedge leftFaceWidth={template.leftFaceWidth} rightFaceWidth={template.rightFaceWidth} finishedWidth={template.finishedWidth} stockThickness={project.endGrain.stockThickness}/>}
    </div>

    <div className="build-step">
      <div className="step-heading"><span>2</span><div><h3>Crosscut plan</h3><p>{metrics.sliceCount} slices cut across the grain at {formatLength(project.endGrain.sliceThickness, lengthUnit)} · {formatLength(project.endGrain.kerf, lengthUnit)} kerf</p></div></div>
      <ScaledBoardFrame woods={woods} lengthMm={source} widthMm={panel} pxPerMm={pxPerMm} rulers={['top', 'left']} ariaLabel="Crosscut plan">
        <LongGrainFace strips={project.strips} lengthMm={source}/>
        <CrosscutOverlay project={project} metrics={metrics} heightMm={panel} pxPerMm={pxPerMm}/>
      </ScaledBoardFrame>
    </div>

    <div className="build-step">
      <div className="step-heading"><span>3</span><div><h3>After the 90° turn</h3><p>Slices stood on end and re-glued · edit orientation in the finished view above</p></div></div>
      <ScaledBoardFrame woods={woods} lengthMm={Math.max(metrics.finalLength, 1)} widthMm={panel} pxPerMm={pxPerMm} rulers={['top']} ariaLabel="Board after the turn">
        <AssembledBoard project={project} template={template} sliceCount={metrics.sliceCount} pxPerMm={pxPerMm}/>
      </ScaledBoardFrame>
    </div>
  </section>
})

// Drag-to-reorder assembled board for the pop-out. One pointer per column: a
// press without movement cycles rotate/flip (as AssembledBoard does); a press
// that moves past a small threshold lifts the column, opens a dashed gap at the
// drop slot, and commits a new slot order on release. Two-finger pinch is left
// to the pop-out viewport, so single-finger gestures are unambiguously a drag.
function DraggableAssembledBoard({ project, template, sliceCount, pxPerMm, onToggleRow, onReorder, clipIdPrefix = 'edit-slice' }: { project: BoardProject; template: EndGrainTemplate; sliceCount: number; pxPerMm: number; onToggleRow: (index: number) => void; onReorder: (order: number[]) => void; clipIdPrefix?: string }) {
  const groupRef = useRef<SVGGElement>(null)
  const rectsRef = useRef<Array<{ slot: number; mid: number; width: number }>>([])
  const [drag, setDrag] = useState<{ key: number; startX: number; dx: number; moved: boolean; effPx: number; target: number } | null>(null)
  const thickness = Math.max(project.endGrain.stockThickness, 0.001)
  const height = Math.max(template.height, 0.001)
  const k = 1 / pxPerMm
  const slots = Array.from({ length: sliceCount }, (_, index) => index)

  // Slot centres in screen px, captured at drag start (robust to pinch zoom).
  const captureRects = () => {
    const groups = Array.from(groupRef.current?.querySelectorAll('[data-slot]') ?? []) as SVGGElement[]
    rectsRef.current = groups.map(group => {
      const rect = group.getBoundingClientRect()
      return { slot: Number(group.getAttribute('data-slot')), mid: rect.left + rect.width / 2, width: rect.width }
    })
  }
  const onPointerDown = (event: ReactPointerEvent<SVGGElement>) => {
    const cell = (event.target as Element).closest('[data-slot]')
    if (!cell) return
    const slot = Number(cell.getAttribute('data-slot'))
    if (sliceCount < 2) { onToggleRow(slot); return }
    event.currentTarget.setPointerCapture(event.pointerId)
    captureRects()
    const self = rectsRef.current.find(rect => rect.slot === slot)
    setDrag({ key: slot, startX: event.clientX, dx: 0, moved: false, effPx: self && self.width > 0 ? self.width / thickness : pxPerMm, target: slot })
  }
  const onPointerMove = (event: ReactPointerEvent<SVGGElement>) => {
    const clientX = event.clientX
    // 10px slop so a tap (which jitters on touch) stays a tap and rotates,
    // rather than being read as a drag that just lifts the wafer and does nothing.
    setDrag(current => current && { ...current, dx: clientX - current.startX, moved: current.moved || Math.abs(clientX - current.startX) > 10, target: dropTargetFromX(rectsRef.current.map(rect => rect.mid), clientX) })
  }
  const endDrag = () => {
    // Read drag from state and fire the parent update OUTSIDE setDrag's updater —
    // calling onReorder/onToggleRow inside it would setState during render.
    if (drag) {
      // Only reorder if the column actually lands on a different slot; otherwise
      // (a tap, or a drag returned to origin) cycle this wafer's rotate/flip.
      if (drag.moved && drag.target !== drag.key) onReorder(orderWithKeyAt(sliceCount, drag.key, drag.target))
      else onToggleRow(drag.key)
    }
    setDrag(null)
  }

  // Keyboard operation of a slice column (parallels the pointer path): Enter/Space
  // cycles rotate/flip like a tap; Left/Right arrows move the slice one slot like a
  // drag-reorder. Focus naturally follows to the next tabbable column after a move.
  const onColumnKeyDown = (event: ReactKeyboardEvent<SVGGElement>, slot: number) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggleRow(slot); return }
    const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    if (direction === 0 || sliceCount < 2) return
    const target = Math.min(Math.max(slot + direction, 0), sliceCount - 1)
    if (target === slot) return
    event.preventDefault()
    onReorder(orderWithKeyAt(sliceCount, slot, target))
  }
  const column = (slot: number, position: number, dragging = false) => {
    const state: SliceState = { rotated: project.endGrain.rowRotations[slot] ?? false, flipped: project.endGrain.rowFlips[slot] ?? false, offset: project.endGrain.rowOffsets?.[slot] ?? 0, sourceIndex: project.endGrain.rowOrder?.[slot] ?? slot }
    const tag = `${state.rotated ? 'R' : ''}${state.flipped ? 'F' : ''}` || 'N'
    const x = dragging ? slot * thickness + drag!.dx / drag!.effPx : position * thickness
    return <g key={dragging ? 'dragged' : `slot-${slot}`} {...(dragging ? {} : { 'data-slot': slot, tabIndex: 0, role: 'button', onKeyDown: (event: ReactKeyboardEvent<SVGGElement>) => onColumnKeyDown(event, slot) })} transform={`translate(${x} 0)`} className={`slice${dragging ? ' dragging' : ''}`} aria-label={`Slice ${slot + 1}: ${tag}`}>
      <SliceFace project={project} template={template} state={state} clipId={`${clipIdPrefix}-${slot}`}/>
      <rect className="slice-hit" width={thickness} height={height} fill="transparent"/>
      <g transform={`translate(${thickness / 2} ${height / 2}) scale(${k})`}><text className="slice-label" textAnchor="middle" dominantBaseline="middle">{tag}</text></g>
    </g>
  }

  let body: ReactNode
  if (drag && drag.moved) {
    const others = slots.filter(slot => slot !== drag.key)
    let next = 0
    const placed = slots.filter(position => position !== drag.target).map(position => column(others[next++]!, position))
    body = <>
      <rect className="drop-target" x={drag.target * thickness} y={0} width={thickness} height={height}/>
      {placed}
      {column(drag.key, drag.target, true)}
    </>
  } else {
    body = slots.map(slot => column(slot, slot))
  }

  return <g ref={groupRef} className={`assembled-editable${drag && drag.moved ? ' is-dragging' : ''}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}>{body}</g>
}

// Crosscut markers drawn in mm over the glue-up: trim, slice cut lines, kerf
// waste between slices, and the offcut. Pure presentation — the layout math
// (trim-at-each-end convention, positions) lives in crosscutOverlaySegments.
function CrosscutOverlay({ project, metrics, heightMm, pxPerMm }: { project: BoardProject; metrics: EndGrainMetrics; heightMm: number; pxPerMm: number }) {
  const { trimBand, kerf, used, offcut, cutLines, kerfBands } = crosscutOverlaySegments(project.endGrain, metrics)
  return <g className="crosscut-overlay">
    {trimBand > 0 && <WasteBand x={0} width={trimBand} height={heightMm} pxPerMm={pxPerMm} label="TRIM"/>}
    {kerf > 0 && kerfBands.map((x, index) => <rect key={index} className="kerf-band" x={x} y={0} width={kerf} height={heightMm}/>)}
    {cutLines.map((x, index) => <line key={`cut-${index}`} className="cut-line" x1={x} y1={0} x2={x} y2={heightMm} vectorEffect="non-scaling-stroke"/>)}
    {offcut > 0.5 && <WasteBand x={used} width={offcut} height={heightMm} pxPerMm={pxPerMm} label="OFFCUT"/>}
  </g>
}

function WasteBand({ x, width, height, pxPerMm, label }: { x: number; width: number; height: number; pxPerMm: number; label: string }) {
  const cx = x + width / 2
  const cy = height / 2
  return <g className="waste-band">
    <rect x={x} y={0} width={width} height={height}/>
    <g transform={`translate(${cx} ${cy}) scale(${1 / pxPerMm}) rotate(-90)`}><text textAnchor="middle" dominantBaseline="middle">{label}</text></g>
  </g>
}

function EndGrainFields({ settings, onChange }: { settings: EndGrainSettings; onChange: (patch: Partial<EndGrainSettings>) => void }) {
  return <><div className="field-row"><Field label="Glue-up length (mm)" value={settings.sourceLength} onChange={value => onChange({ sourceLength: value })}/><Field label="Stock thickness (mm)" value={settings.stockThickness} onChange={value => onChange({ stockThickness: value })}/></div><div className="field-row"><Field label="Crosscut width (mm)" value={settings.sliceThickness} onChange={value => onChange({ sliceThickness: value })}/><Field label="Blade kerf (mm)" value={settings.kerf} step={0.1} onChange={value => onChange({ kerf: value })}/></div><Field label="Total end trim allowance (mm)" value={settings.trimAllowance} onChange={value => onChange({ trimAllowance: value })}/></>
}

function BuildSummary({ build }: { build: BuildDimensions }) {
  const { lengthUnit } = useUnitSystem()
  const rows: Array<{ label: string; finished: number; rough: number; note?: string }> = [
    { label: 'Length', finished: build.length.finished, rough: build.length.rough },
    { label: 'Width', finished: build.width.finished, rough: build.width.rough },
    { label: 'Thickness', finished: build.thickness.finished, rough: build.thickness.rough, note: `joint ${formatLength(build.thickness.jointing, lengthUnit)} · plane ${formatLength(build.thickness.planing, lengthUnit)} · router ${formatLength(build.thickness.routerTable, lengthUnit)}` },
  ]
  return <div className="build-summary">
    <div className="build-summary-head"><span className="eyebrow">ROUGH STOCK</span><span className="eyebrow">FINISHED</span></div>
    {rows.map(row => <div className="build-summary-row" key={row.label}>
      <span>{row.label}{row.note && <small>{row.note}</small>}</span>
      <b>{formatLength(row.rough, lengthUnit)}</b>
      <b className="finished">{formatLength(row.finished, lengthUnit)}</b>
    </div>)}
    <div className="build-summary-row total"><span>Removed milling stock</span><b>{formatNumber(build.removedBoardFeet)} bf</b><b className="finished">{formatNumber(build.finishedBoardFeet)} bf part</b></div>
  </div>
}

// Print-only banner leading the build sheet: name, construction, date, and the
// headline numbers. Hidden on screen (the live .board-intro covers that there).
function BuildSheetHeader({ project, build, boardFeet, estimatedCost, price }: { project: BoardProject; build: BuildDimensions; boardFeet: number; estimatedCost: number; price: PriceBreakdown }) {
  const { lengthUnit } = useUnitSystem()
  return <header className="print-only print-sheet-header">
    <div>
      <span className="eyebrow">SAWDUSTATLAS · CUTTING BOARD BUILD SHEET</span>
      <h1>{project.name}</h1>
      <p>{project.construction === 'end' ? 'End-grain construction' : 'Edge-grain construction'} · generated {new Date().toLocaleDateString()}</p>
    </div>
    <dl className="print-sheet-facts">
      <div><dt>Finished size</dt><dd>{formatDimensions([build.length.finished, build.width.finished, build.thickness.finished], lengthUnit)}</dd></div>
      <div><dt>Rough stock</dt><dd>{formatNumber(boardFeet)} bf</dd></div>
      <div><dt>Material estimate</dt><dd>${estimatedCost.toFixed(2)}</dd></div>
      <div><dt>Price</dt><dd>${price.total.toFixed(2)}</dd></div>
    </dl>
  </header>
}

// Print-only footer spelling out the allowances and basis behind every number
// on the sheet, so a printed plan is self-explanatory at the bench.
function BuildAssumptions({ project }: { project: BoardProject }) {
  const { lengthUnit } = useUnitSystem()
  const a = project.allowances
  const rows: Array<[string, string]> = [
    ['Units', lengthUnit === 'imperial' ? 'Displayed dimensions are inches rounded to the nearest 1/32; stored calculations remain metric.' : 'All dimensions in millimeters; values are rounded only for display.'],
    ['Milling — thickness', `Jointing ${formatLength(a.jointing, lengthUnit)} + planing ${formatLength(a.planing, lengthUnit)} + router table ${formatLength(a.routerTable, lengthUnit)} removed reaching the finished faces.`],
    ['Milling — width', `${formatLength(a.ripAllowance, lengthUnit)} ripped per strip; ${formatLength(a.widthTrim, lengthUnit)} trimmed squaring the edges.`],
    ['Milling — length', `${formatLength(a.lengthTrim, lengthUnit)} trimmed squaring the ends.`],
  ]
  if (project.construction === 'end') {
    const e = project.endGrain
    rows.push(
      ['First glue-up', `${formatLength(e.sourceLength, lengthUnit)} long × ${formatLength(e.stockThickness, lengthUnit)} thick stock.`],
      ['Crosscut', `${formatLength(e.sliceThickness, lengthUnit)} slices · ${formatLength(e.kerf, lengthUnit)} blade kerf · ${formatLength(e.trimAllowance, lengthUnit)} total end trim.`],
    )
  }
  rows.push(['Pricing', 'Price = material (rough board-feet × price per board foot, including milling waste) + markup + labor by complexity tier + consumables, raised to the configured per-construction minimum. Estimates exclude defects, wood movement, and final surfacing.'])
  return <section className="print-only build-assumptions">
    <h4>Assumptions</h4>
    <dl>{rows.map(([term, detail]) => <div key={term}><dt>{term}</dt><dd>{detail}</dd></div>)}</dl>
  </section>
}

function CutPlanView({ plan }: { plan: CuttingBoardPlan }) {
  const { lengthUnit } = useUnitSystem()
  return <div className="cut-plan-sheet">
    <div className="cut-plan-title"><div><span className="eyebrow">BUILD PLAN</span><h3>Stock, cuts, and sequence</h3></div><div><b>{formatNumber(plan.summary.roughBoardFeet)} bf</b><span>rough stock</span></div><div><b>{plan.summary.ripPasses + plan.summary.crosscutPasses}</b><span>planned saw passes</span></div></div>
    {plan.warnings.length > 0 && <div className="cut-plan-warnings">{plan.warnings.map(warning => <span key={warning}>{convertMetricText(warning, lengthUnit)}</span>)}</div>}
    <div className="cut-plan-columns">
      <section><h4>Stock list</h4><div className="plan-table"><div className="plan-table-head"><span>Qty / species</span><span>Rough dimensions</span><span>BF</span></div>{plan.stock.map(row => <div key={row.id}><span><b>{row.quantity}×</b> {row.speciesName}{row.trailingAngle !== 0 && <small>{formatNumber(row.trailingAngle)}° trailing angle</small>}</span><span>{formatDimensions([row.length, row.width, row.thickness], lengthUnit)}</span><span>{formatNumber(row.boardFeet)}</span></div>)}</div></section>
      <section><h4>Machine cuts</h4><div className="plan-table cuts"><div className="plan-table-head"><span>Operation</span><span>Target</span><span>Passes</span></div>{plan.cuts.map(cut => <div key={cut.id}><span><b>{cut.label}</b><small>{convertMetricText(cut.note, lengthUnit)}</small></span><span>{cut.targetWidth !== undefined ? formatLength(cut.targetWidth, lengthUnit) : '—'}{cut.trailingAngle !== undefined && cut.trailingAngle !== 0 && <small>{formatNumber(cut.trailingAngle)}°</small>}</span><span>{cut.passes}</span></div>)}</div></section>
    </div>
    <section className="build-sequence"><h4>Build sequence</h4><ol>{plan.steps.map(step => <li key={step.id}><span>{step.order}</span><div><b>{step.title}</b><p>{convertMetricText(step.instruction, lengthUnit)}</p></div></li>)}</ol></section>
  </div>
}

// BOARD-025: the at-a-glance bench reference — rip fence widths, saw angles, and the
// crosscut stop/counts a maker dials in at the saw. Sits high; the detailed cards follow.
function BenchSetupCard({ bench }: { bench: BenchSetup }) {
  const { lengthUnit } = useUnitSystem()
  const a = bench.assumptions
  return <section className="bench-card">
    <h3>Bench setup</h3>
    <div className="bench-grid">
      <div className="bench-block">
        <span className="eyebrow">RIP FENCE</span>
        {bench.ripGroups.map(group => <div key={`${group.speciesId}-${group.finishedWidthMm}-${group.trailingAngle}-${group.roughRipWidthMm}`} className="bench-line">
          <b>{formatLength(group.roughRipWidthMm, lengthUnit)}</b><small>×{group.count} {group.speciesName}</small>
        </div>)}
      </div>
      {bench.angles.length > 0 && <div className="bench-block">
        <span className="eyebrow">SAW ANGLE</span>
        {bench.angles.map(angle => <div key={angle.trailingAngleDeg} className="bench-line">
          <b>{formatNumber(angle.sawAngleDeg)}°</b><small>×{angle.count}</small>
        </div>)}
      </div>}
      {bench.crosscut && <div className="bench-block">
        <span className="eyebrow">CROSSCUT</span>
        <div className="bench-line"><b>{formatLength(bench.crosscut.stopBlockMm, lengthUnit)}</b><small>stop block</small></div>
        <div className="bench-line"><b>{bench.crosscut.slices}</b><small>slices · {bench.crosscut.passes} passes</small></div>
      </div>}
    </div>
    <p className="bench-assumptions">Allowances: rip {formatLength(a.ripAllowanceMm, lengthUnit)} · width trim {formatLength(a.widthTrimMm, lengthUnit)} · length trim {formatLength(a.lengthTrimMm, lengthUnit)}{a.construction === 'end' ? ` · kerf ${formatLength(a.kerfMm, lengthUnit)}` : ''}.</p>
  </section>
}

// BOARD-023: a bench/shopping reference — what to rip each strip to, how much stock to
// buy per species (with the running total), and the assumptions behind the numbers.
function StockRequirementsCard({ stock }: { stock: StockRequirements }) {
  const { lengthUnit } = useUnitSystem()
  const a = stock.assumptions
  return <section className="stock-card">
    <h3>Rip &amp; stock list</h3>
    <div className="stock-cols">
      <div>
        <span className="eyebrow">RIP EACH STRIP TO</span>
        {stock.ripGroups.map(group => <div key={`${group.speciesId}-${group.finishedWidthMm}-${group.trailingAngle}-${group.roughRipWidthMm}`} className="stock-rip-row">
          <i style={{ background: group.color }}/>
          <b>{formatLength(group.roughRipWidthMm, lengthUnit)}</b>
          <span>× {group.count} · {group.speciesName}{group.trailingAngle ? ` · ${formatNumber(group.trailingAngle)}°` : ''} <small>(finished {formatLength(group.finishedWidthMm, lengthUnit)})</small></span>
        </div>)}
      </div>
      <div>
        <span className="eyebrow">BUY (BOARD FEET)</span>
        {stock.species.map(species => <div key={species.speciesId} className="stock-buy-row">
          <i style={{ background: species.color }}/><span>{species.name}</span>
          <b>{formatNumber(species.purchasedBoardFeet)} bf</b>
          <small>{formatNumber(species.finishedBoardFeet)} used · {formatNumber(species.wasteBoardFeet)} waste</small>
        </div>)}
        <div className="stock-buy-total"><span>Total purchased</span><b>{formatNumber(stock.totalPurchasedBoardFeet)} bf</b></div>
      </div>
    </div>
    <p className="stock-assumptions">Assumes rip allowance {formatLength(a.ripAllowanceMm, lengthUnit)} · width trim {formatLength(a.widthTrimMm, lengthUnit)} · length trim {formatLength(a.lengthTrimMm, lengthUnit)} · surfacing {formatLength(a.surfacingMm, lengthUnit)}{a.construction === 'end' ? ` · kerf ${formatLength(a.kerfMm, lengthUnit)} · slice ${formatLength(a.sliceThicknessMm ?? 0, lengthUnit)}` : ''}.</p>
  </section>
}

// BOARD-024: the shop-setup numbers a trailing angle implies — what to set the saw to,
// the extra rip width, the face offset, and the wedge of waste — one row per distinct angle.
function AngleSetupCard({ rows, thicknessMm, lengthMm }: { rows: { angle: number, count: number, setup: AngleSetup }[], thicknessMm: number, lengthMm: number }) {
  const { lengthUnit } = useUnitSystem()
  return <section className="stock-card angle-card">
    <h3>Angle &amp; setup</h3>
    <div className="angle-rows">
      <div className="angle-head"><span>Saw angle</span><span>+ Width</span><span>Offset</span><span>Wedge waste</span></div>
      {rows.map(row => <div key={row.angle} className="angle-row">
        <b>{formatNumber(row.setup.sawAngleDeg)}°</b>
        <span>{formatLength(row.setup.effectiveWidthGainMm, lengthUnit)}</span>
        <span>{formatLength(Math.abs(row.setup.angleOffsetMm), lengthUnit)}</span>
        <span>{formatNumber(row.setup.wedgeBoardFeet)} bf <small>×{row.count}</small></span>
      </div>)}
    </div>
    <p className="stock-assumptions">Across {formatLength(thicknessMm, lengthUnit)} stock over {formatLength(lengthMm, lengthUnit)} length. Offset = thickness × tan(angle); wedge is the triangular trim per strip.</p>
  </section>
}

function Stat({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><b>{value}</b></div> }
