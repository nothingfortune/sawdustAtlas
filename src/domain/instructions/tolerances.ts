// Default tolerances and timing used by instruction generators until calibrated
// machine profiles exist. Every value here is an assumption: generators must label
// setup values and waits derived from it with source 'assumption' (safety guardrail
// 3), so the woodworker can see which numbers came from the design and which did not.

export interface Tolerance {
  minus: number
  plus: number
}

export const DEFAULT_TOLERANCES: Readonly<Record<'thicknessMm' | 'ripWidthMm' | 'sliceThicknessMm' | 'lengthMm' | 'angleDeg', Tolerance>> = {
  thicknessMm: { minus: 0.25, plus: 0.25 },
  ripWidthMm: { minus: 0.25, plus: 0.25 },
  sliceThicknessMm: { minus: 0.25, plus: 0.25 },
  lengthMm: { minus: 1, plus: 1 },
  angleDeg: { minus: 0.25, plus: 0.25 },
}

/** Minimum clamp time before a PVA glue-up is unclamped and worked (assumption). */
export const DEFAULT_GLUE_CLAMP_MINUTES = 45
