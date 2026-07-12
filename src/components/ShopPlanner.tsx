import { useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { AlertTriangle, Ban, Box, ChevronDown, CircleGauge, Copy, PencilRuler, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react'
import type { ShopBlockedZone, ShopItem, ShopProject } from '../types'
import { createId } from '../id'
import { NumberField as Field } from './fields'
import { createShopItem, SHOP_OBJECT_TEMPLATES } from '../domain/shopObjects'
import type { ShopObjectDefinition } from '../domain/shopObjects'
import { getBlockedZoneConflicts } from '../domain/shopGeometry'
import { formatDimensions, formatLength } from '../domain/lengthUnits'
import { useUnitSystem } from './unitSystem'
import { useShopDrag } from './useShopDrag'
import { SCALE } from './shop/constants'
import { clamp, fitZoneToRoom } from './shop/shopPlannerHelpers'
import { FloorGridLayer } from './shop/FloorGridLayer'
import { BlockedZoneLayer } from './shop/BlockedZoneLayer'
import { FeedClearanceLayer } from './shop/FeedClearanceLayer'
import { AngledShopView } from './shop/AngledShopView'
import { ObjectIcon, TextField, KindField, ColorField, Empty } from './shop/ShopFields'

interface Props { projects: ShopProject[]; project: ShopProject | undefined; onSelect: (id: string) => void; onCreate: () => void; onChange: (project: ShopProject) => void; onDelete: (id: string) => void }

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
  const [draggingId, setDraggingId] = useState<string | null>(null)
  // Live preview position for the object/zone under an active drag. The drag only
  // commits once on release (see beginItemDrag/beginZoneDrag), so during the move the
  // element follows the pointer via this local state — not per-move commitData snapshots.
  const [dragPreview, setDragPreview] = useState<{ id: string; x: number; y: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [showGrid, setShowGrid] = useState(true)
  const [viewMode, setViewMode] = useState<'top' | 'angled'>('top')
  const [drawMode, setDrawMode] = useState(false)
  const [customObject, setCustomObject] = useState<ShopObjectDefinition>(DEFAULT_CUSTOM_OBJECT)
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)
  const [draftZone, setDraftZone] = useState<ShopBlockedZone | null>(null)
  const [lastProjectId, setLastProjectId] = useState(project?.id)

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

  // Pointer-drag (items/zones), pinch-zoom, and no-go-zone-draw wiring — see
  // useShopDrag for the shared drag-commit loop this drives.
  const { canvasRef, beginItemDrag, beginZoneDrag, beginZoneDraw, onStagePointerDown, onStagePointerMove, onStagePointerEnd } = useShopDrag({
    project,
    onChange,
    update,
    zoom,
    setZoom,
    setDraggingId,
    setDragPreview,
    draftZone,
    setDraftZone,
    setSelected,
    setRightOpen,
  })

  if (!project) return <Empty title="No workshop plans yet" action={onCreate}/>

  const canvasStyle = {
    width: project.width * SCALE,
    height: project.depth * SCALE,
    transform: `scale(${zoom})`,
  } as CSSProperties

  return <div className="designer-layout">
    <div className="designer-toolbar">
      <div><span className="eyebrow">WORKSHOP PLANNER</span><div className="project-switcher"><select aria-label="Select workshop" value={project.id} onChange={event => onSelect(event.target.value)}>{projects.map(candidate => <option value={candidate.id} key={candidate.id}>{candidate.name}</option>)}</select><ChevronDown/></div></div>
      <div className="toolbar-actions"><button className={`button secondary ${drawMode ? 'active' : ''}`} onClick={() => { setDrawMode(active => !active); setSelected('') }}><PencilRuler/>{drawMode ? 'Done drawing' : 'Draw no-go zones'}</button><button className="button secondary" onClick={onCreate}><Plus/>New plan</button><button className="button secondary danger" onClick={() => onDelete(project.id)} aria-label="Delete this workshop"><Trash2/>Delete</button></div>
    </div>
    <div className={`tool-panel left-panel${leftOpen ? ' open' : ''}`}>
      <button className="drawer-close" onClick={() => setLeftOpen(false)} aria-label="Close objects panel"><X/></button>
      <div className="panel-section">
        <h3>Room size</h3>
        <div className="field-row"><Field label="Width (mm)" value={project.width} min={1000} onChange={width => resizeRoom({ width })}/><Field label="Depth (mm)" value={project.depth} min={1000} onChange={depth => resizeRoom({ depth })}/></div>
        <Field label="Grid spacing (mm)" value={project.gridSize} min={100} step={50} onChange={gridSize => resizeRoom({ gridSize })}/>
        <p className="zone-help">The floor stays rectangular. Use no-go zones to carve out alcoves, utility chases, stairs, posts, and other unusable floor area.</p>
      </div>
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
              <BlockedZoneLayer project={project} draftZone={draftZone} selectedZoneId={zone?.id ?? ''} draggingId={draggingId} dragPreview={dragPreview} onPointerDown={beginZoneDrag} onKeyDown={onZoneKeyDown}/>
              <FeedClearanceLayer project={project}/>
              {project.items.map(candidate => {
                const overlapsBlockedZone = blockedConflicts.some(conflict => conflict.item.id === candidate.id)
                const preview = dragPreview?.id === candidate.id ? dragPreview : candidate
                return <div key={candidate.id} role="button" tabIndex={0} aria-label={`${candidate.name}, ${formatDimensions([candidate.width, candidate.depth], lengthUnit)}`} aria-pressed={item?.id === candidate.id} className={`shop-object ${item?.id === candidate.id ? 'selected' : ''} ${draggingId === candidate.id ? 'dragging' : ''} ${overlapsBlockedZone ? 'warning' : ''}`} onPointerDown={event => { if (drawMode) return; event.stopPropagation(); beginItemDrag(event, candidate) }} onKeyDown={event => onObjectKeyDown(event, candidate)} style={{ left: preview.x * SCALE, top: preview.y * SCALE, width: candidate.width * SCALE, height: candidate.depth * SCALE, transform: `rotate(${candidate.rotation}deg)`, background: candidate.color }}>
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
          <div className="inspector-heading"><div><span className="eyebrow">SELECTED OBJECT</span><input aria-label="Object name" value={item.name} onChange={event => updateItem(item.id, { name: event.target.value })}/></div><button className="icon-button danger" aria-label="Delete object" onClick={removeItem}><Trash2/></button></div>
          <div className="field-row"><Field label="Width (mm)" value={item.width} min={1} onChange={value => updateItem(item.id, { width: value })}/><Field label="Depth (mm)" value={item.depth} min={1} onChange={value => updateItem(item.id, { depth: value })}/></div>
          <Field label="Height (mm)" value={item.height} min={1} onChange={value => updateItem(item.id, { height: value })}/>
          <Field label="Working clearance (mm)" value={item.clearance} onChange={value => updateItem(item.id, { clearance: value })}/>
          <KindField value={item.kind} onChange={kind => updateItem(item.id, { kind })}/>
          <ColorField value={item.color} onChange={color => updateItem(item.id, { color })}/>
          <div className="field-label">Rotation</div><div className="rotation-buttons">{[0, 90, 180, 270].map(rotation => <button className={item.rotation === rotation ? 'active' : ''} onClick={() => updateItem(item.id, { rotation })} key={rotation}>{rotation}°</button>)}</div>
          <div className="panel-section feed-settings"><h3>Infeed / outfeed</h3><p>Direction is relative to the object and follows its rotation.</p>
            <div className="feed-direction-buttons"><button className={item.feedDirection === null ? 'active' : ''} onClick={() => updateItem(item.id, { feedDirection: null })}>Off</button>{([0, 90, 180, 270] as const).map(direction => <button aria-label={`Feed ${direction === 0 ? 'right' : direction === 90 ? 'down' : direction === 180 ? 'left' : 'up'}`} className={item.feedDirection === direction ? 'active' : ''} onClick={() => updateItem(item.id, { feedDirection: direction })} key={direction}>{direction === 0 ? '→' : direction === 90 ? '↓' : direction === 180 ? '←' : '↑'}</button>)}</div>
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
            <div className="inspector-heading"><div><span className="eyebrow">NO-GO ZONE</span><input aria-label="Zone name" value={zone.name} onChange={event => updateZone(zone.id, { name: event.target.value })}/></div><button className="icon-button danger" aria-label="Delete zone" onClick={removeZone}><Trash2/></button></div>
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
