import { ChevronDown, Copy, Layers3, Plus, RotateCcw, Scissors, Shuffle, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { StripList } from './StripList'
import { WoodLibraryEditor } from './WoodLibraryEditor'
import { buildEndGrainTemplate, calculateEndGrainMetrics, calculateWoodUsage } from '../domain/boardGeometry'
import type { EndGrainMetrics } from '../domain/boardGeometry'
import { calculateBuildDimensions } from '../domain/boardAllowances'
import type { BuildDimensions } from '../domain/boardAllowances'
import { generateCuttingBoardPlan } from '../domain/boardCutPlan'
import type { CuttingBoardPlan } from '../domain/boardCutPlan'
import { resolveScale } from '../domain/boardScale'
import { useContainerWidth } from './useContainerWidth'
import { usePinchPan } from './usePinchPan'
import { ScaledBoardFrame } from './board/ScaledBoardFrame'
import { LongGrainFace } from './board/LongGrainFace'
import { EndGrainFace } from './board/EndGrainFace'
import { FaceShiftWedge } from './board/FaceShiftWedge'
import type { BoardProject, BoardStrip, BuildAllowances, EndGrainSettings, WoodSpecies } from '../types'
import { createId } from '../id'
import { applyBoardPattern, BOARD_PATTERNS } from '../domain/boardPatterns'
import type { BoardPatternId } from '../domain/boardPatterns'

interface Props { projects: BoardProject[]; project: BoardProject | undefined; woods: WoodSpecies[]; onSelect: (id: string) => void; onCreate: () => void; onChange: (project: BoardProject) => void; onDelete: (id: string) => void; onAddWood: () => void; onUpdateWood: (id: string, patch: Partial<WoodSpecies>) => void; onDeleteWood: (id: string) => void }

export function BoardDesigner({ projects, project, woods, onSelect, onCreate, onChange, onDelete, onAddWood, onUpdateWood, onDeleteWood }: Props) {
  const [canvasRef, canvasWidth] = useContainerWidth(820)
  const [panelOpen, setPanelOpen] = useState(false)
  if (!project) return <div className="empty-page"><h2>No cutting board designs yet</h2><button className="button" onClick={onCreate}><Plus/>Create one</button></div>

  const update = (patch: Partial<BoardProject>) => onChange({ ...project, ...patch, updatedAt: new Date().toISOString() })
  const updateEnd = (patch: Partial<EndGrainSettings>) => update({ endGrain: { ...project.endGrain, ...patch } })
  const updateAllowance = (patch: Partial<BuildAllowances>) => update({ allowances: { ...project.allowances, ...patch } })
  const updateStrip = (id: string, patch: Partial<BoardStrip>) => update({ strips: project.strips.map(strip => strip.id === id ? { ...strip, ...patch } : strip) })
  const width = project.strips.reduce((sum, strip) => sum + strip.width, 0)
  const end = calculateEndGrainMetrics(project)
  const build = calculateBuildDimensions(project)
  const cutPlan = generateCuttingBoardPlan(project, woods)
  const boardFeet = build.roughBoardFeet
  const woodUsage = calculateWoodUsage(project, woods, end)

  // One shared px-per-mm so every preview is true-to-scale and comparable.
  const governingLength = project.construction === 'end'
    ? Math.max(project.endGrain.sourceLength, end.finalLength, 1)
    : Math.max(project.length, 1)
  const { pxPerMm } = resolveScale(governingLength, Math.max(260, canvasWidth - 56))

  const edgeEstimatedCost = project.strips.reduce((sum, strip, index) => {
    const wood = woods.find(candidate => candidate.id === strip.speciesId) ?? woods[0]
    const roughWidth = build.stripRoughWidths[index] ?? strip.width
    return sum + roughWidth * build.length.rough * build.thickness.rough / 2359737.216 * (wood?.pricePerBoardFoot ?? 0)
  }, 0)
  const estimatedCost = project.construction === 'end'
    ? woodUsage.reduce((sum, usage) => sum + usage.requiredBoardFeet * (woods.find(wood => wood.id === usage.speciesId)?.pricePerBoardFoot ?? 0), 0)
    : edgeEstimatedCost

  const addStrip = (speciesId = woods[0]?.id ?? 'walnut') => update({ strips: [...project.strips, { id: createId(), speciesId, width: 38, trailingAngle: 0 }] })
  const duplicatePattern = () => update({ strips: [...project.strips, ...project.strips.map(strip => ({ ...strip, id: createId() }))] })
  const mirrorPattern = () => update({ strips: [...project.strips, ...[...project.strips].reverse().map(strip => ({ ...strip, id: createId() }))] })
  const reverseStrips = () => update({ strips: [...project.strips].reverse() })
  const reorderStrips = (orderedIds: string[]) => update({ strips: orderedIds.map(id => project.strips.find(strip => strip.id === id)).filter((strip): strip is BoardStrip => !!strip) })
  const deleteStrip = (id: string) => update({ strips: project.strips.filter(strip => strip.id !== id) })

  const twoSpecies = (): [string, string] => {
    const primary = project.strips[0]?.speciesId ?? woods[0]?.id ?? 'walnut'
    const secondary = project.strips.find(strip => strip.speciesId !== primary)?.speciesId ?? woods[1]?.id ?? primary
    return [primary, secondary]
  }
  // Even count so an alternating A/B stack isn't a palindrome (needed for the
  // vertical-mirror checkerboard and the brick offset to actually stagger).
  const stripCount = () => { const n = Math.max(project.strips.length, 8); return n % 2 ? n + 1 : n }
  const alternateArrangement = () => {
    const [a, b] = twoSpecies()
    const w = project.strips[0]?.width ?? 38
    update({ strips: Array.from({ length: stripCount() }, (_, i) => ({ id: createId(), speciesId: i % 2 ? b : a, width: w, trailingAngle: 0 })) })
  }
  const gradientArrangement = () => {
    const [a, b] = twoSpecies()
    const base = project.strips.length ? project.strips : Array.from({ length: 6 }, (_, i) => ({ id: '', speciesId: i % 2 ? b : a, width: 0, trailingAngle: 0 }))
    const last = Math.max(1, base.length - 1)
    update({ strips: base.map((strip, i) => ({ id: createId(), speciesId: strip.speciesId || a, width: Math.round(14 + 46 * (i / last)), trailingAngle: 0 })) })
  }
  const randomizeArrangement = () => {
    const shuffled = [...project.strips]
    for (let i = shuffled.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); const swap = shuffled[i]!; shuffled[i] = shuffled[j]!; shuffled[j] = swap }
    update({ strips: shuffled.map(strip => ({ ...strip, id: createId() })) })
  }
  const applyPattern = (pattern: BoardPatternId) => update(applyBoardPattern(pattern, project, woods, end.sliceCount, createId))
  const setRowPattern = (pattern: 'same' | 'rotate' | 'flip' | 'invert') => {
    const flips = Array.from({ length: end.sliceCount }, (_, index) => project.endGrain.rowFlips[index] ?? false)
    const rotations = Array.from({ length: end.sliceCount }, (_, index) => project.endGrain.rowRotations[index] ?? false)
    updateEnd({
      rowFlips: flips.map((flipped, index) => pattern === 'flip' ? index % 2 === 1 : pattern === 'invert' ? !flipped : false),
      rowRotations: rotations.map((rotated, index) => pattern === 'rotate' ? index % 2 === 1 : pattern === 'invert' ? !rotated : false),
      rowOffsets: [],
    })
  }
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
      <div><span className="eyebrow">CUTTING BOARD DESIGNER</span><div className="project-switcher"><select value={project.id} onChange={event => onSelect(event.target.value)}>{projects.map(candidate => <option value={candidate.id} key={candidate.id}>{candidate.name}</option>)}</select><ChevronDown/></div></div>
      <div className="toolbar-actions"><button className="button secondary" onClick={onCreate}><Plus/>New design</button><button className="button secondary danger" onClick={() => onDelete(project.id)} aria-label="Delete this design"><Trash2/>Delete</button></div>
    </div>
    <div className="board-main">
      <div className="board-canvas-area" ref={canvasRef}>
        <div className="board-intro"><span className="eyebrow">LIVE PREVIEW</span><h2>{project.name}</h2><p>{project.construction === 'end' ? 'End-grain workflow · measurements before final sanding' : 'Edge-grain board · finished dimensions'}</p></div>
        {project.construction === 'end' && end.errors.length > 0 && <div className="geometry-errors"><strong>Geometry needs attention</strong>{end.errors.map(error => <span key={error}>{error}</span>)}</div>}

        <FinishedBoard project={project} woods={woods} metrics={end} build={build} edgeWidth={width} pxPerMm={pxPerMm} onToggleRow={cycleRow}/>
        <HowItsBuilt project={project} woods={woods} metrics={end} pxPerMm={pxPerMm} edgeWidth={width}/>

        <div className="board-stats">
          <Stat label="Finished size" value={`${format(build.length.finished)} × ${format(build.width.finished)} × ${format(build.thickness.finished)} mm`}/>
          <Stat label="Rough stock" value={`${format(boardFeet)} bf`}/>
          <Stat label="Material estimate" value={`$${estimatedCost.toFixed(2)}`}/>
          <Stat label={project.construction === 'end' ? 'Total waste' : 'Glue joints'} value={project.construction === 'end' ? `${format(end.totalWasteBoardFeet)} bf · ${format(end.totalWastePercent)}%` : String(Math.max(project.strips.length - 1, 0))}/>
        </div>
        <BuildSummary build={build}/>
        <CutPlanView plan={cutPlan}/>
      </div>
      <aside className={`board-panel${panelOpen ? ' open' : ''}`}>
        <button className="drawer-close" onClick={() => setPanelOpen(false)} aria-label="Close editor panel"><X/></button>
        <div className="panel-section first">
          <h3>Construction</h3>
          <div className="construction-toggle"><button className={project.construction === 'edge' ? 'active' : ''} onClick={() => update({ construction: 'edge' })}>Edge grain</button><button className={project.construction === 'end' ? 'active' : ''} onClick={() => update({ construction: 'end' })}>End grain</button></div>
          <label className="field"><span>Name</span><input value={project.name} onChange={event => update({ name: event.target.value })}/></label>
          {project.construction === 'edge'
            ? <div className="field-row"><Field label="Length (mm)" value={project.length} onChange={value => update({ length: value })}/><Field label="Thickness (mm)" value={project.thickness} onChange={value => update({ thickness: value })}/></div>
            : <EndGrainFields settings={project.endGrain} onChange={updateEnd}/>
          }
        </div>
        {project.construction === 'end' && <><div className="waste-card"><Scissors/><div><span>{end.sliceCount} usable slices</span><b>{format(end.kerfWaste)} mm kerf + {format(end.trimWaste + end.offcutWaste)} mm trim/offcut</b></div></div><div className="wood-usage"><span className="eyebrow">STOCK BY SPECIES</span>{woodUsage.map(usage => <div key={usage.speciesId}><i style={{ background: usage.color }}/><span>{usage.name}<small>{format(usage.requiredBoardFeet)} bf stock</small></span><b>{format(usage.wasteBoardFeet)} bf waste</b></div>)}</div></>}
        <div className="panel-section"><h3>Milling allowances</h3><p>Rough stock removed reaching finished faces, edges, and ends.</p><div className="field-row"><Field label="Jointing (mm)" value={project.allowances.jointing} step={0.5} onChange={value => updateAllowance({ jointing: value })}/><Field label="Planing (mm)" value={project.allowances.planing} step={0.5} onChange={value => updateAllowance({ planing: value })}/></div><div className="field-row"><Field label="Drum sanding (mm)" value={project.allowances.drumSanding} step={0.5} onChange={value => updateAllowance({ drumSanding: value })}/><Field label="Rip per strip (mm)" value={project.allowances.ripAllowance} step={0.1} onChange={value => updateAllowance({ ripAllowance: value })}/></div><div className="field-row"><Field label="Length trim (mm)" value={project.allowances.lengthTrim} onChange={value => updateAllowance({ lengthTrim: value })}/><Field label="Width trim (mm)" value={project.allowances.widthTrim} onChange={value => updateAllowance({ widthTrim: value })}/></div></div>
        <div className="panel-section"><div className="panel-title-row"><div><h3>First glue-up strips</h3><p>{project.strips.length} strips · {format(width)} mm panel width · drag to reorder</p></div><button className="icon-button" onClick={() => addStrip()} aria-label="Add strip"><Plus/></button></div>
          <StripList strips={project.strips} woods={woods} construction={project.construction} onReorder={reorderStrips} onUpdateStrip={updateStrip} onDeleteStrip={deleteStrip}/>
          <button className="add-strip" onClick={() => addStrip()}><Plus/>Add strip</button>
        </div>
        <div className="panel-section pattern-actions"><h3>Strip arrangement</h3><div><button onClick={alternateArrangement}><Layers3/>Alternate</button><button onClick={gradientArrangement}><RotateCcw/>Gradient</button><button onClick={randomizeArrangement}><Shuffle/>Randomize</button><button onClick={mirrorPattern}><Layers3/>Mirror</button><button onClick={duplicatePattern}><Copy/>Repeat</button><button onClick={reverseStrips}><RotateCcw/>Reverse</button></div></div>
        {project.construction === 'end' && <><div className="panel-section row-tools"><h3>End-grain pattern</h3><p>Modular recipes rebuild the strip layout and remain fully editable.</p><div>{BOARD_PATTERNS.map(pattern => <button key={pattern.id} title={pattern.description} onClick={() => applyPattern(pattern.id)}>{pattern.name}</button>)}</div></div>
        <div className="panel-section row-tools"><h3>Per-row override</h3><p>Rotate and flip are distinct when a strip has an angle.</p><div><button onClick={() => setRowPattern('same')}>All same</button><button onClick={() => setRowPattern('rotate')}>Rotate alternate</button><button onClick={() => setRowPattern('flip')}>Flip alternate</button><button onClick={() => setRowPattern('invert')}>Invert all</button></div></div></>}
        <div className="panel-section"><WoodLibraryEditor woods={woods} onAdd={onAddWood} onUpdate={onUpdateWood} onDelete={onDeleteWood} onUse={addStrip}/></div>
      </aside>
      {panelOpen && <div className="panel-scrim" onClick={() => setPanelOpen(false)}/>}
      <button className="panel-fab" onClick={() => setPanelOpen(open => !open)} aria-label="Toggle editor panel"><SlidersHorizontal/>Edit</button>
    </div>
  </div>
}

