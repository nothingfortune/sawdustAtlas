import { Canvas, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BackSide, BoxGeometry, BufferGeometry, EdgesGeometry, Raycaster, TOUCH, Vector2, Vector3 } from 'three'
import type { LineSegments, PerspectiveCamera } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { ExplodeOffsets } from '../../domain/furniture/projection'
import type { Axis, Box, ResolvedPart } from '../../domain/furniture/types'
import type { CameraPose } from '../../domain/instructions/types'
import { axisVector, boundsRadius, boxToThree, clipPlanes, closestLineParameter, fitPose, millimetersPerPixel, partsBounds } from './sceneMapping'

// The interactive 3D viewport. This module is the lazy chunk: it is the only place
// that imports three.js, and FurnitureViewport.tsx loads it with React.lazy. It is
// optional (print, the bench, and every editing action work without it) and uses no
// eval, blob workers, or remote assets, so the CSP stays script-src 'self'.
//
// The scene is in millimeters. The domain is z-up and three.js is y-up; sceneMapping.ts
// converts explicitly, so no part of this file reasons about the swap.

/** Dragging a selected part along one axis. The viewport reads positions and reports
 *  the result; whether and where a part may go is decided by the caller. */
export interface PartDrag {
  axis: Axis
  /** Why this part cannot be dragged along the axis, or null when it can. */
  blocker: (partId: string) => string | null
  /** The coordinate to use for the part's min edge, given where the pointer put it and
   *  how many millimeters a snap may reach (a few pixels at the part's distance). */
  snap: (partId: string, proposed: number, tolerance: number) => number
  /** Called once, on release, with the final coordinate. A drag never resizes. */
  onMove: (partId: string, value: number) => void
  /** Called when the press lands on a selected part whose axis is not draggable. */
  onBlocked: (partId: string) => void
}

export interface FurnitureViewportProps {
  parts: readonly ResolvedPart[]
  explodeOffsets?: ExplodeOffsets | undefined
  selectedIds?: readonly string[] | undefined
  highlightIds?: readonly string[] | undefined
  /** Transparent with dashed edges, and not pickable so it never blocks the parts behind it. */
  ghostIds?: readonly string[] | undefined
  /** Red wireframe overlay (diagonals across every face) plus red edges. */
  errorIds?: readonly string[] | undefined
  /** Click or tap. `additive` is true for Shift, Ctrl, or Cmd. */
  onSelect?: ((partId: string, additive: boolean) => void) | undefined
  /** Drag a selected part along an axis. Without it parts are only selectable. */
  drag?: PartDrag | undefined
  /** Called when the GL context is lost, so the wrapper can fall back. */
  onFailure?: (() => void) | undefined
  className?: string | undefined
}

const FOV = 40
const EDGE_COLOR = '#2b332d'
const SELECT_COLOR = '#c96f32'
const HIGHLIGHT_COLOR = '#233b2d'
const ERROR_COLOR = '#a32d1b'
const GHOST_OPACITY = 0.25
const GUIDE_COLOR = '#2f6f8f'
/** A snap reaches this many pixels; a press that moves less than DRAG_SLOP is a click. */
const SNAP_PX = 8
const DRAG_SLOP_PX = 4

interface PartState { selected: boolean; highlight: boolean; ghost: boolean; error: boolean }

interface PartMeshProps {
  id: string
  color: string
  box: Box
  state: PartState
  /** Outline and dash scale, mm, from the size of the whole piece. */
  unit: number
  /** Direction (three coordinates) and length of the axis guide drawn through a part that can be dragged. */
  guide: { direction: [number, number, number]; length: number } | null
  onSelect: ((partId: string, additive: boolean) => void) | undefined
  onPress: ((partId: string, event: ThreeEvent<PointerEvent>) => void) | undefined
}

const ignoreRaycast = () => undefined

