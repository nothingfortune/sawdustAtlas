import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { AlertTriangle, Ban, Box, ChevronDown, CircleGauge, Copy, DoorOpen, PencilRuler, Plus, SlidersHorizontal, Trash2, Warehouse, X } from 'lucide-react'
import type { ShopBlockedZone, ShopItem, ShopItemKind, ShopProject } from '../types'
import { createId } from '../id'
import { NumberField as Field } from './fields'
import { createShopItem, SHOP_ITEM_KINDS, SHOP_OBJECT_TEMPLATES } from '../domain/shopObjects'
import type { ShopObjectDefinition } from '../domain/shopObjects'
import { getBlockedZoneFootprint, getFeedClearanceZones, getShopItemFootprint, pointsAttribute, polygonsOverlap, projectIsometric, projectPolygon } from '../domain/shopGeometry'
import type { Point2D } from '../domain/shopGeometry'
import { formatDimensions, formatLength, formatLengthValue } from '../domain/lengthUnits'
import { useUnitSystem } from './unitSystem'

interface Props { projects: ShopProject[]; project: ShopProject | undefined; onSelect: (id: string) => void; onCreate: () => void; onChange: (project: ShopProject) => void; onDelete: (id: string) => void }

const SCALE = .094
const DRAW_ZONE_LABEL = 'Out-of-bounds zone'

const DEFAULT_CUSTOM_OBJECT: ShopObjectDefinition = {
  name: 'Custom object',
  kind: 'custom',
  width: 600,
  depth: 600,
  height: 900,
  clearance: 300,
  color: '#66766d',
}

