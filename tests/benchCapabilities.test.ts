import { describe, expect, it } from 'vitest'
import { describeBenchCapabilities } from '../src/domain/benchCapabilities'

const all = { secureContext: true, serviceWorker: true, wakeLock: true, storageManager: true }

describe('describeBenchCapabilities', () => {
  it('is full with nothing missing when everything is available', () => {
    expect(describeBenchCapabilities(all)).toEqual({ level: 'full', insecure: false, missing: [] })
  })

  it('is limited on an insecure address and names every missing feature in order', () => {
    const r = describeBenchCapabilities({ secureContext: false, serviceWorker: false, wakeLock: false, storageManager: true })
    expect(r.level).toBe('limited')
    expect(r.insecure).toBe(true)
    expect(r.missing.map(g => g.key)).toEqual(['secureContext', 'serviceWorker', 'wakeLock'])
    expect(r.missing.every(g => g.message.length > 0)).toBe(true)
  })

  it.each([
    ['serviceWorker', /offline/i],
    ['wakeLock', /awake/i],
    ['storageManager', /saved projects/i],
  ] as const)('a lone missing %s makes the level limited without flagging insecure', (key, text) => {
    const r = describeBenchCapabilities({ ...all, [key]: false })
    expect(r.level).toBe('limited')
    expect(r.insecure).toBe(false)
    expect(r.missing).toHaveLength(1)
    expect(r.missing[0]?.key).toBe(key)
    expect(r.missing[0]?.message).toMatch(text)
  })

  it('does not mutate shared state between calls', () => {
    describeBenchCapabilities({ ...all, wakeLock: false }).missing.pop()
    expect(describeBenchCapabilities({ ...all, wakeLock: false }).missing).toHaveLength(1)
    const gap = describeBenchCapabilities({ ...all, wakeLock: false }).missing[0]!
    gap.message = 'changed'
    expect(describeBenchCapabilities({ ...all, wakeLock: false }).missing[0]?.message).toMatch(/awake/i)
  })
})