function FinishedBoard({ project, woods, metrics, build, edgeWidth, pxPerMm, onToggleRow }: { project: BoardProject; woods: WoodSpecies[]; metrics: EndGrainMetrics; build: BuildDimensions; edgeWidth: number; pxPerMm: number; onToggleRow: (index: number) => void }) {
  const isEnd = project.construction === 'end'
  const lengthMm = isEnd ? Math.max(metrics.finalLength, 1) : Math.max(project.length, 1)
  const widthMm = isEnd ? Math.max(metrics.panelWidth, 1) : Math.max(edgeWidth, 1)
  const pinch = usePinchPan()
  return <section className="finished-board">
    <header><span className="eyebrow">FINISHED BOARD</span><span className="scale-note">true to scale · {isEnd ? 'tap a slice · pinch to zoom' : 'top view · pinch to zoom'}</span></header>
    <div className="pinch-viewport" {...pinch.handlers}>
      <div className="pinch-content" style={{ transform: `translate(${pinch.x}px, ${pinch.y}px) scale(${pinch.scale})` }}>
        <ScaledBoardFrame woods={woods} lengthMm={lengthMm} widthMm={widthMm} pxPerMm={pxPerMm} rulers={['top', 'left']} scaleBar ariaLabel="Finished board, drawn to scale">
          {isEnd
            ? <AssembledBoard project={project} sliceCount={metrics.sliceCount} pxPerMm={pxPerMm} onToggleRow={onToggleRow}/>
            : <LongGrainFace strips={project.strips} lengthMm={lengthMm}/>
          }
        </ScaledBoardFrame>
      </div>
      {pinch.active && <button className="zoom-reset" onClick={pinch.reset}>Reset zoom</button>}
    </div>
    <p className="board-dims">{format(build.length.finished)} × {format(build.width.finished)} × {format(build.thickness.finished)} mm finished{isEnd && Math.abs(metrics.faceShift) > 0.1 ? ` · square width ${format(metrics.finishedWidth)} mm after trimming` : ''}</p>
  </section>
}