export function ShopPlanner({ projects, project, onSelect, onCreate, onChange, onDelete }: Props) {
  const { lengthUnit } = useUnitSystem()
  const [selected, setSelected] = useState<string>('')
  const [zoom, setZoom] = useState(1)
  const [showGrid, setShowGrid] = useState(true)
  const [viewMode, setViewMode] = useState<'top' | 'angled'>('top')
  const [drawMode, setDrawMode] = useState(false)
  const [customObject, setCustomObject] = useState<ShopObjectDefinition>(DEFAULT_CUSTOM_OBJECT)
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)
  const [draftZone, setDraftZone] = useState<ShopBlockedZone | null>(null)
  const zoomRef = useRef(zoom)
  const canvasRef = useRef<HTMLDivElement>(null)
  const drawStartRef = useRef<Point2D | null>(null)
  const [lastProjectId, setLastProjectId] = useState(project?.id)

  useEffect(() => { zoomRef.current = zoom }, [zoom])
  if (project?.id !== lastProjectId) {
    setLastProjectId(project?.id)
    setSelected('')
    setDrawMode(false)
    setDraftZone(null)
  }

  const itemId = selected.startsWith('item:') ? selected.slice(5) : ''
  const zoneId = selected.startsWith('zone:') ? selected.slice(5) : ''
  const item = project?.items.find(candidate => candidate.id === itemId)
  const zone = project?.blockedZones.find(candidate => candidate.id === zoneId)
  const blockedConflicts = project ? getBlockedZoneConflicts(project) : []
  const selectedItemConflicts = item ? blockedConflicts.find(conflict => conflict.item.id === item.id)?.zones ?? [] : []

  const update = (patch: Partial<ShopProject>) => project && onChange({ ...project, ...patch, updatedAt: new Date().toISOString() })
  const updateItem = (id: string, patch: Partial<ShopItem>) => project && update({ items: project.items.map(candidate => candidate.id === id ? { ...candidate, ...patch } : candidate) })
  const updateZone = (id: string, patch: Partial<ShopBlockedZone>) => project && update({
    blockedZones: project.blockedZones.map(candidate => candidate.id === id ? fitZoneToRoom({ ...candidate, ...patch }, project) : candidate),
  })
  const addItem = (definition: ShopObjectDefinition) => {
    if (!project) return
    const next = createShopItem({ ...definition, name: definition.name.trim() || 'Custom object' }, project, createId())
    update({ items: [...project.items, next] })
    setSelected(`item:${next.id}`)
    setLeftOpen(false)
    setRightOpen(true)
  }
  const removeItem = () => {
    if (!project || !item) return
    update({ items: project.items.filter(candidate => candidate.id !== item.id) })
    setSelected('')
  }
  const removeZone = () => {
    if (!project || !zone) return
    update({ blockedZones: project.blockedZones.filter(candidate => candidate.id !== zone.id) })
    setSelected('')
  }

  const resizeRoom = (patch: Partial<Pick<ShopProject, 'width' | 'depth' | 'gridSize'>>) => {
    if (!project) return
    const nextRoom = {
      width: Math.max(1000, patch.width ?? project.width),
      depth: Math.max(1000, patch.depth ?? project.depth),
    }
    update({
      ...patch,
      width: nextRoom.width,
      depth: nextRoom.depth,
      gridSize: Math.max(100, patch.gridSize ?? project.gridSize),
      items: project.items.map(candidate => ({
        ...candidate,
        x: clamp(candidate.x, 0, Math.max(0, nextRoom.width - candidate.width)),
        y: clamp(candidate.y, 0, Math.max(0, nextRoom.depth - candidate.depth)),
      })),
      blockedZones: project.blockedZones.map(candidate => fitZoneToRoom(candidate, nextRoom)),
    })
  }

  const onObjectKeyDown = (event: ReactKeyboardEvent, target: ShopItem) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(`item:${target.id}`); return }
    const step = event.shiftKey ? 100 : 10
    const delta: [number, number] | null = event.key === 'ArrowLeft' ? [-step, 0] : event.key === 'ArrowRight' ? [step, 0] : event.key === 'ArrowUp' ? [0, -step] : event.key === 'ArrowDown' ? [0, step] : null
    if (!delta || !project) return
    event.preventDefault()
    setSelected(`item:${target.id}`)
    updateItem(target.id, {
      x: clamp(target.x + delta[0], 0, Math.max(0, project.width - target.width)),
      y: clamp(target.y + delta[1], 0, Math.max(0, project.depth - target.depth)),
    })
  }

  const onZoneKeyDown = (event: ReactKeyboardEvent, target: ShopBlockedZone) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(`zone:${target.id}`); return }
    const step = event.shiftKey ? 100 : 10
    const delta: [number, number] | null = event.key === 'ArrowLeft' ? [-step, 0] : event.key === 'ArrowRight' ? [step, 0] : event.key === 'ArrowUp' ? [0, -step] : event.key === 'ArrowDown' ? [0, step] : null
    if (!delta || !project) return
    event.preventDefault()
    setSelected(`zone:${target.id}`)
    updateZone(target.id, {
      x: clamp(target.x + delta[0], 0, Math.max(0, project.width - target.width)),
      y: clamp(target.y + delta[1], 0, Math.max(0, project.depth - target.depth)),
    })
  }

  function beginItemDrag(event: ReactPointerEvent, target: ShopItem) {
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelected(`item:${target.id}`)
    const start = { x: event.clientX, y: event.clientY, itemX: target.x, itemY: target.y }
    const move = (next: PointerEvent) => updateItem(target.id, {
      x: clamp(start.itemX + (next.clientX - start.x) / (SCALE * zoomRef.current), 0, Math.max(0, (project?.width ?? 0) - target.width)),
      y: clamp(start.itemY + (next.clientY - start.y) / (SCALE * zoomRef.current), 0, Math.max(0, (project?.depth ?? 0) - target.depth)),
    })
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  function beginZoneDrag(event: ReactPointerEvent, target: ShopBlockedZone) {
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelected(`zone:${target.id}`)
    const start = { x: event.clientX, y: event.clientY, zoneX: target.x, zoneY: target.y }
    const move = (next: PointerEvent) => updateZone(target.id, {
      x: clamp(start.zoneX + (next.clientX - start.x) / (SCALE * zoomRef.current), 0, Math.max(0, (project?.width ?? 0) - target.width)),
      y: clamp(start.zoneY + (next.clientY - start.y) / (SCALE * zoomRef.current), 0, Math.max(0, (project?.depth ?? 0) - target.depth)),
    })
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  function beginZoneDraw(event: ReactPointerEvent<HTMLDivElement>) {
    if (!project || event.target !== event.currentTarget) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const start = getCanvasPoint(event.clientX, event.clientY, canvasRef.current, zoomRef.current, project)
    if (!start) return
    drawStartRef.current = start
    setDraftZone(zoneFromPoints(start, start))
    const move = (next: PointerEvent) => {
      const current = getCanvasPoint(next.clientX, next.clientY, canvasRef.current, zoomRef.current, project)
      if (!current || !drawStartRef.current) return
      setDraftZone(zoneFromPoints(drawStartRef.current, current))
    }
    const up = () => {
      const nextDraft = draftZoneRef.current
      if (project && nextDraft && nextDraft.width >= 120 && nextDraft.depth >= 120) {
        const created = fitZoneToRoom({ ...nextDraft, id: createId(), name: `${DRAW_ZONE_LABEL} ${project.blockedZones.length + 1}` }, project)
        update({ blockedZones: [...project.blockedZones, created] })
        setSelected(`zone:${created.id}`)
        setRightOpen(true)
      }
      drawStartRef.current = null
      setDraftZone(null)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const draftZoneRef = useLiveRef(draftZone)

  const pinchPointers = useRef(new Map<number, { x: number; y: number }>())
  const pinchStart = useRef<{ dist: number; zoom: number } | null>(null)
  const pinchDist = () => { const [a, b] = [...pinchPointers.current.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0 }
  const onStagePointerDown = (event: ReactPointerEvent) => {
    pinchPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pinchPointers.current.size === 2) pinchStart.current = { dist: pinchDist() || 1, zoom }
  }
  const onStagePointerMove = (event: ReactPointerEvent) => {
    if (!pinchPointers.current.has(event.pointerId)) return
    pinchPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pinchPointers.current.size === 2 && pinchStart.current) setZoom(clamp(pinchStart.current.zoom * (pinchDist() / pinchStart.current.dist), .35, 1.25))
  }
  const onStagePointerEnd = (event: ReactPointerEvent) => {
    pinchPointers.current.delete(event.pointerId)
    if (pinchPointers.current.size < 2) pinchStart.current = null
  }

  if (!project) return <Empty title="No workshop plans yet" action={onCreate}/>

  const canvasStyle = {
    width: project.width * SCALE,
    height: project.depth * SCALE,
    transform: `scale(${zoom})`,
  } as CSSProperties

  return <div className="designer-layout">
    <div className="designer-toolbar">
      <div><span className="eyebrow">WORKSHOP PLANNER</span><div className="project-switcher"><select value={project.id} onChange={event => onSelect(event.target.value)}>{projects.map(candidate => <option value={candidate.id} key={candidate.id}>{candidate.name}</option>)}</select><ChevronDown/></div></div>
      <div className="toolbar-actions"><button className={`button secondary ${drawMode ? 'active' : ''}`} onClick={() => { setDrawMode(active => !active); setSelected('') }}><PencilRuler/>{drawMode ? 'Done drawing' : 'Draw no-go zones'}</button><button className="button secondary" onClick={onCreate}><Plus/>New plan</button><button className="button secondary danger" onClick={() => onDelete(project.id)} aria-label="Delete this workshop"><Trash2/>Delete</button></div>
    </div>
    <div className={`tool-panel left-panel${leftOpen ? ' open' : ''}`}>
      <button className="drawer-close" onClick={() => setLeftOpen(false)} aria-label="Close objects panel"><X/></button>
      <h3>Objects</h3><p>Click to add to your floor plan.</p>
      <div className="template-list">{SHOP_OBJECT_TEMPLATES.map(template => <button key={template.name} onClick={() => addItem(template)}><span style={{ background: template.color }}><ObjectIcon kind={template.kind}/></span><div><b>{template.name}</b><small>{formatDimensions([template.width, template.depth], lengthUnit)}</small></div><Plus/></button>)}</div>
      <div className="panel-section custom-object-form">
        <h3>Add custom object</h3><p>Define anything that is not in the catalog.</p>
        <TextField label="Name" value={customObject.name} onChange={name => setCustomObject(current => ({ ...current, name }))}/>
        <KindField value={customObject.kind} onChange={kind => setCustomObject(current => ({ ...current, kind }))}/>
        <div className="field-row"><Field label="Width (mm)" value={customObject.width} min={1} onChange={width => setCustomObject(current => ({ ...current, width }))}/><Field label="Depth (mm)" value={customObject.depth} min={1} onChange={depth => setCustomObject(current => ({ ...current, depth }))}/></div>
        <Field label="Height (mm)" value={customObject.height} min={1} onChange={height => setCustomObject(current => ({ ...current, height }))}/>
        <Field label="Working clearance (mm)" value={customObject.clearance} onChange={clearance => setCustomObject(current => ({ ...current, clearance }))}/>
        <ColorField value={customObject.color} onChange={color => setCustomObject(current => ({ ...current, color }))}/>
        <button className="button full" onClick={() => addItem(customObject)}><Plus/>Add custom object</button>
      </div>
      <div className="panel-section">
        <h3>Room size</h3>
        <div className="field-row"><Field label="Width (mm)" value={project.width} min={1000} onChange={width => resizeRoom({ width })}/><Field label="Depth (mm)" value={project.depth} min={1000} onChange={depth => resizeRoom({ depth })}/></div>
        <Field label="Grid spacing (mm)" value={project.gridSize} min={100} step={50} onChange={gridSize => resizeRoom({ gridSize })}/>
        <p className="zone-help">The floor stays rectangular. Use no-go zones to carve out alcoves, utility chases, stairs, posts, and other unusable floor area.</p>
      </div>
      <div className="panel-section">
        <div className="panel-title-row"><div><h3>Floor shape</h3><p>Draw rectangular out-of-bounds areas directly on the floor.</p></div><button className={`selection-chip ${drawMode ? 'active' : ''}`} onClick={() => { setDrawMode(active => !active); setSelected('') }}>{drawMode ? 'Drawing' : 'Draw'}</button></div>
        <div className="zone-list">
          {project.blockedZones.map(blockedZone => <button className={`blocked-zone-card ${zone?.id === blockedZone.id ? 'selected' : ''}`} onClick={() => { setSelected(`zone:${blockedZone.id}`); setRightOpen(true) }} key={blockedZone.id}>
            <span><b>{blockedZone.name}</b><small>{formatDimensions([blockedZone.width, blockedZone.depth], lengthUnit)}</small></span>
            <Ban/>
          </button>)}
          {project.blockedZones.length === 0 && <p className="zone-help">No no-go zones yet. Turn on draw mode and drag on the floor plan to define unusable areas.</p>}
        </div>
      </div>
    </div>
    <div className="canvas-wrap">
      <div className="view-mode-toggle"><button className={viewMode === 'top' ? 'active' : ''} onClick={() => setViewMode('top')}>Top</button><button className={viewMode === 'angled' ? 'active' : ''} onClick={() => setViewMode('angled')}>Angled</button></div>
      {blockedConflicts.length > 0 && <div className="planner-alert"><AlertTriangle/><span>{blockedConflicts.length} object{blockedConflicts.length === 1 ? '' : 's'} overlap out-of-bounds floor zones.</span></div>}
      {viewMode === 'top'
        ? <>
          <div className="canvas-controls">
            <button onClick={() => setZoom(z => Math.max(.35, z - .1))} aria-label="Zoom out">−</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(1.25, z + .1))} aria-label="Zoom in">+</button>
            <button className="canvas-controls-text" onClick={() => setZoom(1)} aria-label="Reset zoom to 100%">100%</button>
            <button className={`canvas-controls-text ${showGrid ? 'active' : ''}`} onClick={() => setShowGrid(value => !value)} aria-pressed={showGrid}>Grid</button>
          </div>
          {drawMode && <div className="draw-zone-banner">Drag on the floor to mark unusable area. Rectangles smaller than {formatLength(120, lengthUnit)} are ignored.</div>}
          <div className="room-stage" onPointerDown={onStagePointerDown} onPointerMove={onStagePointerMove} onPointerUp={onStagePointerEnd} onPointerCancel={onStagePointerEnd} style={{ width: project.width * SCALE * zoom + 80, height: project.depth * SCALE * zoom + 80, touchAction: 'none' }}>
            <div ref={canvasRef} className={`room-canvas ${drawMode ? 'drawing' : ''}`} onPointerDown={event => drawMode ? beginZoneDraw(event) : setSelected('')} style={canvasStyle}>
              {showGrid && <FloorGridLayer project={project}/>}
              <BlockedZoneLayer project={project} draftZone={draftZone} selectedZoneId={zone?.id ?? ''} onPointerDown={beginZoneDrag} onKeyDown={onZoneKeyDown}/>
              <FeedClearanceLayer project={project}/>
              {project.items.map(candidate => {
                const overlapsBlockedZone = blockedConflicts.some(conflict => conflict.item.id === candidate.id)
                return <div key={candidate.id} role="button" tabIndex={0} aria-label={`${candidate.name}, ${formatDimensions([candidate.width, candidate.depth], lengthUnit)}`} aria-pressed={item?.id === candidate.id} className={`shop-object ${item?.id === candidate.id ? 'selected' : ''} ${overlapsBlockedZone ? 'warning' : ''}`} onPointerDown={event => { if (drawMode) return; event.stopPropagation(); beginItemDrag(event, candidate) }} onKeyDown={event => onObjectKeyDown(event, candidate)} style={{ left: candidate.x * SCALE, top: candidate.y * SCALE, width: candidate.width * SCALE, height: candidate.depth * SCALE, transform: `rotate(${candidate.rotation}deg)`, background: candidate.color }}>
                  {candidate.clearance > 0 && <span className="clearance" style={{ inset: -candidate.clearance * SCALE }}/>}
                  <span className="object-name">{candidate.name}<small>{formatDimensions([candidate.width, candidate.depth], lengthUnit)}</small></span>
                </div>
              })}
              <span className="dimension width-dimension">{formatLength(project.width, lengthUnit)}</span><span className="dimension depth-dimension">{formatLength(project.depth, lengthUnit)}</span>
            </div>
          </div>
        </>
        : <AngledShopView project={project} selected={selected} onSelect={setSelected}/>}
    </div>
    <div className={`tool-panel right-panel${rightOpen ? ' open' : ''}`}>
      <button className="drawer-close" onClick={() => setRightOpen(false)} aria-label="Close inspector"><X/></button>
      {item
        ? <>
          <div className="inspector-heading"><div><span className="eyebrow">SELECTED OBJECT</span><input value={item.name} onChange={event => updateItem(item.id, { name: event.target.value })}/></div><button className="icon-button danger" onClick={removeItem}><Trash2/></button></div>
          <div className="field-row"><Field label="Width (mm)" value={item.width} min={1} onChange={value => updateItem(item.id, { width: value })}/><Field label="Depth (mm)" value={item.depth} min={1} onChange={value => updateItem(item.id, { depth: value })}/></div>
          <Field label="Height (mm)" value={item.height} min={1} onChange={value => updateItem(item.id, { height: value })}/>
          <Field label="Working clearance (mm)" value={item.clearance} onChange={value => updateItem(item.id, { clearance: value })}/>
          <KindField value={item.kind} onChange={kind => updateItem(item.id, { kind })}/>
          <ColorField value={item.color} onChange={color => updateItem(item.id, { color })}/>
          <div className="field-label">Rotation</div><div className="rotation-buttons">{[0, 90, 180, 270].map(rotation => <button className={item.rotation === rotation ? 'active' : ''} onClick={() => updateItem(item.id, { rotation })} key={rotation}>{rotation}°</button>)}</div>
          <div className="panel-section feed-settings"><h3>Infeed / outfeed</h3><p>Direction is relative to the object and follows its rotation.</p>
            <div className="feed-direction-buttons"><button className={item.feedDirection === null ? 'active' : ''} onClick={() => updateItem(item.id, { feedDirection: null })}>Off</button>{([0, 90, 180, 270] as const).map(direction => <button className={item.feedDirection === direction ? 'active' : ''} onClick={() => updateItem(item.id, { feedDirection: direction })} key={direction}>{direction === 0 ? '→' : direction === 90 ? '↓' : direction === 180 ? '←' : '↑'}</button>)}</div>
            {item.feedDirection !== null && <><div className="field-row"><Field label="Infeed (mm)" value={item.infeedClearance} onChange={infeedClearance => updateItem(item.id, { infeedClearance })}/><Field label="Outfeed (mm)" value={item.outfeedClearance} onChange={outfeedClearance => updateItem(item.id, { outfeedClearance })}/></div><Field label="Side margin (mm)" value={item.sideClearance} onChange={sideClearance => updateItem(item.id, { sideClearance })}/></>}
          </div>
          {selectedItemConflicts.length > 0 && <div className="planner-alert inspector-alert"><AlertTriangle/><span>Overlaps {selectedItemConflicts.map(conflict => conflict.name).join(', ')}.</span></div>}
          <button className="button secondary full" onClick={() => {
            const copy = {
              ...item,
              id: createId(),
              x: clamp(item.x + 300, 0, Math.max(0, project.width - item.width)),
              y: clamp(item.y + 300, 0, Math.max(0, project.depth - item.depth)),
            }
            update({ items: [...project.items, copy] })
            setSelected(`item:${copy.id}`)
          }}><Copy/>Duplicate object</button>
        </>
        : zone
          ? <>
            <div className="inspector-heading"><div><span className="eyebrow">NO-GO ZONE</span><input value={zone.name} onChange={event => updateZone(zone.id, { name: event.target.value })}/></div><button className="icon-button danger" onClick={removeZone}><Trash2/></button></div>
            <div className="field-row"><Field label="X (mm)" value={zone.x} min={0} onChange={value => updateZone(zone.id, { x: value })}/><Field label="Y (mm)" value={zone.y} min={0} onChange={value => updateZone(zone.id, { y: value })}/></div>
            <div className="field-row"><Field label="Width (mm)" value={zone.width} min={1} onChange={value => updateZone(zone.id, { width: value })}/><Field label="Depth (mm)" value={zone.depth} min={1} onChange={value => updateZone(zone.id, { depth: value })}/></div>
            <p className="zone-help">Use these zones for wall jogs, posts, utility chases, stairs, or permanent floor obstructions. Equipment warnings will fire when an object footprint crosses into this area.</p>
          </>
          : <div className="empty-inspector"><CircleGauge/><h3>Select an object or zone</h3><p>Choose a machine to edit it, or pick a no-go zone to refine the usable floor shape.</p></div>}
    </div>
    {(leftOpen || rightOpen) && <div className="panel-scrim" role="presentation" onClick={() => { setLeftOpen(false); setRightOpen(false) }}/>}
    <div className="shop-fabs"><button className="panel-fab" onClick={() => { setLeftOpen(open => !open); setRightOpen(false) }} aria-label="Toggle objects panel"><Box/>Objects</button><button className="panel-fab" onClick={() => { setRightOpen(open => !open); setLeftOpen(false) }} aria-label="Toggle inspector"><SlidersHorizontal/>Inspector</button></div>
  </div>
}

