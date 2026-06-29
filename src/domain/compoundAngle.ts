// BOARD-026 (3D): a general compound-angle calculator. Given two perpendicular-view tilts
// (e.g. the front- and side-view tilt of a splayed leg), return the combined tilt off
// square and the saw settings — miter (= tiltA) and bevel (blade tilt). Convention: the
// object is tilted tiltA then tiltB (rigid rotation); see the design doc for the derivation.
// General-purpose: nothing leg-specific.

const RAD = Math.PI / 180
const deg = (radians: number) => radians * 180 / Math.PI
const clampTilt = (value: number) => Math.min(85, Math.max(0, Number.isFinite(value) ? value : 0))

export interface CompoundAngleInput { tiltADeg: number; tiltBDeg: number; riseMm?: number }
export interface CompoundAngleResult {
  miterDeg: number
  bevelDeg: number
  resultantTiltDeg: number
  trueLengthMm?: number
}

export function solveCompoundAngle(input: CompoundAngleInput): CompoundAngleResult {
  const a = clampTilt(input.tiltADeg)
  const b = clampTilt(input.tiltBDeg)
  const miterDeg = a
  const bevelDeg = deg(Math.atan(Math.tan(b * RAD) / Math.cos(a * RAD)))
  const resultantTiltDeg = deg(Math.acos(Math.cos(a * RAD) * Math.cos(b * RAD)))
  const base: CompoundAngleResult = { miterDeg, bevelDeg, resultantTiltDeg }
  return input.riseMm !== undefined && input.riseMm > 0
    ? { ...base, trueLengthMm: input.riseMm / Math.cos(resultantTiltDeg * RAD) }
    : base
}