function HowItsBuilt({ project, woods, metrics, pxPerMm, edgeWidth }: { project: BoardProject; woods: WoodSpecies[]; metrics: EndGrainMetrics; pxPerMm: number; edgeWidth: number }) {
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
  const template = buildEndGrainTemplate(project)
  return <section className="how-its-built">
    <header><span className="eyebrow">HOW IT'S BUILT</span></header>

    <div className="build-step">
      <div className="step-heading"><span>1</span><div><h3>First glue-up</h3><p>Long boards stacked across the panel · {project.endGrain.sourceLength} × {format(metrics.panelWidth)} × {project.endGrain.stockThickness} mm</p></div></div>
      <ScaledBoardFrame woods={woods} lengthMm={source} widthMm={panel} pxPerMm={pxPerMm} rulers={['top', 'left']} ariaLabel="First glue-up panel">
        <LongGrainFace strips={project.strips} lengthMm={source}/>
      </ScaledBoardFrame>
      {angled && Math.abs(metrics.faceShift) > 0.1 && <FaceShiftWedge leftFaceWidth={template.leftFaceWidth} rightFaceWidth={template.rightFaceWidth} finishedWidth={template.finishedWidth} stockThickness={project.endGrain.stockThickness}/>}
    </div>

    <div className="build-step">
      <div className="step-heading"><span>2</span><div><h3>Crosscut plan</h3><p>{metrics.sliceCount} slices cut across the grain at {project.endGrain.sliceThickness} mm · {project.endGrain.kerf} mm kerf</p></div></div>
      <ScaledBoardFrame woods={woods} lengthMm={source} widthMm={panel} pxPerMm={pxPerMm} rulers={['top']} ariaLabel="Crosscut plan">
        <LongGrainFace strips={project.strips} lengthMm={source}/>
        <CrosscutOverlay project={project} metrics={metrics} heightMm={panel} pxPerMm={pxPerMm}/>
      </ScaledBoardFrame>
    </div>

    <div className="build-step">
      <div className="step-heading"><span>3</span><div><h3>After the 90° turn</h3><p>Slices stood on end and re-glued · edit orientation in the finished view above</p></div></div>
      <ScaledBoardFrame woods={woods} lengthMm={Math.max(metrics.finalLength, 1)} widthMm={panel} pxPerMm={pxPerMm} rulers={['top']} ariaLabel="Board after the turn">
        <AssembledBoard project={project} sliceCount={metrics.sliceCount} pxPerMm={pxPerMm}/>
      </ScaledBoardFrame>
    </div>
  </section>
}

