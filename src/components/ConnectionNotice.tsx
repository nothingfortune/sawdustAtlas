import { useEffect, useState } from 'react'
import { describeBenchCapabilities } from '../domain/benchCapabilities'
import type { BenchCapabilities } from '../domain/benchCapabilities'

const DISMISSED_KEY = 'sawdust-atlas:connection-notice-dismissed'
const TABLET_GUIDE_URL = 'https://github.com/nothingfortune/sawdustAtlas/blob/main/docs/howTo/use-on-a-tablet.md'

function detect(): BenchCapabilities {
  return describeBenchCapabilities({
    secureContext: window.isSecureContext,
    serviceWorker: 'serviceWorker' in navigator,
    wakeLock: 'wakeLock' in navigator,
    storageManager: typeof navigator.storage !== 'undefined',
  })
}

function wasDismissed(): boolean {
  try { return localStorage.getItem(DISMISSED_KEY) === '1' } catch { return false }
}

function rememberDismissed(): void {
  try { localStorage.setItem(DISMISSED_KEY, '1') } catch { /* best effort; the notice just returns next visit */ }
}

// Asks the browser to protect saved projects from automatic cleanup. Once per page load.
let persistRequested = false
function requestPersistentStorage(): void {
  if (persistRequested) return
  persistRequested = true
  try {
    void navigator.storage?.persist?.().catch(() => undefined)
  } catch { /* unsupported or blocked; non-fatal */ }
}

// Explains limited bench mode (no offline use or keep-awake) on insecure addresses, and
// on a secure one requests persistent storage once.
export function ConnectionNotice() {
  const [caps] = useState(detect)
  const [dismissed, setDismissed] = useState(wasDismissed)

  useEffect(() => {
    if (!caps.insecure) requestPersistentStorage()
  }, [caps.insecure])

  if (caps.level === 'full' || dismissed) return null
  return (
    <aside className="connection-notice" role="status" aria-label="Limited bench mode">
      <div>
        <strong>Limited bench mode.</strong>{' '}
        {caps.insecure
          ? 'Offline use and keeping the screen awake need a secure (HTTPS) address, and this one is not.'
          : 'This browser is missing some features the bench relies on.'}{' '}
        You can still design and save projects.
        <ul>{caps.missing.filter(g => g.key !== 'secureContext').map(g => <li key={g.key}>{g.message}</li>)}</ul>
        <a href={TABLET_GUIDE_URL} target="_blank" rel="noreferrer">How to set up a secure address on a tablet</a>
      </div>
      <button className="backup-button" onClick={() => { rememberDismissed(); setDismissed(true) }}>Dismiss</button>
    </aside>
  )
}
