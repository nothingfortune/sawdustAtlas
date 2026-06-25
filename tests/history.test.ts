import { describe, expect, it } from 'vitest'
import { emptyHistory, record, redo, undo } from '../src/history'

describe('undo/redo history', () => {
  it('starts empty', () => {
    expect(emptyHistory()).toEqual({ undo: [], redo: [] })
  })

  it('records a snapshot onto the undo stack and clears the redo branch', () => {
    expect(record({ undo: [], redo: ['x'] }, 'a')).toEqual({ undo: ['a'], redo: [] })
  })

  it('caps the undo stack at the limit, dropping the oldest', () => {
    let history = emptyHistory<number>()
    for (let i = 1; i <= 5; i += 1) history = record(history, i, 3)
    expect(history.undo).toEqual([3, 4, 5])
  })

  it('returns null when there is nothing to undo', () => {
    expect(undo(emptyHistory<string>(), 'now')).toBeNull()
  })

  it('returns null when there is nothing to redo', () => {
    expect(redo(emptyHistory<string>(), 'now')).toBeNull()
  })

  it('undo restores the last snapshot and moves current onto redo', () => {
    expect(undo({ undo: ['a'], redo: [] }, 'b')).toEqual({ history: { undo: [], redo: ['b'] }, restored: 'a' })
  })

  it('redo restores the last redone snapshot and moves current onto undo', () => {
    expect(redo({ undo: [], redo: ['b'] }, 'a')).toEqual({ history: { undo: ['a'], redo: [] }, restored: 'b' })
  })

  it('round-trips a record/undo/redo cycle', () => {
    const recorded = record(emptyHistory<string>(), 'a') // present b after recording a
    const undone = undo(recorded, 'b')!
    expect(undone.restored).toBe('a')
    const redone = redo(undone.history, 'a')!
    expect(redone.restored).toBe('b')
    expect(redone.history).toEqual({ undo: ['a'], redo: [] })
  })

  it('recording a new change after an undo clears the redo branch', () => {
    const undone = undo({ undo: ['a'], redo: [] }, 'b')! // history { undo: [], redo: ['b'] }
    const afterRecord = record(undone.history, 'c')
    expect(afterRecord.redo).toEqual([])
  })
})