function FloorGridLayer({ project }: { project: ShopProject }) {
  const { lengthUnit } = useUnitSystem()
  const xs = gridSeries(project.width, project.gridSize)
  const ys = gridSeries(project.depth, project.gridSize)
  const labelEvery = project.gridSize >= 500 ? 1 : 2

  return <svg className="floor-grid-layer" viewBox={`0 0 ${project.width} ${project.depth}`} preserveAspectRatio="none" aria-hidden="true">
    {xs.map((x, index) => <line className={index % labelEvery === 0 ? 'major' : ''} x1={x} y1={0} x2={x} y2={project.depth} key={`x-${x}`}/>)}
    {ys.map((y, index) => <line className={index % labelEvery === 0 ? 'major' : ''} x1={0} y1={y} x2={project.width} y2={y} key={`y-${y}`}/>)}
    {xs.filter((_, index) => index % labelEvery === 0 && index > 0).map(x => <text className="grid-label" x={x - 12} y={95} key={`xlabel-${x}`}>{formatLengthValue(x, lengthUnit)}</text>)}
    {ys.filter((_, index) => index % labelEvery === 0 && index > 0).map(y => <text className="grid-label" x={28} y={y - 18} key={`ylabel-${y}`}>{formatLengthValue(y, lengthUnit)}</text>)}
  </svg>
}