// The assembled end-grain board: one column per slice, each showing the strip
// cross-section, with the per-slice rotate/flip transform. Interactive when
// onToggleRow is supplied (the finished hero); static otherwise (process step).
function AssembledBoard({ project, sliceCount, pxPerMm, onToggleRow }: { project: BoardProject; sliceCount: number; pxPerMm: number; onToggleRow?: (index: number) => void }) {
  const template = buildEndGrainTemplate(project)
  const thickness = Math.max(project.endGrain.stockThickness, 0.001)
  const height = Math.max(template.height, 0.001)
  const k = 1 / pxPerMm
  return <g>{Array.from({ length: sliceCount }, (_, index) => {
    const rotated = project.endGrain.rowRotations[index] ?? false
    const flipped = project.endGrain.rowFlips[index] ?? false
    const transform = rotated && flipped ? `translate(0 ${template.height}) scale(1 -1)` : rotated ? `translate(${thickness} ${template.height}) rotate(180)` : flipped ? `translate(${thickness} 0) scale(-1 1)` : undefined
    const state = `${rotated ? 'R' : ''}${flipped ? 'F' : ''}` || 'N'
    const offset = ((((project.endGrain.rowOffsets?.[index] ?? 0) % height) + height) % height)
    const face = <g transform={transform}><EndGrainFace polygons={template.polygons}/></g>
    const body = offset > 0.01
      ? <g clipPath={`url(#sliceclip-${index})`}>
          <clipPath id={`sliceclip-${index}`}><rect width={thickness} height={height}/></clipPath>
          <g transform={`translate(0 ${-offset})`}>{face}</g>
          <g transform={`translate(0 ${height - offset})`}>{face}</g>
        </g>
      : face
    const interactive = !!onToggleRow
    return <g
      key={index}
      transform={`translate(${index * thickness} 0)`}
      className="slice"
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `Slice ${index + 1}: ${state}` : undefined}
      onClick={interactive ? () => onToggleRow(index) : undefined}
      onKeyDown={interactive ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggleRow(index) } } : undefined}
    >
      {body}
      <rect className="slice-hit" width={thickness} height={template.height} fill="transparent"/>
      <g transform={`translate(${thickness / 2} ${template.height / 2}) scale(${k})`}><text className="slice-label" textAnchor="middle" dominantBaseline="middle">{state}</text></g>
    </g>
  })}</g>
}