function PartMesh({ id, color, box, state, unit, guide, onSelect, onPress }: PartMeshProps) {
  const { center, size } = boxToThree(box)
  const [sx, sy, sz] = size
  const edges = useMemo(() => new EdgesGeometry(new BoxGeometry(sx, sy, sz)), [sx, sy, sz])
  useEffect(() => () => edges.dispose(), [edges])
  const dashed = useRef<LineSegments>(null)
  // Dashes need cumulative line distances, which three computes on demand.
  useEffect(() => { if (state.ghost) dashed.current?.computeLineDistances() }, [state.ghost, edges])

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (!onSelect) return
    event.stopPropagation()
    const native = event.nativeEvent
    onSelect(id, native.shiftKey || native.ctrlKey || native.metaKey)
  }
  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!onPress || !state.selected || event.nativeEvent.button !== 0) return
    onPress(id, event)
  }
  const guideGeometry = useMemo(() => {
    if (!guide) return null
    const half = guide.length / 2
    return new BufferGeometry().setFromPoints([new Vector3(...guide.direction).multiplyScalar(-half), new Vector3(...guide.direction).multiplyScalar(half)])
  }, [guide])
  useEffect(() => () => guideGeometry?.dispose(), [guideGeometry])
  const grown = (amount: number): [number, number, number] => [sx + amount * 2, sy + amount * 2, sz + amount * 2]
  const emissive = state.selected ? SELECT_COLOR : state.highlight ? HIGHLIGHT_COLOR : '#000000'

  return <group position={center}>
    <mesh onClick={handleClick} onPointerDown={handlePointerDown} {...(state.ghost ? { raycast: ignoreRaycast } : {})}>
      <boxGeometry args={size}/>
      {/* The polygon offset keeps coplanar faces from fighting the edge lines. */}
      <meshStandardMaterial color={color} roughness={0.85} metalness={0} emissive={emissive} emissiveIntensity={state.selected ? 0.45 : state.highlight ? 0.3 : 0}
        transparent={state.ghost} opacity={state.ghost ? GHOST_OPACITY : 1} depthWrite={!state.ghost} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1}/>
    </mesh>
    {state.ghost
      ? <lineSegments ref={dashed} geometry={edges}><lineDashedMaterial color={EDGE_COLOR} dashSize={unit * 3} gapSize={unit * 2}/></lineSegments>
      : <lineSegments geometry={edges}><lineBasicMaterial color={state.error ? ERROR_COLOR : EDGE_COLOR}/></lineSegments>}
    {/* An inflated back-face copy reads as a heavy outline; WebGL lines are one pixel. */}
    {state.selected && <mesh raycast={ignoreRaycast}><boxGeometry args={grown(unit * 2.5)}/><meshBasicMaterial color={SELECT_COLOR} side={BackSide}/></mesh>}
    {state.highlight && !state.selected && <mesh raycast={ignoreRaycast}><boxGeometry args={grown(unit * 1.2)}/><meshBasicMaterial color={HIGHLIGHT_COLOR} side={BackSide}/></mesh>}
    {guideGeometry && <lineSegments geometry={guideGeometry} raycast={ignoreRaycast}><lineBasicMaterial color={GUIDE_COLOR} depthTest={false}/></lineSegments>}
    {state.error && <mesh raycast={ignoreRaycast}><boxGeometry args={grown(unit * 0.3)}/><meshBasicMaterial color={ERROR_COLOR} wireframe/></mesh>}
  </group>
}

function applyPose(camera: PerspectiveCamera, controls: OrbitControls, pose: CameraPose, bounds: Box) {
  const { near, far } = clipPlanes(bounds)
  camera.near = near
  camera.far = far
  camera.up.set(0, 1, 0)
  camera.position.set(...pose.position)
  camera.updateProjectionMatrix()
  controls.target.set(...pose.target)
  controls.minDistance = boundsRadius(bounds) * 0.4
  controls.maxDistance = boundsRadius(bounds) * 12
  controls.update()
}