function BlockedZoneLayer({
  project,
  draftZone,
  selectedZoneId,
  onPointerDown,
  onKeyDown,
}: {
  project: ShopProject
  draftZone: ShopBlockedZone | null
  selectedZoneId: string
  onPointerDown: (event: ReactPointerEvent, target: ShopBlockedZone) => void
  onKeyDown: (event: ReactKeyboardEvent, target: ShopBlockedZone) => void
}) {
  return <>
    {project.blockedZones.map(blockedZone => <div key={blockedZone.id} role="button" tabIndex={0} aria-label={`${blockedZone.name}, blocked floor area`} aria-pressed={selectedZoneId === blockedZone.id} className={`blocked-zone ${selectedZoneId === blockedZone.id ? 'selected' : ''}`} onPointerDown={event => { event.stopPropagation(); onPointerDown(event, blockedZone) }} onKeyDown={event => onKeyDown(event, blockedZone)} style={{ left: blockedZone.x * SCALE, top: blockedZone.y * SCALE, width: blockedZone.width * SCALE, height: blockedZone.depth * SCALE }}>
      <span>{blockedZone.name}</span>
    </div>)}
    {draftZone && <div className="blocked-zone preview" style={{ left: draftZone.x * SCALE, top: draftZone.y * SCALE, width: draftZone.width * SCALE, height: draftZone.depth * SCALE }}><span>{DRAW_ZONE_LABEL}</span></div>}
  </>
}

