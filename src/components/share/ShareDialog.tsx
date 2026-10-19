import { useEffect, useState } from 'react'
import { describeProject, projectPackageFileName } from '../../packages'
import type { ProjectPackage } from '../../packages'
import { encodeLink, payloadBytes } from '../../packages/link/link'
import { SHARE_CONFIG } from '../../packages/share/config'
import type { ShareContext, ShareDetail, ShareTarget } from '../../packages/share/target'
import { SHARE_TARGETS } from '../../packages/share/targets'
import { detectBenchCapabilities } from '../benchDetect'
import { useModalDialog } from '../useModalDialog'
import { appBaseUrl, browserShareIO, detectShareEnvironment } from './browserShareIO'

// Renders whatever targets are registered; it has no per-target logic.
export function ShareDialog({ pkg, onClose }: { pkg: ProjectPackage; onClose: () => void }) {
  const dialogRef = useModalDialog<HTMLDivElement>(onClose)
  const name = describeProject(pkg).name
  const [ctx, setCtx] = useState<ShareContext | null>(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    let cancelled = false
    const fileName = projectPackageFileName(pkg)
    const json = JSON.stringify(pkg, null, 2)
    const base = { pkg, name: describeProject(pkg).name, fileName, json, payloadBytes: payloadBytes(pkg), config: SHARE_CONFIG, env: detectShareEnvironment(fileName, json) }
    void encodeLink('share', pkg, appBaseUrl())
      .catch(() => null)
      .then(link => { if (!cancelled) setCtx({ ...base, link }) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [pkg])

  const run = async (target: ShareTarget, current: ShareContext) => {
    try {
      setStatus(await target.run(current, browserShareIO))
    } catch (error) {
      // Closing the share sheet rejects with AbortError; that is not a failure.
      setStatus(error instanceof DOMException && error.name === 'AbortError' ? '' : 'That did not work. Use the file instead.')
    }
  }

  return <div className="modal-scrim" role="presentation" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={dialogRef} tabIndex={-1} className="import-dialog share-dialog" role="dialog" aria-modal="true" aria-label="Share project">
      <header><strong>Share {name}</strong></header>
      {ctx === null
        ? <p role="status">Preparing…</p>
        : SHARE_TARGETS.map(target => {
          const availability = target.available(ctx)
          const action = availability.ok ? target.action(ctx) : null
          const detail = availability.ok ? target.detail(ctx) : null
          return <section key={target.id} className="share-target" aria-label={target.label}>
            <h3>{target.label}</h3>
            {availability.ok
              ? <>
                {detail && <ShareDetailView detail={detail} />}
                {action && <button type="button" className="button secondary" onClick={() => { void run(target, ctx) }}>{action}</button>}
              </>
              : <p className="share-unavailable">{availability.reason}</p>}
          </section>
        })}
      {detectBenchCapabilities().insecure && <p className="share-note">This address is not secure (no HTTPS), so the share sheet and the copy button are off. Opening SawdustAtlas over HTTPS turns them on.</p>}
      <p className="share-status" role="status" aria-live="polite">{status}</p>
      <footer><button type="button" className="button secondary" onClick={onClose}>Done</button></footer>
    </div>
  </div>
}

function ShareDetailView({ detail }: { detail: ShareDetail }) {
  if (detail.kind === 'text') {
    return <label className="share-link">{detail.label}<input readOnly value={detail.value} onFocus={event => event.currentTarget.select()} /></label>
  }
  const size = detail.modules.length
  // One path instead of a rect per module keeps a 177×177 code to a single element.
  const path = detail.modules.flatMap((row, y) => row.map((dark, x) => dark ? `M${x} ${y}h1v1h-1z` : '')).join('')
  return <svg className="share-qr" role="img" aria-label={detail.label} viewBox={`-4 -4 ${size + 8} ${size + 8}`} shapeRendering="crispEdges">
    <rect x={-4} y={-4} width={size + 8} height={size + 8} fill="#fff" />
    <path d={path} fill="#000" />
  </svg>
}
