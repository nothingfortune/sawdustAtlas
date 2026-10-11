// What the bench (tablet, in the workshop) needs from the browser, and a plain-language
// description of what is missing. Pure: the caller detects the environment and passes
// booleans in, so this module never touches window or navigator.

export interface BenchCapabilityInput {
  /** window.isSecureContext: HTTPS or localhost. */
  secureContext: boolean
  /** 'serviceWorker' in navigator: needed for offline use. */
  serviceWorker: boolean
  /** 'wakeLock' in navigator: needed to keep the screen awake while building. */
  wakeLock: boolean
  /** navigator.storage is present: needed to ask the browser to keep saved data. */
  storageManager: boolean
}

export type BenchCapabilityKey = 'secureContext' | 'serviceWorker' | 'wakeLock' | 'storageManager'

export interface BenchCapabilityGap {
  key: BenchCapabilityKey
  /** Plain-language consequence for the woodworker. */
  message: string
}

export interface BenchCapabilities {
  level: 'full' | 'limited'
  /** True when the page is not a secure context (the usual, fixable cause). */
  insecure: boolean
  missing: BenchCapabilityGap[]
}

const GAPS: readonly BenchCapabilityGap[] = [
  { key: 'secureContext', message: 'This address is not secure (no HTTPS), so the browser blocks the features below.' },
  { key: 'serviceWorker', message: 'Offline use is unavailable: the app cannot be saved for use without a connection.' },
  { key: 'wakeLock', message: 'Keep-awake is unavailable: the screen may dim or lock while you build.' },
  { key: 'storageManager', message: 'The browser cannot be asked to protect your saved projects from automatic cleanup.' },
]

export function describeBenchCapabilities(input: BenchCapabilityInput): BenchCapabilities {
  const missing = GAPS.filter(gap => !input[gap.key]).map(gap => ({ ...gap }))
  return { level: missing.length === 0 ? 'full' : 'limited', insecure: !input.secureContext, missing }
}