function FeedClearanceLayer({ project }: { project: ShopProject }) {
  return <svg className="feed-clearance-layer" viewBox={`0 0 ${project.width} ${project.depth}`} preserveAspectRatio="none" aria-hidden="true">
    {project.items.flatMap(item => getFeedClearanceZones(item).map(zone => {
      const center = polygonCenter(zone.points)
      return <g className={`feed-zone ${zone.kind}`} key={`${item.id}-${zone.kind}`}><polygon points={pointsAttribute(zone.points)}/><text x={center.x} y={center.y}>{zone.kind === 'infeed' ? 'IN' : 'OUT'}</text></g>
    }))}
  </svg>
}

function AngledShopView({ project, selected, onSelect }: { project: ShopProject, selected: string, onSelect: (id: string) => void }) {
  const floor = projectPolygon([{ x: 0, y: 0 }, { x: project.width, y: 0 }, { x: project.width, y: project.depth }, { x: 0, y: project.depth }])
  const projectedItems = [...project.items].sort((a, b) => (a.x + a.y) - (b.x + b.y)).map(item => {
    const footprint = getShopItemFootprint(item)
    return { item, bottom: projectPolygon(footprint), top: projectPolygon(footprint, item.height) }
  })
  const feedZones = project.items.flatMap(item => getFeedClearanceZones(item).map(zone => ({ ...zone, itemId: item.id, projected: projectPolygon(zone.points) })))
  const blockedZones = project.blockedZones.map(zone => ({ zone, projected: projectPolygon(getBlockedZoneFootprint(zone)) }))
  const allPoints = [...floor, ...feedZones.flatMap(zone => zone.projected), ...blockedZones.flatMap(zone => zone.projected), ...projectedItems.flatMap(entry => [...entry.bottom, ...entry.top])]
  const bounds = getBounds(allPoints, 450)

  return <div className="angled-shop-view"><div className="angled-view-note">Angled review view · switch to Top to move objects</div><svg viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`} role="img" aria-label="Angled workshop view">
    <polygon className="iso-floor" points={pointsAttribute(floor)}/>
    {blockedZones.map(({ zone, projected }) => <polygon className={`iso-blocked-zone ${selected === `zone:${zone.id}` ? 'selected' : ''}`} points={pointsAttribute(projected)} key={zone.id}/>)}
    {feedZones.map(zone => <polygon className={`iso-feed-zone ${zone.kind}`} points={pointsAttribute(zone.projected)} key={`${zone.itemId}-${zone.kind}`}/>)}
    {projectedItems.map(({ item, bottom, top }) => <g className={`iso-object ${selected === `item:${item.id}` ? 'selected' : ''}`} role="button" tabIndex={0} aria-label={item.name} onClick={() => onSelect(`item:${item.id}`)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') onSelect(`item:${item.id}`) }} key={item.id}>
      {getBoxSides(bottom, top).map((side, index) => <polygon className="iso-side" style={{ fill: item.color }} points={pointsAttribute(side)} key={index}/>)}
      <polygon className="iso-top" style={{ fill: item.color }} points={pointsAttribute(top)}/>
      <text x={projectIsometric({ x: item.x + item.width / 2, y: item.y + item.depth / 2, z: item.height }).x} y={projectIsometric({ x: item.x + item.width / 2, y: item.y + item.depth / 2, z: item.height }).y}>{item.name}</text>
    </g>)}
  </svg></div>
}

function getBlockedZoneConflicts(project: ShopProject) {
  return project.items.map(item => ({
    item,
    zones: project.blockedZones.filter(zone => polygonsOverlap(getShopItemFootprint(item), getBlockedZoneFootprint(zone))),
  })).filter(conflict => conflict.zones.length > 0)
}

function zoneFromPoints(start: Point2D, end: Point2D): ShopBlockedZone {
  return {
    id: 'draft',
    name: DRAW_ZONE_LABEL,
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.max(1, Math.abs(end.x - start.x)),
    depth: Math.max(1, Math.abs(end.y - start.y)),
  }
}

function fitZoneToRoom(zone: ShopBlockedZone, room: Pick<ShopProject, 'width' | 'depth'>): ShopBlockedZone {
  const width = clamp(zone.width, 1, room.width)
  const depth = clamp(zone.depth, 1, room.depth)
  return {
    ...zone,
    width,
    depth,
    x: clamp(zone.x, 0, Math.max(0, room.width - width)),
    y: clamp(zone.y, 0, Math.max(0, room.depth - depth)),
  }
}

function getCanvasPoint(clientX: number, clientY: number, canvas: HTMLDivElement | null, zoom: number, project: ShopProject): Point2D | null {
  if (!canvas) return null
  const bounds = canvas.getBoundingClientRect()
  const x = clamp((clientX - bounds.left) / zoom / SCALE, 0, project.width)
  const y = clamp((clientY - bounds.top) / zoom / SCALE, 0, project.depth)
  return { x, y }
}

function useLiveRef<T>(value: T) {
  const ref = useRef(value)
  useEffect(() => { ref.current = value }, [value])
  return ref
}

function gridSeries(size: number, step: number) {
  const values: number[] = []
  for (let value = 0; value <= size; value += step) values.push(value)
  if (values.at(-1) !== size) values.push(size)
  return values
}

function polygonCenter(points: readonly Point2D[]): Point2D {
  return { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length }
}

function getBoxSides(
  bottom: [Point2D, Point2D, Point2D, Point2D],
  top: [Point2D, Point2D, Point2D, Point2D],
): Array<[Point2D, Point2D, Point2D, Point2D]> {
  return [
    [bottom[0], bottom[1], top[1], top[0]],
    [bottom[1], bottom[2], top[2], top[1]],
    [bottom[2], bottom[3], top[3], top[2]],
    [bottom[3], bottom[0], top[0], top[3]],
  ]
}

function getBounds(points: readonly Point2D[], padding: number) {
  const xs = points.map(point => point.x)
  const ys = points.map(point => point.y)
  const minX = Math.min(...xs) - padding
  const maxX = Math.max(...xs) + padding
  const minY = Math.min(...ys) - padding
  const maxY = Math.max(...ys) + padding
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function ObjectIcon({ kind }: { kind: ShopItemKind }) { return kind === 'door' ? <DoorOpen/> : kind === 'storage' ? <Warehouse/> : <Box/> }
function TextField({ label, value, onChange }: { label: string, value: string, onChange: (value: string) => void }) { return <label className="field"><span>{label}</span><input value={value} onChange={event => onChange(event.target.value)}/></label> }
function KindField({ value, onChange }: { value: ShopItemKind, onChange: (value: ShopItemKind) => void }) { return <label className="field"><span>Category</span><select value={value} onChange={event => onChange(event.target.value as ShopItemKind)}>{SHOP_ITEM_KINDS.map(kind => <option value={kind.value} key={kind.value}>{kind.label}</option>)}</select></label> }
function ColorField({ value, onChange }: { value: string, onChange: (value: string) => void }) { return <label className="field color-field"><span>Color</span><input type="color" value={value} onChange={event => onChange(event.target.value)}/></label> }
function Empty({ title, action }: { title: string, action: () => void }) { return <div className="empty-page"><h2>{title}</h2><button className="button" onClick={action}><Plus/>Create one</button></div> }
function clamp(n: number, min: number, max: number) { return Math.min(Math.max(n, min), max) }
