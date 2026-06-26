import { describe, expect, it } from 'vitest'
import { panelPieces } from '../src/domain/compositeBoard'
import type { RipPanel } from '../src/types'

const ripPanel = (over: Partial<RipPanel> = {}): RipPanel => ({
  id: 'A',
  name: 'Panel A',
  kind: 'rip',
  construction: 'edge',
  thicknessMm: 20,
  strips: [
    { id: 's1', speciesId: 'maple', width: 30, trailingAngle: 0 },
    { id: 's2', speciesId: 'walnut', width: 10, trailingAngle: 0 },
  ],
  crosscut: { stripWidthMm: 25, kerfMm: 3, count: 4 },
  ...over,
})

describe('panelPieces (rip panel)', () => {
  it('yields one piece per crosscut with the strip-stack cross-section', () => {
    const pieces = panelPieces(ripPanel(), new Map())
    expect(pieces).toHaveLength(4)
    expect(pieces[0]).toMatchObject({ panelId: 'A', index: 0, widthMm: 25, heightMm: 40, thicknessMm: 20 })
  })

  it('splits each piece volume by species (strip width × crosscut width × thickness)', () => {
    const [piece] = panelPieces(ripPanel(), new Map())
    expect(piece?.bySpecies).toEqual({ maple: 30 * 25 * 20, walnut: 10 * 25 * 20 })
  })
})
