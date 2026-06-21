import { ChevronDown, Copy, GripVertical, Layers3, Plus, RotateCcw, Scissors, Trash2 } from 'lucide-react'
import type { CSSProperties } from 'react'
import { species } from '../data'
import { buildEndGrainTemplate, calculateEndGrainMetrics, calculateWoodUsage } from '../domain/boardGeometry'
import type { EndGrainMetrics } from '../domain/boardGeometry'
import type { BoardProject, BoardStrip, EndGrainSettings } from '../types'

interface Props { projects: BoardProject[]; project: BoardProject | undefined; onSelect: (id: string) => void; onCreate: () => void; onChange: (project: BoardProject) => void }

export function BoardDesigner({ projects, project, onSelect, onCreate, onChange }: Props) {
  if (!project) return <div className="empty-page"><h2>No cutting board designs yet</h2><button className="button" onClick={onCreate}><Plus/>Create one</button></div>

  const update = (patch: Partial<BoardProject>) => onChange({ ...project, ...patch, updatedAt: new Date().toISOString() })
  const updateEnd = (patch: Partial<EndGrainSettings>) => update({ endGrain: { ...project.endGrain, ...patch } })
  const updateStrip = (id: string, patch: Partial<BoardStrip>) => update({ strips: project.strips.map(strip => strip.id === id ? { ...strip, ...patch } : strip) })
  const width = project.strips.reduce((sum, strip) => sum + strip.width, 0)
  const end = calculateEndGrainMetrics(project)
  const edgeBoardFeet = width * project.length * project.thickness / 2359737.216
  const boardFeet = project.construction === 'end' ? end.sourceBoardFeet : edgeBoardFeet
  const woodUsage = calculateWoodUsage(project, species, end)
  const edgeEstimatedCost = project.strips.reduce((sum, strip) => {
    const wood = species.find(candidate => candidate.id === strip.speciesId) ?? species[0]
    const length = project.construction === 'end' ? project.endGrain.sourceLength : project.length
    const thickness = project.construction === 'end' ? project.endGrain.stockThickness : project.thickness
    return sum + strip.width * length * thickness / 2359737.216 * wood.pricePerBoardFoot
  }, 0)
  const estimatedCost = project.construction === 'end'
    ? woodUsage.reduce((sum, usage) => sum + usage.requiredBoardFeet * (species.find(wood => wood.id === usage.speciesId)?.pricePerBoardFoot ?? 0), 0)
    : edgeEstimatedCost

  const addStrip = (speciesId = 'walnut') => update({ strips: [...project.strips, { id: crypto.randomUUID(), speciesId, width: 38, trailingAngle: 0 }] })
  const duplicatePattern = () => update({ strips: [...project.strips, ...project.strips.map(strip => ({ ...strip, id: crypto.randomUUID() }))] })
  const mirrorPattern = () => update({ strips: [...project.strips, ...[...project.strips].reverse().map(strip => ({ ...strip, id: crypto.randomUUID() }))] })
  const setRowPattern = (pattern: 'same' | 'rotate' | 'flip' | 'invert') => {
    const flips = Array.from({ length: end.sliceCount }, (_, index) => project.endGrain.rowFlips[index] ?? false)
    const rotations = Array.from({ length: end.sliceCount }, (_, index) => project.endGrain.rowRotations[index] ?? false)
    updateEnd({
      rowFlips: flips.map((flipped, index) => pattern === 'flip' ? index % 2 === 1 : pattern === 'invert' ? !flipped : false),
      rowRotations: rotations.map((rotated, index) => pattern === 'rotate' ? index % 2 === 1 : pattern === 'invert' ? !rotated : false),
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
      <button className="button secondary" onClick={onCreate}><Plus/>New design</button>
    </div>
    <div className="board-main">
      <div className="board-canvas-area">
        <div className="board-intro"><span className="eyebrow">LIVE PREVIEW</span><h2>{project.name}</h2><p>{project.construction === 'end' ? 'End-grain workflow · measurements before final sanding' : 'Edge-grain board · finished dimensions'}</p></div>
        {project.construction === 'end' && end.errors.length > 0 && <div className="geometry-errors"><strong>Geometry needs attention</strong>{end.errors.map(error => <span key={error}>{error}</span>)}</div>}
        {project.construction === 'edge'
          ? <EdgePreview project={project} width={width}/>
          : <EndGrainWorkflow project={project} metrics={end} onToggleRow={cycleRow}/>
        }
        <div className="board-stats">
          <Stat label="Finished size" value={project.construction === 'end' ? `${format(end.finalLength)} × ${format(end.finishedWidth)} × ${format(project.endGrain.sliceThickness)} mm` : `${project.length} × ${format(width)} × ${project.thickness} mm`}/>
          <Stat label="Stock required" value={`${format(boardFeet)} bf`}/>
          <Stat label="Material estimate" value={`$${estimatedCost.toFixed(2)}`}/>
          <Stat label={project.construction === 'end' ? 'Total waste' : 'Glue joints'} value={project.construction === 'end' ? `${format(end.totalWasteBoardFeet)} bf · ${format(end.totalWastePercent)}%` : String(Math.max(project.strips.length - 1, 0))}/>
        </div>
      </div>
      <aside className="board-panel">
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
        <div className="panel-section"><div className="panel-title-row"><div><h3>First glue-up strips</h3><p>{project.strips.length} strips · {format(width)} mm panel width</p></div><button className="icon-button" onClick={() => addStrip()} aria-label="Add strip"><Plus/></button></div>
          <div className="strip-list">{project.strips.map((strip, index) => { const wood = species.find(candidate => candidate.id === strip.speciesId) ?? species[0]; return <div className="strip-row" key={strip.id}><GripVertical/><span className="swatch" style={{ background: wood.color }}/><select value={strip.speciesId} onChange={event => updateStrip(strip.id, { speciesId: event.target.value })}>{species.map(candidate => <option value={candidate.id} key={candidate.id}>{candidate.name}</option>)}</select><input aria-label={`Strip ${index + 1} width`} title="Width in mm" type="number" min="1" step="1" value={strip.width} onChange={event => updateStrip(strip.id, { width: Number(event.target.value) })}/><span>mm</span>{project.construction === 'end' && <><input aria-label={`Strip ${index + 1} trailing angle`} title="Trailing angle" type="number" min="-89" max="89" step="1" value={strip.trailingAngle} onChange={event => updateStrip(strip.id, { trailingAngle: Number(event.target.value) })}/><span>°</span></>}<button aria-label={`Delete strip ${index + 1}`} onClick={() => update({ strips: project.strips.filter((_, stripIndex) => stripIndex !== index) })}><Trash2/></button></div> })}</div>
          <button className="add-strip" onClick={() => addStrip()}><Plus/>Add strip</button>
        </div>
        <div className="panel-section pattern-actions"><h3>Strip tools</h3><div><button onClick={mirrorPattern}><Layers3/>Mirror pattern</button><button onClick={duplicatePattern}><Copy/>Repeat pattern</button><button onClick={() => update({ strips: [...project.strips].reverse() })}><RotateCcw/>Reverse</button></div></div>
        {project.construction === 'end' && <div className="panel-section row-tools"><h3>After-turn row pattern</h3><p>Rotate and flip are distinct when a strip has an angle.</p><div><button onClick={() => setRowPattern('same')}>All same</button><button onClick={() => setRowPattern('rotate')}>Rotate alternate</button><button onClick={() => setRowPattern('flip')}>Flip alternate</button><button onClick={() => setRowPattern('invert')}>Invert all</button></div></div>}
        <div className="panel-section"><h3>Wood library</h3><div className="species-grid">{species.map(wood => <button key={wood.id} onClick={() => addStrip(wood.id)}><i style={{ background: wood.color }}/><span>{wood.name}<small>${wood.pricePerBoardFoot}/bf</small></span><Plus/></button>)}</div></div>
      </aside>
    </div>
  </div>
}

function EdgePreview({ project, width }: { project: BoardProject; width: number }) {
  return <>
    <div className="board-measure length-measure"><span>{project.length} mm</span></div>
    <div className="board-render" style={{ aspectRatio: `${project.length} / ${Math.max(width, 1)}` }}><LongGrainStrips strips={project.strips}/></div>
    <div className="board-measure width-measure"><span>{format(width)} mm</span></div>
  </>
}

function EndGrainWorkflow({ project, metrics, onToggleRow }: { project: BoardProject; metrics: EndGrainMetrics; onToggleRow: (index: number) => void }) {
  const cutStyle = {
    '--source-ratio': `${project.endGrain.sourceLength} / ${Math.max(metrics.panelWidth, 1)}`,
    '--trim-pct': `${project.endGrain.trimAllowance / 2 / project.endGrain.sourceLength * 100}%`,
    '--pitch-pct': `${(project.endGrain.sliceThickness + project.endGrain.kerf) / project.endGrain.sourceLength * 100}%`,
    '--slice-pct': `${project.endGrain.sliceThickness / project.endGrain.sourceLength * 100}%`,
    '--used-pct': `${(project.endGrain.trimAllowance / 2 + metrics.sliceCount * project.endGrain.sliceThickness + Math.max(0, metrics.sliceCount - 1) * project.endGrain.kerf) / project.endGrain.sourceLength * 100}%`,
  } as CSSProperties
  return <div className="workflow-stack">
    <section className="workflow-step"><div className="step-heading"><span>1</span><div><h3>First glue-up</h3><p>Long-grain strips before any crosscuts · {project.endGrain.sourceLength} × {format(metrics.panelWidth)} × {project.endGrain.stockThickness} mm</p></div></div><div className="glueup-preview"><LongGrainStrips strips={project.strips}/></div>{project.strips.some(strip => strip.trailingAngle !== 0) && <div className="cross-section"><span>Angled strip cross-section</span><EndGrainTemplateSvg project={project}/></div>}{Math.abs(metrics.faceShift) > .1 && <div className="angle-warning">Outer faces differ by {format(Math.abs(metrics.faceShift))} mm. Balance the trailing angles or plan to trim the white wedges shown after the turn.</div>}</section>
    <section className="workflow-step"><div className="step-heading"><span>2</span><div><h3>Crosscut plan</h3><p>{metrics.sliceCount} slices at {project.endGrain.sliceThickness} mm · {project.endGrain.kerf} mm kerf</p></div></div><div className="cut-plan" style={cutStyle}><div className="cut-plan-wood"><LongGrainStrips strips={project.strips}/></div><div className="trim start">TRIM</div><div className="cut-repeat"/><div className="trim end">OFFCUT</div></div></section>
    <section className="workflow-step final-step"><div className="step-heading"><span>3</span><div><h3>After the 90° turn</h3><p>Click a slice to cycle normal, rotated, flipped, and both</p></div></div><EndGrainBoardSvg project={project} sliceCount={metrics.sliceCount} onToggleRow={onToggleRow}/><div className="transform-legend"><span>N normal</span><span>R rotated</span><span>F flipped</span><span>RF both</span></div></section>
  </div>
}

function LongGrainStrips({ strips }: { strips: BoardStrip[] }) {
  if (!strips.length) return <div className="board-empty"><Plus/>Add strips to begin</div>
  return strips.map(strip => { const wood = species.find(candidate => candidate.id === strip.speciesId) ?? species[0]; return <i key={strip.id} title={`${wood.name} · ${strip.width} mm`} className="wood-strip" style={{ flex: strip.width, '--wood': wood.color, '--grain': wood.accent } as CSSProperties}/> })
}

function WoodPatterns() {
  return <defs>{species.map(wood => <pattern id={`end-${wood.id}`} key={wood.id} width="18" height="18" patternUnits="userSpaceOnUse"><rect width="18" height="18" fill={wood.color}/><ellipse cx="5" cy="7" rx="4" ry="6" fill="none" stroke={wood.accent} strokeWidth="1.2" opacity=".7"/><path d="M11 0c-4 5-4 13 0 18M15 0c-3 6-3 12 0 18" fill="none" stroke={wood.accent} strokeWidth=".8" opacity=".55"/></pattern>)}</defs>
}

function EndGrainTemplateSvg({ project }: { project: BoardProject }) {
  const template = buildEndGrainTemplate(project)
  const thickness = project.endGrain.stockThickness
  return <svg viewBox={`0 0 ${thickness} ${template.height}`} preserveAspectRatio="xMidYMid meet"><WoodPatterns/>{template.polygons.map(polygon => <polygon key={polygon.id} points={polygon.points} fill={`url(#end-${polygon.speciesId})`} stroke="#1b211d" strokeWidth=".45"/>)}</svg>
}

function EndGrainBoardSvg({ project, sliceCount, onToggleRow }: { project: BoardProject; sliceCount: number; onToggleRow: (index: number) => void }) {
  const template = buildEndGrainTemplate(project)
  const thickness = project.endGrain.stockThickness
  const boardLength = Math.max(1, sliceCount * thickness)
  return <svg className="endgrain-svg" viewBox={`0 0 ${boardLength} ${template.height}`} preserveAspectRatio="xMidYMid meet"><WoodPatterns/>{Array.from({ length: sliceCount }, (_, index) => {
    const rotated = project.endGrain.rowRotations[index] ?? false
    const flipped = project.endGrain.rowFlips[index] ?? false
    const transform = rotated && flipped ? `translate(0 ${template.height}) scale(1 -1)` : rotated ? `translate(${thickness} ${template.height}) rotate(180)` : flipped ? `translate(${thickness} 0) scale(-1 1)` : undefined
    const state = `${rotated ? 'R' : ''}${flipped ? 'F' : ''}` || 'N'
    return <g key={index} transform={`translate(${index * thickness} 0)`} role="button" tabIndex={0} aria-label={`Slice ${index + 1}: ${state}`} onClick={() => onToggleRow(index)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') onToggleRow(index) }}><g transform={transform}>{template.polygons.map(polygon => <polygon key={polygon.id} points={polygon.points} fill={`url(#end-${polygon.speciesId})`} stroke="#1b211d" strokeWidth=".55"/>)}</g><rect width={thickness} height={template.height} fill="transparent"/><text x={thickness / 2} y={Math.max(8, template.height - 4)} textAnchor="middle">{state}</text></g>
  })}</svg>
}

function EndGrainFields({ settings, onChange }: { settings: EndGrainSettings; onChange: (patch: Partial<EndGrainSettings>) => void }) {
  return <><div className="field-row"><Field label="Glue-up length (mm)" value={settings.sourceLength} onChange={value => onChange({ sourceLength: value })}/><Field label="Stock thickness (mm)" value={settings.stockThickness} onChange={value => onChange({ stockThickness: value })}/></div><div className="field-row"><Field label="Crosscut width (mm)" value={settings.sliceThickness} onChange={value => onChange({ sliceThickness: value })}/><Field label="Blade kerf (mm)" value={settings.kerf} step={0.1} onChange={value => onChange({ kerf: value })}/></div><Field label="Total end trim allowance (mm)" value={settings.trimAllowance} onChange={value => onChange({ trimAllowance: value })}/></>
}

function Field({ label, value, step = 1, onChange }: { label: string; value: number; step?: number; onChange: (value: number) => void }) { return <label className="field"><span>{label}</span><input type="number" min="0" step={step} value={value} onChange={event => onChange(Number(event.target.value))}/></label> }
function Stat({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><b>{value}</b></div> }
function format(value: number) { return Number(value.toFixed(2)).toString() }
