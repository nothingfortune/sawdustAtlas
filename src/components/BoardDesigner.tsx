import { ArrowUpNarrowWide, ChevronDown, Copy, Eye, FlipHorizontal2, Layers3, Plus, Printer, RotateCcw, Scissors, Shuffle, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { StripList } from './StripList'
import { applySliceOrder, clampTransforms, readSliceStates } from '../domain/boardSlices'
import { buildEndGrainTemplate, calculateEndGrainMetrics, calculateWoodUsage } from '../domain/boardGeometry'
import { calculateBuildDimensions } from '../domain/boardAllowances'
import { generateCuttingBoardPlan } from '../domain/boardCutPlan'
import { resolveScale } from '../domain/boardScale'
import { isSquareAngle } from '../domain/units'
import { useContainerWidth } from './useContainerWidth'
import type { BoardProject, BoardStrip, EndGrainSettings, PricingSettings, WoodSpecies } from '../types'
import { createId } from '../id'
import { NumberField as Field } from './fields'
import { alternateStrips, applyBoardPattern, BOARD_PATTERNS, gradientStrips, shuffleStripsAvoidingAdjacent } from '../domain/boardPatterns'
import type { BoardPatternId } from '../domain/boardPatterns'
import { calculateStockRequirements } from '../domain/boardStock'
import { calculateAngleSetup } from '../domain/boardAngle'
import { summarizeBenchSetup } from '../domain/boardBench'
import { formatDimensions, formatLength, formatNumber, MM_PER_INCH } from '../domain/lengthUnits'
import { useUnitSystem } from './unitSystem'
import { calculatePrice, classifyBoard, materialCost, roughPieceCost } from '../domain/pricing'
import { PriceBreakdownCard } from './board/PriceBreakdownCard'
import { HowItsBuilt } from './board/HowItsBuilt'
import { PreviewStudio } from './board/PreviewStudio'
import { PatternPreviewDialog } from './board/PatternPreviewDialog'
import { BuildAssumptions, BuildSheetHeader, BuildSummary, CutPlanView, BenchSetupCard, StockRequirementsCard, AngleSetupCard } from './board/BuildSheet'

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

function EndGrainFields({ settings, onChange }: { settings: EndGrainSettings; onChange: (patch: Partial<EndGrainSettings>) => void }) {
  return <><div className="field-row"><Field label="Glue-up length (mm)" value={settings.sourceLength} onChange={value => onChange({ sourceLength: value })}/><Field label="Stock thickness (mm)" value={settings.stockThickness} onChange={value => onChange({ stockThickness: value })}/></div><div className="field-row"><Field label="Crosscut width (mm)" value={settings.sliceThickness} onChange={value => onChange({ sliceThickness: value })}/><Field label="Blade kerf (mm)" value={settings.kerf} step={0.1} onChange={value => onChange({ kerf: value })}/></div><Field label="Total end trim allowance (mm)" value={settings.trimAllowance} onChange={value => onChange({ trimAllowance: value })}/></>
}

function Stat({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><b>{value}</b></div> }
