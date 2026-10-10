import { describe, expect, it } from 'vitest'
import { applyLifecycleEvent } from '../src/domain/instructions/lifecycle'
import type { LifecycleEvent, ProjectLifecycle } from '../src/domain/instructions/types'

const STATES: ProjectLifecycle[] = ['draft', 'planned', 'building', 'paused', 'complete']
const EVENTS: LifecycleEvent[] = ['mark-planned', 'reopen-design', 'build-started', 'build-paused', 'build-resumed', 'build-completed', 'build-abandoned']

const VALID: Array<[ProjectLifecycle, LifecycleEvent, ProjectLifecycle]> = [
  ['draft', 'mark-planned', 'planned'],
  ['draft', 'build-started', 'building'],
  ['planned', 'build-started', 'building'],
  ['complete', 'build-started', 'building'],
  ['planned', 'reopen-design', 'draft'],
  ['complete', 'reopen-design', 'draft'],
  ['building', 'build-paused', 'paused'],
  ['paused', 'build-resumed', 'building'],
  ['building', 'build-completed', 'complete'],
  ['building', 'build-abandoned', 'planned'],
  ['paused', 'build-abandoned', 'planned'],
]

describe('applyLifecycleEvent', () => {
  it.each(VALID)('%s + %s -> %s', (from, event, to) => {
    expect(applyLifecycleEvent(from, event)).toEqual({ lifecycle: to })
  })

  it('rejects every other (state, event) pair, leaving the state unchanged with an error', () => {
    const valid = new Set(VALID.map(([from, event]) => `${from}|${event}`))
    let checked = 0
    for (const state of STATES) {
      for (const event of EVENTS) {
        if (valid.has(`${state}|${event}`)) continue
        const result = applyLifecycleEvent(state, event)
        expect(result.lifecycle).toBe(state)
        expect(result.error).toContain(event)
        expect(result.error).toContain(state)
        checked++
      }
    }
    expect(checked).toBe(STATES.length * EVENTS.length - VALID.length)
  })

  it('treats an unknown event or state as invalid instead of throwing', () => {
    expect(applyLifecycleEvent('draft', 'constructor' as LifecycleEvent)).toEqual({ lifecycle: 'draft', error: 'Cannot apply "constructor" while the project is draft.' })
    expect(applyLifecycleEvent('toString' as ProjectLifecycle, 'build-started').error).toBeDefined()
  })

  it('formats the error with the event and state', () => {
    expect(applyLifecycleEvent('complete', 'build-paused')).toEqual({ lifecycle: 'complete', error: 'Cannot apply "build-paused" while the project is complete.' })
  })
})
