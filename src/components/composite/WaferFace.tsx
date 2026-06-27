import type { AssemblyCell } from '../../types'
import type { DeskWafer, Piece } from '../../domain/compositeBoard'
import { placedFootprint } from '../../domain/compositeBoard'

// Paint-server defs shared across every wafer SVG on the screen. SVG `url(#id)`
// references resolve document-wide, so render this once at the screen root and
// each wafer's fill resolves against it. Adds a faint hatch for trim markings.
export function CompositeDefs() {
  return (
    <pattern id="composite-trim-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" fill="#fff" fillOpacity="0.04" />
      <line x1="0" y1="0" x2="0" y2="6" stroke="#1b1b1b" strokeWidth="1.4" strokeOpacity="0.28" />
    </pattern>
  )
}

// One wafer's face drawn in mm user units, sized to fill its placed footprint.
// The face is the slice cross-section: ordered strip blocks across the natural
// width (full natural height), filled end-grain (X cut) or long-grain (Y cut).
// Rotation is about the footprint center; flip is a horizontal mirror of the face.
export function WaferFace({ piece, cell }: { piece: Piece; cell: AssemblyCell }) {
  const fp = placedFootprint(piece, cell)
  const natW = Math.max(0, piece.widthMm)
  const natH = Math.max(0, piece.heightMm)
  // Compose about the footprint center: move to center, rotate, mirror, then back
  // out by half the NATURAL face so the un-rotated face lands at its own origin.
  const transform =
    `translate(${fp.widthMm / 2} ${fp.heightMm / 2}) ` +
    `rotate(${cell.rotate}) ` +
    `scale(${cell.flip ? -1 : 1} 1) ` +
    `translate(${-natW / 2} ${-natH / 2})`
  const fillKind = piece.grain === 'end' ? 'end' : 'long'

  // Running left edges of each strip column across the natural width.
  let x = 0
  const columns = piece.strips.map((strip, i) => {
    const col = { key: i, x, w: Math.max(0, strip.widthMm), id: strip.speciesId }
    x += col.w
    return col
  })

  return (
    <g transform={transform}>
      {columns.length > 0
        ? columns.map(c => (
          <rect key={c.key} x={c.x} y={0} width={c.w} height={natH} fill={`url(#${fillKind}-${c.id})`} stroke="#0003" strokeWidth={0.3} />
        ))
        : <rect x={0} y={0} width={natW} height={natH} fill="#cdbfa8" stroke="#0003" strokeWidth={0.3} />}
    </g>
  )
}

// Faint hatch over the regions a wafer will lose to the 4-sided crop, drawn in
// the wafer's footprint coordinate space (trims already account for rotation).
export function TrimMarks({ wafer }: { wafer: DeskWafer }) {
  const { footWidthMm: w, footHeightMm: h, trimLeftMm, trimRightMm, trimTopMm, trimBottomMm } = wafer
  const fill = 'url(#composite-trim-hatch)'
  return (
    <g className="wafer-trim" pointerEvents="none">
      {trimLeftMm > 0 && <rect x={0} y={0} width={trimLeftMm} height={h} fill={fill} />}
      {trimRightMm > 0 && <rect x={w - trimRightMm} y={0} width={trimRightMm} height={h} fill={fill} />}
      {trimTopMm > 0 && <rect x={0} y={0} width={w} height={trimTopMm} fill={fill} />}
      {trimBottomMm > 0 && <rect x={0} y={h - trimBottomMm} width={w} height={trimBottomMm} fill={fill} />}
    </g>
  )
}
