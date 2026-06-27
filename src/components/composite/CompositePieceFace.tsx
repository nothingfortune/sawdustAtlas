import type { AssemblyCell } from '../../types'
import type { Piece } from '../../domain/compositeBoard'
import { placedFootprint } from '../../domain/compositeBoard'

// One crosscut piece's face, in mm user units, sized to its placed footprint.
// Bands are the piece's species split (proportional, stable order); fill is the
// long-grain or end-grain pattern per the piece's construction. Rotation is about
// the placed center; flip is a horizontal mirror.
export function CompositePieceFace({ piece, cell }: { piece: Piece; cell: AssemblyCell }) {
  const fp = placedFootprint(piece, cell)
  const cx = fp.widthMm / 2
  const cy = fp.heightMm / 2
  const flip = cell.flip ? `translate(${fp.widthMm} 0) scale(-1 1)` : ''
  const rotate = `rotate(${cell.rotate} ${cx} ${cy})`
  const prefix = piece.construction === 'end' ? 'end' : 'long'
  const entries = Object.entries(piece.bySpecies).sort(([a], [b]) => a.localeCompare(b))
  const total = entries.reduce((sum, [, v]) => sum + v, 0) || 1
  const bands = entries.reduce<{ id: string; y: number; h: number }[]>((acc, [id, v]) => {
    const h = (v / total) * piece.heightMm
    const y = acc.length ? acc[acc.length - 1]!.y + acc[acc.length - 1]!.h : 0
    return [...acc, { id, y, h }]
  }, [])
  return (
    <g transform={`${rotate} ${flip}`}>
      {bands.length > 0
        ? bands.map(b => <rect key={b.id} x={0} y={b.y} width={piece.widthMm} height={b.h} fill={`url(#${prefix}-${b.id})`} stroke="#0003" strokeWidth={0.3} />)
        : <rect x={0} y={0} width={piece.widthMm} height={piece.heightMm} fill="#cdbfa8" stroke="#0003" strokeWidth={0.3} />}
    </g>
  )
}
