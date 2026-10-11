import { Component, Suspense, lazy, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { FurnitureViewportProps } from './FurnitureViewport3D'
import { detectWebGL } from './webgl'

// The three.js chunk loads only when a 3D view is shown. WebGL can be missing (older
// devices, blocked or software-less browsers), the chunk can fail to load offline, and
// a context can be lost mid-session; every one of those lands on the same fallback so
// the designer never shows a blank canvas or throws.
const Viewport3D = lazy(() => import('./FurnitureViewport3D'))

export interface FurnitureViewportWrapperProps extends FurnitureViewportProps {
  /** The designer switches to the Isometric drawing. Without it the fallback has no button. */
  onFallback?: (() => void) | undefined
}

function ViewportFallback({ title, detail, onFallback }: { title: string; detail: string; onFallback: (() => void) | undefined }) {
  return <div className="furniture-viewport-fallback" role="status">
    <h3>{title}</h3>
    <p>{detail}</p>
    <p>Nothing is lost: the Front, Side, Top, Isometric, and Exploded views show the same design, and the parts list and inspector edit it.</p>
    {onFallback && <button type="button" className="button" onClick={onFallback}>Show the isometric view</button>}
  </div>
}

interface BoundaryProps { children: ReactNode; onFallback: (() => void) | undefined }

class ViewportBoundary extends Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override render() {
    if (!this.state.failed) return this.props.children
    return <ViewportFallback title="The 3D view could not start" detail="The 3D graphics code failed to load or run on this device, which can happen when the app is offline before its first full load." onFallback={this.props.onFallback}/>
  }
}

export function FurnitureViewport({ onFallback, onFailure, ...props }: FurnitureViewportWrapperProps) {
  const available = useMemo(() => detectWebGL(() => document.createElement('canvas')), [])
  const [contextLost, setContextLost] = useState(false)

  if (!available) {
    return <ViewportFallback title="3D view unavailable" detail="This browser or device cannot draw WebGL graphics, so the interactive 3D view is turned off." onFallback={onFallback}/>
  }
  if (contextLost) {
    return <ViewportFallback title="The 3D view stopped" detail="The graphics context was lost, usually because the device ran low on graphics memory." onFallback={onFallback}/>
  }
  return <ViewportBoundary onFallback={onFallback}>
    <Suspense fallback={<div className="furniture-viewport furniture-viewport-loading" role="status">Loading the 3D view…</div>}>
      <Viewport3D {...props} onFailure={() => { setContextLost(true); onFailure?.() }}/>
    </Suspense>
  </ViewportBoundary>
}
