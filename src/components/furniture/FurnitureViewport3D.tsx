import { Canvas, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BackSide, BoxGeometry, EdgesGeometry, TOUCH } from 'three'
import type { LineSegments, PerspectiveCamera } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { ExplodeOffsets } from '../../domain/furniture/projection'
import type { Box, ResolvedPart } from '../../domain/furniture/types'
import type { CameraPose } from '../../domain/instructions/types'
import { boundsRadius, boxToThree, clipPlanes, fitPose, partsBounds } from './sceneMapping'

// The interactive 3D viewport. This module is the lazy chunk: it is the only place
// that imports three.js, and FurnitureViewport.tsx loads it with React.lazy. It is
// optional (print, the bench, and every editing action work without it) and uses no
// eval, blob workers, or remote assets, so the CSP stays script-src 'self'.
//
// The scene is in millimeters. The domain is z-up and three.js is y-up; sceneMapping.ts
// converts explicitly, so no part of this file reasons about the swap.

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

interface PartState { selected: boolean; highlight: boolean; ghost: boolean; error: boolean }

interface PartMeshProps {
  id: string
  color: string
  box: Box
  state: PartState
  /** Outline and dash scale, mm, from the size of the whole piece. */
  unit: number
  onSelect: ((partId: string, additive: boolean) => void) | undefined
}

const ignoreRaycast = () => undefined

function PartMesh({ id, color, box, state, unit, onSelect }: PartMeshProps) {
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
  const grown = (amount: number): [number, number, number] => [sx + amount * 2, sy + amount * 2, sz + amount * 2]
  const emissive = state.selected ? SELECT_COLOR : state.highlight ? HIGHLIGHT_COLOR : '#000000'

  return <group position={center}>
    <mesh onClick={handleClick} {...(state.ghost ? { raycast: ignoreRaycast } : {})}>
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
 *  off because it would need continuous frames. */
function OrbitRig({ bounds }: { bounds: Box }) {
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
    if (fitted.current || !orbit) return
    applyPose(camera, orbit, fitPose(bounds, FOV, aspect), bounds)
    fitted.current = true
    invalidate()
  }, [bounds, aspect, camera, invalidate])

  return null
}

export default function FurnitureViewport3D({ parts, explodeOffsets, selectedIds, highlightIds, ghostIds, errorIds, onSelect, onFailure, className }: FurnitureViewportProps) {
  const bounds = useMemo(() => partsBounds(parts, explodeOffsets), [parts, explodeOffsets])
  const placed = useMemo(() => parts.map(part => {
    const [dx, dy, dz] = explodeOffsets?.[part.id] ?? [0, 0, 0]
    return { part, box: { ...part.box, x: part.box.x + dx, y: part.box.y + dy, z: part.box.z + dz } }
  }), [parts, explodeOffsets])
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const highlighted = useMemo(() => new Set(highlightIds), [highlightIds])
  const ghosted = useMemo(() => new Set(ghostIds), [ghostIds])
  const errored = useMemo(() => new Set(errorIds), [errorIds])
  const radius = bounds ? boundsRadius(bounds) : 1
  const unit = radius * 0.004
  const center = bounds ? boxToThree(bounds).center : [0, 0, 0] as const

  return <div className={`furniture-viewport${className ? ` ${className}` : ''}`} role="img"
    aria-label={`Interactive 3D view of the furniture, ${parts.length} part${parts.length === 1 ? '' : 's'}. Drag to rotate, pinch or scroll to zoom. Use the parts list to select and edit parts.`}>
    <Canvas frameloop="demand" dpr={[1, 2]} camera={{ fov: FOV, near: 1, far: 100000 }}
      onCreated={({ gl }) => gl.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); onFailure?.() })}>
      <hemisphereLight args={['#ffffff', '#8a8578', 1.1]}/>
      <directionalLight position={[center[0] + radius * 6, center[1] + radius * 10, center[2] + radius * 8]} intensity={1.6}/>
      <gridHelper args={[radius * 8, 16, '#9a9a90', '#cfcdc2']} position={[center[0], bounds ? bounds.z : 0, center[2]]}/>
      {bounds && <OrbitRig bounds={bounds}/>}
      {placed.map(({ part, box }) => <PartMesh key={part.id} id={part.id} color={part.color} box={box} unit={unit} onSelect={onSelect}
        state={{ selected: selected.has(part.id), highlight: highlighted.has(part.id), ghost: ghosted.has(part.id), error: errored.has(part.id) }}/>)}
    </Canvas>
  </div>
}
