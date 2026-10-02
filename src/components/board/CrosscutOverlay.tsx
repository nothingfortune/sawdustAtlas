import type { BoardProject } from '../../types'
import type { EndGrainMetrics } from '../../domain/boardGeometry'
import { crosscutOverlaySegments } from '../../domain/boardGeometry'

// Crosscut markers drawn in mm over the glue-up: trim, slice cut lines, kerf
// waste between slices, and the offcut. Pure presentation — the layout math
// (trim-at-each-end convention, positions) lives in crosscutOverlaySegments.
export function CrosscutOverlay({ project, metrics, heightMm, pxPerMm }: { project: BoardProject; metrics: EndGrainMetrics; heightMm: number; pxPerMm: number }) {
  const { trimBand, kerf, used, offcut, cutLines, kerfBands } = crosscutOverlaySegments(project.endGrain, metrics)
  return <g className="crosscut-overlay">
    {trimBand > 0 && <WasteBand x={0} width={trimBand} height={heightMm} pxPerMm={pxPerMm} label="TRIM"/>}
    {kerf > 0 && kerfBands.map((x, index) => <rect key={index} className="kerf-band" x={x} y={0} width={kerf} height={heightMm}/>)}
    {cutLines.map((x, index) => <line key={`cut-${index}`} className="cut-line" x1={x} y1={0} x2={x} y2={heightMm} vectorEffect="non-scaling-stroke"/>)}
    {offcut > 0.5 && <WasteBand x={used} width={offcut} height={heightMm} pxPerMm={pxPerMm} label="OFFCUT"/>}
  </g>
}

function WasteBand({ x, width, height, pxPerMm, label }: { x: number; width: number; height: number; pxPerMm: number; label: string }) {
  const cx = x + width / 2
  const cy = height / 2
  return <g className="waste-band">
    <rect x={x} y={0} width={width} height={height}/>
    <g transform={`translate(${cx} ${cy}) scale(${1 / pxPerMm}) rotate(-90)`}><text textAnchor="middle" dominantBaseline="middle">{label}</text></g>
  </g>
}