// Crosscut markers drawn in mm over the glue-up: trim, slice cut lines, kerf
// waste between slices, and the offcut — positions straight from the metrics.
function CrosscutOverlay({ project, metrics, heightMm, pxPerMm }: { project: BoardProject; metrics: EndGrainMetrics; heightMm: number; pxPerMm: number }) {
  const settings = project.endGrain
  const trim = Math.max(0, settings.trimAllowance) / 2
  const slice = Math.max(0, settings.sliceThickness)
  const kerf = Math.max(0, settings.kerf)
  const pitch = slice + kerf
  const used = trim + metrics.sliceCount * slice + metrics.crosscutCount * kerf
  const source = Math.max(settings.sourceLength, 1)
  const offcut = Math.max(0, source - used)
  const cutCount = metrics.sliceCount > 0 ? metrics.sliceCount + 1 : 0
  return <g className="crosscut-overlay">
    {trim > 0 && <WasteBand x={0} width={trim} height={heightMm} pxPerMm={pxPerMm} label="TRIM"/>}
    {kerf > 0 && Array.from({ length: metrics.crosscutCount }, (_, index) => {
      const x = trim + index * pitch + slice
      return <rect key={index} className="kerf-band" x={x} y={0} width={kerf} height={heightMm}/>
    })}
    {Array.from({ length: cutCount }, (_, index) => {
      const x = trim + index * pitch
      return <line key={`cut-${index}`} className="cut-line" x1={x} y1={0} x2={x} y2={heightMm} vectorEffect="non-scaling-stroke"/>
    })}
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
  const rows: Array<{ label: string; finished: number; rough: number; note?: string }> = [
    { label: 'Length', finished: build.length.finished, rough: build.length.rough },
    { label: 'Width', finished: build.width.finished, rough: build.width.rough },
    { label: 'Thickness', finished: build.thickness.finished, rough: build.thickness.rough, note: `joint ${format(build.thickness.jointing)} · plane ${format(build.thickness.planing)} · sand ${format(build.thickness.drumSanding)}` },
  ]
  return <div className="build-summary">
    <div className="build-summary-head"><span className="eyebrow">ROUGH STOCK</span><span className="eyebrow">FINISHED</span></div>
    {rows.map(row => <div className="build-summary-row" key={row.label}>
      <span>{row.label}{row.note && <small>{row.note}</small>}</span>
      <b>{format(row.rough)} mm</b>
      <b className="finished">{format(row.finished)} mm</b>
    </div>)}
    <div className="build-summary-row total"><span>Removed milling stock</span><b>{format(build.removedBoardFeet)} bf</b><b className="finished">{format(build.finishedBoardFeet)} bf part</b></div>
  </div>
}

