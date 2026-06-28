import { scaleBarValue } from '../../domain/boardScale'
import { formatLength } from '../../domain/lengthUnits'
import { useUnitSystem } from '../unitSystem'

// A labelled scale bar drawn in mm coordinates: a known mm length the eye can
// trust. Position it via a parent transform.
export function ScaleBar({ pxPerMm }: { pxPerMm: number }) {
  const { lengthUnit } = useUnitSystem()
  if (!(pxPerMm > 0)) return null
  const { mm } = scaleBarValue(pxPerMm, 120, lengthUnit)
  if (!(mm > 0)) return null
  const k = 1 / pxPerMm
  const cap = 3 * k
  return <g className="scale-bar">
    <line x1={0} y1={0} x2={mm} y2={0} vectorEffect="non-scaling-stroke"/>
    <line x1={0} y1={-cap} x2={0} y2={cap} vectorEffect="non-scaling-stroke"/>
    <line x1={mm} y1={-cap} x2={mm} y2={cap} vectorEffect="non-scaling-stroke"/>
    <g transform={`translate(${mm / 2} ${9 * k}) scale(${k})`}><text textAnchor="middle">{formatLength(mm, lengthUnit)}</text></g>
  </g>
}
