import { describeBenchCapabilities } from '../domain/benchCapabilities'
import type { BenchCapabilities } from '../domain/benchCapabilities'

export function detectBenchCapabilities(): BenchCapabilities {
  return describeBenchCapabilities({
    secureContext: window.isSecureContext,
    serviceWorker: 'serviceWorker' in navigator,
    wakeLock: 'wakeLock' in navigator,
    storageManager: typeof navigator.storage !== 'undefined',
  })
}
