import { readProjectPackage } from '../envelope'
import type { PackageReadResult } from '../envelope'

/** What a decoded link asks the app to do; one member per registered intent. */
export type IntentOutcome = { intent: 'share'; read: PackageReadResult }

export interface LinkIntent {
  /** The fragment name before "=", e.g. "share". */
  readonly name: string
  resolve(value: unknown): IntentOutcome
}

export const shareIntent: LinkIntent = {
  name: 'share',
  resolve(value) {
    return { intent: 'share', read: readProjectPackage(value) }
  },
}

// One entry per fragment name; AI-005's "template" intent is one more entry and one more IntentOutcome member.
export const LINK_INTENTS: readonly LinkIntent[] = [shareIntent]
