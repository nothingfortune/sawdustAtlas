// Shared scale + ruler math for the to-scale board previews.
// Pure functions (no React) so the previews can all draw at one consistent
// px-per-mm and so rulers/scale-bars are derived, never hand-tuned.

export interface ScaleResult {
  /** Resolved pixels per millimetre to draw at. */
  pxPerMm: number
  /** True when the board is longer than the container even at the minimum scale (parent should scroll-x). */
  fitToWidth: boolean
  /** Width in px the board occupies at the resolved scale. */
  contentWidthPx: number
}

export interface ScaleOptions {
  /** Preferred scale when the board comfortably fits. */
  targetPxPerMm?: number
  /** Floor scale; below this we stop shrinking and scroll instead. */
  minPxPerMm?: number
  /** Ceiling scale so tiny boards don't render absurdly large. */
  maxPxPerMm?: number
}

const DEFAULT_TARGET = 0.7
const DEFAULT_MIN = 0.16
const DEFAULT_MAX = 2

// "Nice" millimetre increments used for ruler ticks and the scale bar.
const NICE_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000] as const

/**
 * Pick one px-per-mm so the governing board length fits the container when it
 * reasonably can, otherwise clamp to a readable range and let the caller scroll.
 * Callers pass the LONGEST length they will draw so every preview can share the
 * returned scale and stay visually comparable.
 */
export function resolveScale(boardLengthMm: number, containerWidthPx: number, opts: ScaleOptions = {}): ScaleResult {
  const target = opts.targetPxPerMm ?? DEFAULT_TARGET
  const min = opts.minPxPerMm ?? DEFAULT_MIN
  const max = opts.maxPxPerMm ?? DEFAULT_MAX
  if (!(boardLengthMm > 0) || !(containerWidthPx > 0)) {
    return { pxPerMm: clamp(target, min, max), fitToWidth: false, contentWidthPx: 0 }
  }
  const fitScale = containerWidthPx / boardLengthMm
  const pxPerMm = clamp(Math.min(target, fitScale), min, max)
  const contentWidthPx = boardLengthMm * pxPerMm
  return { pxPerMm, fitToWidth: contentWidthPx > containerWidthPx + 0.5, contentWidthPx }
}

export interface FitOptions {
  /** Ceiling scale so tiny pieces don't render absurdly large. */
  maxPxPerMm?: number
  /** Floor scale. */
  minPxPerMm?: number
  /** Horizontal chrome (gutters + padding) to reserve, in px. */
  padX?: number
  /** Vertical chrome (gutters + scale bar + padding) to reserve, in px. */
  padY?: number
  /** Fallback scale when the box hasn't been measured yet. */
  fallbackPxPerMm?: number
}

/**
 * Pick a px-per-mm that makes a piece FILL its box on both axes, preserving
 * aspect ratio. Unlike resolveScale (which keeps every preview at one shared
 * true-to-scale factor), this is for the floating studio / pop-out where the
 * goal is "see the design as large as it fits", so long-narrow pieces (a single
 * wafer, a thin glue-up) stop rendering as slivers.
 */
export function fitPxPerMm(contentWidthMm: number, contentHeightMm: number, boxWidthPx: number, boxHeightPx: number, opts: FitOptions = {}): number {
  const max = opts.maxPxPerMm ?? 6
  const min = opts.minPxPerMm ?? 0.02
  const padX = opts.padX ?? 24
  const padY = opts.padY ?? 24
  if (!(contentWidthMm > 0) || !(contentHeightMm > 0) || !(boxWidthPx > 0) || !(boxHeightPx > 0)) {
    return clamp(opts.fallbackPxPerMm ?? DEFAULT_TARGET, min, max)
  }
  const availW = Math.max(boxWidthPx - padX, 16)
  const availH = Math.max(boxHeightPx - padY, 16)
  return clamp(Math.min(availW / contentWidthMm, availH / contentHeightMm), min, max)
}

/** Smallest nice mm step whose on-screen spacing is at least minLabelSpacingPx. */
export function niceTickStep(pxPerMm: number, minLabelSpacingPx = 64): number {
  if (!(pxPerMm > 0)) return 10
  const minStepMm = minLabelSpacingPx / pxPerMm
  return NICE_STEPS.find(step => step >= minStepMm) ?? NICE_STEPS[NICE_STEPS.length - 1] ?? 1000
}

/** Tick positions in mm: every step from 0, plus the exact end length. */
export function buildTicks(lengthMm: number, step: number): number[] {
  if (!(lengthMm > 0) || !(step > 0)) return [0]
  const ticks: number[] = []
  const count = Math.floor(lengthMm / step + 1e-6)
  for (let i = 0; i <= count; i += 1) ticks.push(round(i * step))
  const last = ticks[ticks.length - 1] ?? 0
  if (lengthMm - last > step * 1e-6) ticks.push(round(lengthMm))
  return ticks
}

/** Largest nice mm value whose drawn length fits within maxBarPx, for the scale bar. */
export function scaleBarValue(pxPerMm: number, maxBarPx = 120): { mm: number; px: number } {
  if (!(pxPerMm > 0)) return { mm: 0, px: 0 }
  const fitting = NICE_STEPS.filter(step => step * pxPerMm <= maxBarPx)
  const mm = fitting.length ? Math.max(...fitting) : (NICE_STEPS[0] ?? 1)
  return { mm, px: mm * pxPerMm }
}

function clamp(value: number, min: number, max: number) { return Math.min(Math.max(value, min), max) }
function round(value: number) { return Math.round(value * 1e6) / 1e6 }
