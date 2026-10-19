import { TOO_LARGE_ERROR } from '../share/config'
import type { IntentOutcome, LinkIntent } from './intents'
import { decodeValue, parseFragment } from './link'
import type { LinkLimits } from './link'

export type FragmentRoute =
  | { kind: 'none' }
  | { kind: 'ignored' }
  | { kind: 'error'; error: string }
  | { kind: 'open'; outcome: IntentOutcome }

// The intent is checked before anything is decoded, so an unrelated fragment costs nothing.
export async function routeFragment(hash: string, intents: readonly LinkIntent[], limits: LinkLimits): Promise<FragmentRoute> {
  if (hash === '' || hash === '#') return { kind: 'none' }
  const parsed = parseFragment(hash)
  const intent = parsed ? intents.find(entry => entry.name === parsed.intent) : undefined
  if (!parsed || !intent) return { kind: 'ignored' }
  if (hash.length > limits.maxIncomingFragmentLength) return { kind: 'error', error: TOO_LARGE_ERROR }
  const decoded = await decodeValue(parsed.encoded, limits)
  return decoded.ok ? { kind: 'open', outcome: intent.resolve(decoded.value) } : { kind: 'error', error: decoded.error }
}
