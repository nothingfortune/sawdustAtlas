import type { AssemblyCell, SourcePanel } from '../../types'
import type { Piece } from '../../domain/compositeBoard'
import { placedFootprint } from '../../domain/compositeBoard'

export function CompositePieceFace({ piece, panel, cell, pxPerMm: _pxPerMm }: {
  piece: Piece
  panel: SourcePanel | undefined
  cell: AssemblyCell
  pxPerMm: number
}) {
  const footprint = placedFootprint(piece, cell)
  const cx = footprint.widthMm / 2
  const cy = footprint.heightMm / 2
  // Rotate about center; flip horizontally when requested. Unrotated content is the
  // piece's own width x height; rotation by 90/270 is absorbed by the footprint swap.
  const flip = cell.flip ? `translate(${footprint.widthMm} 0) scale(-1 1)` : ''
  const rotate = `rotate(${cell.rotate} ${cx} ${cy})`
  const fillPrefix = panel?.construction === 'end' ? 'end' : 'long'

  let content
  if (panel && panel.kind === 'rip' && panel.strips.length > 0) {
    const totalStrip = panel.strips.reduce((acc, s) => acc + Math.max(0, s.width), 0) || 1
    const heightsAndIndices = panel.strips.map((strip, index) => {
      const h = (Math.max(0, strip.width) / totalStrip) * piece.heightMm
      const y = panel.strips.slice(0, index).reduce((sum, s) => sum + (Math.max(0, s.width) / totalStrip) * piece.heightMm, 0)
      return { strip, h, y }
    })
    content = (
      <g>
        {heightsAndIndices.map(({ strip, h, y }) => (
          <rect key={strip.id} x={0} y={y} width={piece.widthMm} height={h} fill={`url(#${fillPrefix}-${strip.speciesId})`} stroke="#0003" strokeWidth={0.3} />
        ))}
      </g>
    )
  } else {
    content = <rect x={0} y={0} width={piece.widthMm} height={piece.heightMm} fill="#cdbfa8" stroke="#0003" strokeWidth={0.3} />
  }

  return (
    <g transform={`${rotate} ${flip}`}>
      {content}
    </g>
  )
}