/** Orbit, zoom, and pan, wired through useThree. The camera is fitted to the bounds once,
 *  when the first parts arrive; remount the viewport (a React key) to fit again. With
 *  frameloop "demand" the controls ask for a frame on every change, and damping stays
 *  off because it would need continuous frames. Returns a switch for the controls, which
 *  step aside while a part is dragged. */
function useOrbit(bounds: Box | null): (enabled: boolean) => void {
  const camera = useThree(state => state.camera) as PerspectiveCamera
  const element = useThree(state => state.gl.domElement)
  const invalidate = useThree(state => state.invalidate)
  const aspect = useThree(state => state.size.width / Math.max(state.size.height, 1))
  const controls = useRef<OrbitControls | null>(null)
  const fitted = useRef(false)

  useEffect(() => {
    const orbit = new OrbitControls(camera, element)
    orbit.enableDamping = false
    // One finger rotates, two fingers pinch to zoom and drag to pan.
    orbit.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }
    const redraw = () => invalidate()
    orbit.addEventListener('change', redraw)
    controls.current = orbit
    return () => {
      orbit.removeEventListener('change', redraw)
      orbit.dispose()
      controls.current = null
      fitted.current = false
    }
  }, [camera, element, invalidate])

  useEffect(() => {
    const orbit = controls.current
    if (fitted.current || !orbit || !bounds) return
    applyPose(camera, orbit, fitPose(bounds, FOV, aspect), bounds)
    fitted.current = true
    invalidate()
  }, [bounds, aspect, camera, invalidate])

  return useCallback((enabled: boolean) => { if (controls.current) controls.current.enabled = enabled }, [])
}

interface DragPreview { id: string; axis: Axis; value: number }

/** Press-drag-release on a selected part, along `drag.axis`. The pointer is turned into a
 *  distance along the axis line through the part (the point of that line nearest the
 *  pointer's ray), so the part follows the pointer without jumping. The live position
 *  is a preview; only the release commits. */
function useAxisDrag(drag: PartDrag | undefined, boxes: ReadonlyMap<string, Box>, setOrbit: (enabled: boolean) => void, setPreview: (preview: DragPreview | null) => void) {
  const camera = useThree(state => state.camera) as PerspectiveCamera
  const element = useThree(state => state.gl.domElement)
  const stopActive = useRef<(() => void) | null>(null)
  useEffect(() => () => stopActive.current?.(), [])

  return useCallback((id: string, event: ThreeEvent<PointerEvent>) => {
    const box = boxes.get(id)
    if (!drag || !box) return
    if (drag.blocker(id)) {
      drag.onBlocked(id)
      return
    }
    const { axis } = drag
    const direction = axisVector(axis)
    const center = boxToThree(box).center
    const grab = closestLineParameter(event.ray.origin.toArray(), event.ray.direction.toArray(), center, direction)
    if (grab === null) return
    event.stopPropagation()
    setOrbit(false)
    const startMin = box[axis]
    const startX = event.nativeEvent.clientX
    const startY = event.nativeEvent.clientY
    const raycaster = new Raycaster()
    let moved = false
    let value = startMin

    const onMove = (move: PointerEvent) => {
      if (!moved && Math.hypot(move.clientX - startX, move.clientY - startY) < DRAG_SLOP_PX) return
      const rect = element.getBoundingClientRect()
      raycaster.setFromCamera(new Vector2(((move.clientX - rect.left) / rect.width) * 2 - 1, -(((move.clientY - rect.top) / rect.height) * 2 - 1)), camera)
      const along = closestLineParameter(raycaster.ray.origin.toArray(), raycaster.ray.direction.toArray(), center, direction)
      if (along === null) return
      moved = true
      const tolerance = millimetersPerPixel(camera.position.distanceTo(new Vector3(...center)), camera.fov, rect.height) * SNAP_PX
      value = drag.snap(id, startMin + (along - grab), tolerance)
      setPreview({ id, axis, value })
    }
    const stop = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      setOrbit(true)
      setPreview(null)
      stopActive.current = null
    }
    const onUp = () => {
      stop()
      if (moved && value !== startMin) drag.onMove(id, value)
    }
    const onCancel = () => stop()
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    stopActive.current = stop
  }, [drag, boxes, camera, element, setOrbit, setPreview])
}

