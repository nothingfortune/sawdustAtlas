import { describe, expect, it } from 'vitest'
import { importedCountsText } from '../src/packages'

const base = { boards: 0, composites: 0, furniture: 0, importedAsCopy: false, projectId: 'x' }

describe('importedCountsText', () => {
  it('names what was added', () => {
    expect(importedCountsText({ ...base, boards: 1 })).toBe('1 board')
    expect(importedCountsText({ ...base, boards: 2, composites: 1 })).toBe('2 boards and 1 composite')
    expect(importedCountsText({ ...base, furniture: 1 })).toBe('1 furniture project')
    expect(importedCountsText({ ...base, boards: 1, composites: 2, furniture: 3 })).toBe('1 board, 2 composites and 3 furniture projects')
    expect(importedCountsText(base)).toBe('nothing')
  })
})