function CutPlanView({ plan }: { plan: CuttingBoardPlan }) {
  return <div className="cut-plan-sheet">
    <div className="cut-plan-title"><div><span className="eyebrow">BUILD PLAN</span><h3>Stock, cuts, and sequence</h3></div><div><b>{format(plan.summary.roughBoardFeet)} bf</b><span>rough stock</span></div><div><b>{plan.summary.ripPasses + plan.summary.crosscutPasses}</b><span>planned saw passes</span></div></div>
    {plan.warnings.length > 0 && <div className="cut-plan-warnings">{plan.warnings.map(warning => <span key={warning}>{warning}</span>)}</div>}
    <div className="cut-plan-columns">
      <section><h4>Stock list</h4><div className="plan-table"><div className="plan-table-head"><span>Qty / species</span><span>Rough dimensions</span><span>BF</span></div>{plan.stock.map(row => <div key={row.id}><span><b>{row.quantity}×</b> {row.speciesName}{row.trailingAngle !== 0 && <small>{format(row.trailingAngle)}° trailing angle</small>}</span><span>{format(row.length)} × {format(row.width)} × {format(row.thickness)} mm</span><span>{format(row.boardFeet)}</span></div>)}</div></section>
      <section><h4>Machine cuts</h4><div className="plan-table cuts"><div className="plan-table-head"><span>Operation</span><span>Target</span><span>Passes</span></div>{plan.cuts.map(cut => <div key={cut.id}><span><b>{cut.label}</b><small>{cut.note}</small></span><span>{cut.targetWidth !== undefined ? `${format(cut.targetWidth)} mm` : '—'}{cut.trailingAngle !== undefined && cut.trailingAngle !== 0 && <small>{format(cut.trailingAngle)}°</small>}</span><span>{cut.passes}</span></div>)}</div></section>
    </div>
    <section className="build-sequence"><h4>Build sequence</h4><ol>{plan.steps.map(step => <li key={step.id}><span>{step.order}</span><div><b>{step.title}</b><p>{step.instruction}</p></div></li>)}</ol></section>
  </div>
}

function Field({ label, value, step = 1, onChange }: { label: string; value: number; step?: number; onChange: (value: number) => void }) { return <label className="field"><span>{label}</span><input type="number" min="0" step={step} value={value} onChange={event => onChange(Number(event.target.value))}/></label> }
function Stat({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><b>{value}</b></div> }
function format(value: number) { return Number(value.toFixed(2)).toString() }