type SceneProps = Pick<FurnitureViewportProps, 'parts' | 'explodeOffsets' | 'selectedIds' | 'highlightIds' | 'ghostIds' | 'errorIds' | 'drag' | 'onSelect'>

/** Everything inside the Canvas: the parts, the orbit controls, and the drag gesture. */
function Scene({ parts, explodeOffsets, selectedIds, highlightIds, ghostIds, errorIds, drag, onSelect }: SceneProps) {
  const bounds = useMemo(() => partsBounds(parts, explodeOffsets), [parts, explodeOffsets])
  const [preview, setPreview] = useState<DragPreview | null>(null)
  const placed = useMemo(() => parts.map(part => {
    const [dx, dy, dz] = explodeOffsets?.[part.id] ?? [0, 0, 0]
    const box = { ...part.box, x: part.box.x + dx, y: part.box.y + dy, z: part.box.z + dz }
    // The live position of a part being dragged; the model changes only on release.
    if (preview?.id === part.id) box[preview.axis] = preview.value
    return { part, box }
  }), [parts, explodeOffsets, preview])
  const modelBoxes = useMemo(() => new Map(parts.map(part => [part.id, part.box])), [parts])
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const highlighted = useMemo(() => new Set(highlightIds), [highlightIds])
  const ghosted = useMemo(() => new Set(ghostIds), [ghostIds])
  const errored = useMemo(() => new Set(errorIds), [errorIds])
  const radius = bounds ? boundsRadius(bounds) : 1
  const unit = radius * 0.004
  const center = bounds ? boxToThree(bounds).center : [0, 0, 0] as const
  const guide = useMemo(() => drag ? { direction: axisVector(drag.axis), length: radius * 2.2 } : null, [drag, radius])
  const setOrbit = useOrbit(bounds)
  const press = useAxisDrag(drag, modelBoxes, setOrbit, setPreview)

  return <>
    <hemisphereLight args={['#ffffff', '#8a8578', 1.1]}/>
    <directionalLight position={[center[0] + radius * 6, center[1] + radius * 10, center[2] + radius * 8]} intensity={1.6}/>
    <gridHelper args={[radius * 8, 16, '#9a9a90', '#cfcdc2']} position={[center[0], bounds ? bounds.z : 0, center[2]]}/>
    {placed.map(({ part, box }) => <PartMesh key={part.id} id={part.id} color={part.color} box={box} unit={unit} onSelect={onSelect} onPress={drag ? press : undefined}
      guide={drag && selected.has(part.id) && selected.size === 1 ? guide : null}
      state={{ selected: selected.has(part.id), highlight: highlighted.has(part.id), ghost: ghosted.has(part.id), error: errored.has(part.id) }}/>)}
  </>
}

export default function FurnitureViewport3D({ parts, drag, onFailure, className, ...scene }: FurnitureViewportProps) {
  const dragDescription = drag ? ` Press and drag a selected part to move it along ${drag.axis.toUpperCase()}.` : ''
  return <div className={`furniture-viewport${className ? ` ${className}` : ''}`} role="img"
    aria-label={`Interactive 3D view of the furniture, ${parts.length} part${parts.length === 1 ? '' : 's'}. Drag to rotate, pinch or scroll to zoom.${dragDescription} Use the parts list to select and edit parts.`}>
    <Canvas frameloop="demand" dpr={[1, 2]} camera={{ fov: FOV, near: 1, far: 100000 }}
      onCreated={({ gl }) => gl.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); onFailure?.() })}>
      <Scene parts={parts} drag={drag} {...scene}/>
    </Canvas>
  </div>
}
