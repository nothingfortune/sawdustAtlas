import { useState } from 'react'
import { solveCompoundAngle } from '../domain/compoundAngle'
import { formatLength, formatNumber } from '../domain/lengthUnits'
import { LengthInput } from './fields'
import { useUnitSystem } from './unitSystem'

// BOARD-026 (3D): a general two-tilt compound-angle calculator. Tilt A / Tilt B are the
// tilts seen in two perpendicular views; outputs the combined tilt off square and the saw
// miter + bevel (and true length per a given rise). Pure math is in domain/compoundAngle.
export function CompoundAngleCalculator() {
  const { lengthUnit } = useUnitSystem()
  const [tiltA, setTiltA] = useState(6)
  const [tiltB, setTiltB] = useState(4)
  const [rise, setRise] = useState(0)
  const result = solveCompoundAngle({ tiltADeg: tiltA, tiltBDeg: tiltB, ...(rise > 0 ? { riseMm: rise } : {}) })

  return <div className="compound-calc">
    <h2>Compound angle</h2>
    <p className="geo-hint">Enter the tilt seen in two perpendicular views (for a splayed leg, its front- and side-view tilt). Tilt A is the miter-gauge angle; Tilt B drives the blade bevel. Works for any two-tilt cut — legs, hoppers, canted sides.</p>
    <div className="compound-form">
      <div className="field"><span>Tilt A °</span><input aria-label="Tilt A degrees" type="number" min={0} max={85} step={0.5} value={tiltA} onChange={event => setTiltA(Number(event.target.value))}/></div>
      <div className="field"><span>Tilt B °</span><input aria-label="Tilt B degrees" type="number" min={0} max={85} step={0.5} value={tiltB} onChange={event => setTiltB(Number(event.target.value))}/></div>
      <div className="field"><span>Rise (optional)</span><LengthInput ariaLabel="Rise" value={rise} onChange={setRise}/></div>
    </div>
    <div className="compound-results">
      <div className="compound-result-row"><span>Combined tilt off square</span><b>{formatNumber(result.resultantTiltDeg)}°</b></div>
      <div className="compound-result-row"><span>Miter (miter-gauge)</span><b>{formatNumber(result.miterDeg)}°</b></div>
      <div className="compound-result-row"><span>Bevel (blade tilt)</span><b>{formatNumber(result.bevelDeg)}°</b></div>
      {result.trueLengthMm !== undefined && <div className="compound-result-row"><span>True length</span><b>{formatLength(result.trueLengthMm, lengthUnit)}</b></div>}
    </div>
  </div>
}
