import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BRICK_PARAMETERS,
  defaultBrickParameters,
  generateBrickAssembly,
  isLegacyBrickPreset,
  summarizeBrickAssembly,
} from '../src/domain/brickAssembly'

const params = (overrides = {}) => ({ ...DEFAULT_BRICK_PARAMETERS, ...overrides })

describe('generateBrickAssembly', () => {
  it('produces two source panels: a brick-course panel and a mortar blank', () => {
    const recipe = generateBrickAssembly(params())
    expect(recipe.sourcePanels).toHaveLength(2)
    const roles = recipe.sourcePanels.map(panel => panel.role).sort()
    expect(roles).toEqual(['brick-course', 'mortar'])
  })

  it('builds the brick-course panel by interleaving brick courses and mortar lines', () => {
    const recipe = generateBrickAssembly(params())
    const panel = recipe.sourcePanels.find(p => p.role === 'brick-course')!
    // odd-length, alternating brick / mortar / brick ... ending on a brick course
    expect(panel.courses[0]?.role).toBe('brick')
    expect(panel.courses.at(-1)?.role).toBe('brick')
    expect(panel.courses.filter(c => c.role === 'mortar').length).toBe(panel.courses.filter(c => c.role === 'brick').length - 1)
  })

  it('orders the final assembly as wafer, separator, wafer, separator, … (no borders)', () => {
    const recipe = generateBrickAssembly(params({ borders: false }))
    const kinds = recipe.finalAssembly.map(part => part.kind)
    expect(kinds[0]).toBe('wafer')
    expect(kinds.at(-1)).toBe('wafer')
    const wafers = kinds.filter(k => k === 'wafer').length
    const separators = kinds.filter(k => k === 'separator').length
    expect(separators).toBe(wafers - 1)
  })

  it('derives the alternate-strip offset from the course pitch (not hard-coded 20)', () => {
    const recipe = generateBrickAssembly(params({ brickCourseHeightMm: 50, mortarCourseThicknessMm: 10, halfCourseEdge: false }))
    const expectedOffset = (50 + 10) / 2 // coursePitch / 2 = 30
    const wafers = recipe.finalAssembly.filter(part => part.kind === 'wafer')
    expect(wafers[0]?.offsetMm).toBe(0)
    expect(wafers[1]?.offsetMm).toBe(expectedOffset)
    expect(expectedOffset).not.toBe(20)
  })

  it('adds border separators when borders are enabled', () => {
    const recipe = generateBrickAssembly(params({ borders: true }))
    const borders = recipe.finalAssembly.filter(part => part.kind === 'border')
    expect(borders).toHaveLength(2)
    expect(recipe.finalAssembly[0]?.kind).toBe('border')
    expect(recipe.finalAssembly.at(-1)?.kind).toBe('border')
  })
})

describe('summarizeBrickAssembly', () => {
  it('conserves volume: brick + mortar board-feet equal the finished board', () => {
    const summary = summarizeBrickAssembly(params())
    expect(summary.brickBoardFeet + summary.mortarBoardFeet).toBeCloseTo(summary.totalBoardFeet, 9)
    expect(summary.conservationOk).toBe(true)
  })

  it('includes mortar in the finished size and material (mortar is not free)', () => {
    const withMortar = summarizeBrickAssembly(params({ mortarSeparatorThicknessMm: 6 }))
    const noMortar = summarizeBrickAssembly(params({ mortarSeparatorThicknessMm: 0 }))
    expect(withMortar.mortarBoardFeet).toBeGreaterThan(noMortar.mortarBoardFeet)
    expect(withMortar.separatorCount).toBeGreaterThan(0)
  })

  it('reports brickStripCount-1 interior separators', () => {
    const summary = summarizeBrickAssembly(params({ borders: false }))
    expect(summary.separatorCount).toBe(Math.max(0, summary.brickStripCount - 1))
  })

  it('warns that end grain must not be planed', () => {
    const summary = summarizeBrickAssembly(params())
    expect(summary.warnings.some(w => /planer|plane/i.test(w))).toBe(true)
  })
})

const brickCourseHeightSum = (recipe: ReturnType<typeof generateBrickAssembly>): number =>
  recipe.sourcePanels.find(p => p.role === 'brick-course')!.courses.reduce((total, c) => total + c.heightMm, 0)

describe('halfCourseEdge — geometry and summary track the recipe', () => {
  it('halves the two edge courses, shortening the board by one full course height', () => {
    const full = summarizeBrickAssembly(params({ halfCourseEdge: false }))
    const half = summarizeBrickAssembly(params({ halfCourseEdge: true }))
    // Two half-height edge courses save exactly one full brick course of length.
    expect(half.assembledLengthMm).toBeCloseTo(full.assembledLengthMm - DEFAULT_BRICK_PARAMETERS.brickCourseHeightMm, 6)
  })

  it('summary assembled length matches the generated recipe course stack (both modes)', () => {
    for (const halfCourseEdge of [false, true]) {
      const p = params({ halfCourseEdge })
      expect(summarizeBrickAssembly(p).assembledLengthMm).toBeCloseTo(brickCourseHeightSum(generateBrickAssembly(p)), 6)
    }
  })

  it('reduces brick material when the edge courses are halved', () => {
    const full = summarizeBrickAssembly(params({ halfCourseEdge: false }))
    const half = summarizeBrickAssembly(params({ halfCourseEdge: true }))
    expect(half.brickBoardFeet).toBeLessThan(full.brickBoardFeet)
  })

  it('reports a conservationOk that is true when geometry matches the recipe', () => {
    expect(summarizeBrickAssembly(params({ halfCourseEdge: true })).conservationOk).toBe(true)
    expect(summarizeBrickAssembly(params({ halfCourseEdge: false })).conservationOk).toBe(true)
  })
})

describe('parameters and migration', () => {
  it('seeds editable parameters from a finished board size', () => {
    const seeded = defaultBrickParameters(450, 300, 38)
    expect(seeded.finishedLengthMm).toBe(450)
    expect(seeded.finishedWidthMm).toBe(300)
    expect(seeded.finishedThicknessMm).toBe(38)
    // a valid recipe can be generated from the seed
    expect(generateBrickAssembly(seeded).sourcePanels).toHaveLength(2)
  })

  it('recognizes the old single-panel brick preset as legacy (needs migration)', () => {
    expect(isLegacyBrickPreset('brick')).toBe(true)
    expect(isLegacyBrickPreset('chevron')).toBe(false)
  })
})
