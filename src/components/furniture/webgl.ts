/** The part of a canvas the detector needs; HTMLCanvasElement satisfies it. */
export interface ContextCanvas {
  getContext(contextId: string): unknown
}

/** Whether a WebGL context can be created. Takes a canvas factory so it stays pure and
 *  testable: the viewport passes `() => document.createElement('canvas')`. Some
 *  browsers throw instead of returning null when WebGL is blocked, so both count as
 *  unavailable. The probe canvas is not kept. */
export function detectWebGL(createCanvas: () => ContextCanvas): boolean {
  try {
    const canvas = createCanvas()
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}
