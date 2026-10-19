import type { ShareTarget } from '../target'
import { fileTarget } from './file'
import { linkTarget } from './link'
import { qrTarget } from './qr'

export { fileTarget, linkTarget, qrTarget }

// The share dialog renders these in order; a new way to share (AI-003 hand-off, AI-004 attach) is one more entry.
export const SHARE_TARGETS: readonly ShareTarget[] = [fileTarget, linkTarget, qrTarget]
