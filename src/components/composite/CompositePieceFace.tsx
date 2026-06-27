import type { AssemblyCell } from '../../types'
import type { Piece } from '../../domain/compositeBoard'
import { placedFootprint } from '../../domain/compositeBoard'

// One crosscut wafer's end-grain face, in mm user units, sized to its placed
// footprint. The face is the board cross-section: ordered strip blocks across the
// width (each strip a full-height column), end-grain filled. Rotation is about the
// placed center; flip is a horizontal mirror.
export function CompositePieceFace({ piece, cell }: { piece: Piece; cell: AssemblyCell }) {
  const fp = placedFootprint(piece, cell)
  const cx = fp.widthMm / 2
  const cy = fp.heightMm / 2
  const flip = cell.flip ? `translate(${fp.widthMm} 0) scale(-1 1)` : ''
  const rotate = `rotate(${cell.rotate} ${cx} ${cy})`
  const columns = piece.strips.reduce<{ key: number; x: number; w: number; id: string }[]>((acc, s, i) => {
    const x = acc.length ? acc[acc.length - 1]!.x + acc[acc.length - 1]!.w : 0
    return [...acc, { key: i, x, w: s.widthMm, id: s.speciesId }]
  }, [])
  return (
    <g transform={`${rotate} ${flip}`}>
      {columns.length > 0
        ? columns.map(c => <rect key={c.key} x={c.x} y={0} width={c.w} height={piece.heightMm} fill={`url(#end-${c.id})`} stroke="#0003" strokeWidth={0.3} />)
        : <rect x={0} y={0} width={piece.widthMm} height={piece.heightMm} fill="#cdbfa8" stroke="#0003" strokeWidth={0.3} />}
    </g>
  )
}
