import { useId } from 'react'
import type { AssemblyCell, BoardProject } from '../../types'
import type { DeskWafer, Piece } from '../../domain/compositeBoard'
import { placedFootprint } from '../../domain/compositeBoard'
import { buildEndGrainTemplate, calculateEndGrainMetrics } from '../../domain/boardGeometry'
import { LongGrainFace } from '../board/LongGrainFace'
import { AssembledBoard } from '../board/AssembledBoard'

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

// The donor board's real top face, drawn in mm at [0..faceLength]×[0..faceWidth]:
// the long-grain strip face for an edge board, the assembled end-grain template
// for an end board. This is what makes a chevron donor produce chevron wafers.
function DonorFace({ board, piece, idPrefix }: { board: BoardProject | undefined; piece: Piece; idPrefix: string }) {
  if (!board) return <rect x={0} y={0} width={Math.max(1, piece.faceLengthMm)} height={Math.max(1, piece.faceWidthMm)} fill="#cdbfa8" />
  if (board.construction === 'end') {
    const template = buildEndGrainTemplate(board)
    const metrics = calculateEndGrainMetrics(board)
    return <AssembledBoard project={board} template={template} sliceCount={metrics.sliceCount} pxPerMm={1} labels={false} clipIdPrefix={`dn-${idPrefix}`} />
  }
  return <LongGrainFace strips={board.strips} lengthMm={Math.max(1, piece.faceLengthMm)} />
}

// One wafer: a `slice`-wide band of the donor board's real face, clipped to the
// wafer footprint, with the per-wafer rotate/flip applied about the footprint
// centre. The cut axis only chooses which way the band runs (crosscut vs rip).
export function WaferFace({ piece, cell, board }: { piece: Piece; cell: AssemblyCell; board: BoardProject | undefined }) {
  const uid = useId().replace(/:/g, '')
  const fp = placedFootprint(piece, cell)
  const natW = Math.max(0.001, piece.widthMm)
  const natH = Math.max(0.001, piece.heightMm)
  const transform =
    `translate(${fp.widthMm / 2} ${fp.heightMm / 2}) ` +
    `rotate(${cell.rotate}) ` +
    `scale(${cell.flip ? -1 : 1} 1) ` +
    `translate(${-natW / 2} ${-natH / 2})`
  // The band's origin within the donor face: crosscut shifts along X, rip along Y.
  const winX = piece.axis === 'x' ? piece.sliceOffsetMm : 0
  const winY = piece.axis === 'y' ? piece.sliceOffsetMm : 0
  const clipId = `wf-${uid}`
  return (
    <g transform={transform}>
      <clipPath id={clipId}><rect x={0} y={0} width={natW} height={natH} /></clipPath>
      <g clipPath={`url(#${clipId})`}>
        <g transform={`translate(${-winX} ${-winY})`}>
          <DonorFace board={board} piece={piece} idPrefix={uid} />
        </g>
      </g>
      <rect x={0} y={0} width={natW} height={natH} fill="none" stroke="#0003" strokeWidth={0.3} vectorEffect="non-scaling-stroke" />
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
