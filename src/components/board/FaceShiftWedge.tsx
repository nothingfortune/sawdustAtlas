import { formatLength } from '../../domain/lengthUnits'
import { useUnitSystem } from '../unitSystem'

// A self-contained cross-section callout showing the wedge that must be trimmed
// when angled strips leave the two outer faces unequal (faceShift). Derived
// entirely from the template's face widths — no shared coordinate space needed.
export function FaceShiftWedge({ leftFaceWidth, rightFaceWidth, finishedWidth, stockThickness }: {
  leftFaceWidth: number
  rightFaceWidth: number
  finishedWidth: number
  stockThickness: number
}) {
  const t = Math.max(1, stockThickness)
  const maxW = Math.max(leftFaceWidth, rightFaceWidth, 1)
  const shift = Math.abs(rightFaceWidth - leftFaceWidth)
  const { lengthUnit } = useUnitSystem()
  const outline = `0,0 ${t},0 ${t},${rightFaceWidth} 0,${leftFaceWidth}`
  const wedge = `0,${finishedWidth} 0,${leftFaceWidth} ${t},${rightFaceWidth} ${t},${finishedWidth}`

  return <div className="wedge-callout">
    <svg viewBox={`-1 -1 ${t + 2} ${maxW + 2}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="wedge-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="4" stroke="#b9512f" strokeWidth="1"/>
        </pattern>
      </defs>
      <polygon points={outline} fill="#d8d3c6" stroke="#1b211d" strokeWidth="0.5" vectorEffect="non-scaling-stroke"/>
      <rect x={0} y={0} width={t} height={finishedWidth} fill="#cdd6c9" opacity="0.5"/>
      <polygon points={wedge} fill="url(#wedge-hatch)" stroke="#b9512f" strokeWidth="0.6" strokeDasharray="3 2" vectorEffect="non-scaling-stroke"/>
      <line x1={0} y1={finishedWidth} x2={t} y2={finishedWidth} stroke="#7a302b" strokeWidth="0.8" strokeDasharray="3 2" vectorEffect="non-scaling-stroke"/>
    </svg>
    <span>Trim wedge <b>{formatLength(shift, lengthUnit)}</b> to square the panel to {formatLength(finishedWidth, lengthUnit)}.</span>
  </div>
}
