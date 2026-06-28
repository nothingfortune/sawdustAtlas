import type { BoardProject } from '../../types'
import type { EndGrainTemplate } from '../../domain/boardGeometry'
import { averageStripWidth, resolveOffsetMm } from '../../domain/boardGeometry'
import type { SliceState } from '../../domain/boardSlices'
import { EndGrainFace } from './EndGrainFace'

// One end-grain slice, with its per-slice rotate/flip and a vertical running-bond
// offset (wraps within the slice height). Drawn in mm at the slice's local origin.
export function SliceFace({ project, template, state, clipId }: { project: BoardProject; template: EndGrainTemplate; state: SliceState; clipId: string }) {
  const thickness = Math.max(project.endGrain.stockThickness, 0.001)
  const height = Math.max(template.height, 0.001)
  const transform = state.rotated && state.flipped
    ? `translate(0 ${template.height}) scale(1 -1)`
    : state.rotated
      ? `translate(${thickness} ${template.height}) rotate(180)`
      : state.flipped
        ? `translate(${thickness} 0) scale(-1 1)`
        : undefined
  // state.offset is a fraction of one cell; resolve to mm against the live strip
  // widths here so the running bond tracks edits to the strips at render time.
  const offset = resolveOffsetMm(state.offset, averageStripWidth(project.strips), height)
  const face = <g transform={transform}><EndGrainFace polygons={template.polygons}/></g>
  if (offset <= 0.01) return face
  return <g clipPath={`url(#${clipId})`}>
    <clipPath id={clipId}><rect width={thickness} height={height}/></clipPath>
    <g transform={`translate(0 ${-offset})`}>{face}</g>
    <g transform={`translate(0 ${height - offset})`}>{face}</g>
  </g>
}

// The assembled end-grain board in mm: `sliceCount` slice columns (each
// stockThickness wide) carrying their rotate/flip/offset state. Spans
// `sliceCount·stockThickness × template.height`. `labels` draws the per-slice
// R/F/N tags (the designer wants them; the composite wafer does not).
export function AssembledBoard({ project, template, sliceCount, pxPerMm, onToggleRow, labels = true, clipIdPrefix = 'assembled-slice' }: { project: BoardProject; template: EndGrainTemplate; sliceCount: number; pxPerMm: number; onToggleRow?: (index: number) => void; labels?: boolean; clipIdPrefix?: string }) {
  const thickness = Math.max(project.endGrain.stockThickness, 0.001)
  const k = 1 / pxPerMm
  return <g>{Array.from({ length: sliceCount }, (_, index) => {
    const state = {
      rotated: project.endGrain.rowRotations[index] ?? false,
      flipped: project.endGrain.rowFlips[index] ?? false,
      offset: project.endGrain.rowOffsets?.[index] ?? 0,
      sourceIndex: project.endGrain.rowOrder?.[index] ?? index,
    }
    const stateTag = `${state.rotated ? 'R' : ''}${state.flipped ? 'F' : ''}` || 'N'
    const interactive = !!onToggleRow
    return <g
      key={index}
      transform={`translate(${index * thickness} 0)`}
      className="slice"
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `Slice ${index + 1}: ${stateTag}` : undefined}
      onClick={interactive ? () => onToggleRow(index) : undefined}
      onKeyDown={interactive ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggleRow(index) } } : undefined}
    >
      <SliceFace project={project} template={template} state={state} clipId={`${clipIdPrefix}-${index}`}/>
      <rect className="slice-hit" width={thickness} height={template.height} fill="transparent"/>
      {labels && <g transform={`translate(${thickness / 2} ${template.height / 2}) scale(${k})`}><text className="slice-label" textAnchor="middle" dominantBaseline="middle">{stateTag}</text></g>}
    </g>
  })}</g>
}
