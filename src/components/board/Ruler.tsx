import { buildTicks, niceTickStep } from '../../domain/boardScale'

// A dimension ruler drawn in the board's mm coordinate space. Tick lines use
// non-scaling strokes (stay 1px) and labels are counter-scaled by 1/pxPerMm so
// text stays a constant on-screen size regardless of the board scale.
export function Ruler({ dimMm, pxPerMm, orientation }: { dimMm: number; pxPerMm: number; orientation: 'top' | 'left' }) {
  if (!(pxPerMm > 0) || !(dimMm > 0)) return null
  const step = niceTickStep(pxPerMm)
  const ticks = buildTicks(dimMm, step)
  const k = 1 / pxPerMm
  const tick = 5 * k
  const gap = 6 * k
  // Label every tick except one that crowds the appended end label.
  const showLabel = (index: number) => index === 0 || index === ticks.length - 1 || ((ticks[index + 1] ?? Infinity) - (ticks[index] ?? 0)) >= step * 0.5

  if (orientation === 'top') {
    return <g className="ruler">
      <line x1={0} y1={0} x2={dimMm} y2={0} vectorEffect="non-scaling-stroke"/>
      {ticks.map((value, index) => <g key={value}>
        <line x1={value} y1={0} x2={value} y2={-tick} vectorEffect="non-scaling-stroke"/>
        {showLabel(index) && <g transform={`translate(${value} ${-tick - gap}) scale(${k})`}>
          <text textAnchor={index === 0 ? 'start' : index === ticks.length - 1 ? 'end' : 'middle'}>{Math.round(value)}</text>
        </g>}
      </g>)}
    </g>
  }

  return <g className="ruler">
    <line x1={0} y1={0} x2={0} y2={dimMm} vectorEffect="non-scaling-stroke"/>
    {ticks.map((value, index) => <g key={value}>
      <line x1={0} y1={value} x2={-tick} y2={value} vectorEffect="non-scaling-stroke"/>
      {showLabel(index) && <g transform={`translate(${-tick - gap} ${value}) scale(${k})`}>
        <text textAnchor="end" dominantBaseline="middle">{Math.round(value)}</text>
      </g>}
    </g>)}
  </g>
}
