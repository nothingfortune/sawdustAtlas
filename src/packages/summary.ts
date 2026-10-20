import type { KindMergeSummary } from './kind'
import { plural } from './shared'

/** "2 boards and 1 composite": what an import added, for the summary dialog. */
export function importedCountsText(summary: KindMergeSummary): string {
  const parts = [
    summary.boards > 0 ? plural(summary.boards, 'board') : '',
    summary.composites > 0 ? plural(summary.composites, 'composite') : '',
    summary.furniture > 0 ? plural(summary.furniture, 'furniture project') : '',
  ].filter(part => part !== '')
  if (parts.length <= 1) return parts[0] ?? 'nothing'
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1] ?? ''}`
}
