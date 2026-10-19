import { describe, expect, it } from 'vitest'
import { buildProjectPackage, describeProject, projectPackageFileName } from '../src/packages'
import type { ProjectPackage } from '../src/packages'
import { SHARE_CONFIG } from '../src/packages/share/config'
import { qrModules } from '../src/packages/share/qr'
import type { ShareContext, ShareEnvironment, ShareIO } from '../src/packages/share/target'
import { SHARE_TARGETS, fileTarget, linkTarget, qrTarget } from '../src/packages/share/targets'
import { FIXED_NOW } from './fixtures/context'
import { PACKAGE_KIND_FIXTURES } from './fixtures/packageKinds'

const TEST_CONFIG = { ...SHARE_CONFIG, maxLinkLength: 100, maxQrLinkLength: 60 }
const NO_SHARING: ShareEnvironment = { secureContext: false, webShare: false, webShareFiles: false, clipboard: false }
const ENVIRONMENTS: ShareEnvironment[] = [
  NO_SHARING,
  { secureContext: true, webShare: false, webShareFiles: false, clipboard: true },
  { secureContext: true, webShare: true, webShareFiles: false, clipboard: true },
  { secureContext: true, webShare: true, webShareFiles: true, clipboard: true },
]

function pkg(): ProjectPackage {
  const { data, id } = PACKAGE_KIND_FIXTURES['board']!()
  return buildProjectPackage(data, { type: 'board', id }, FIXED_NOW)!
}

function context(link: string | null, env: ShareEnvironment = NO_SHARING, payloadBytes = 1000): ShareContext {
  const p = pkg()
  return { pkg: p, name: describeProject(p).name, fileName: projectPackageFileName(p), json: JSON.stringify(p, null, 2), link, payloadBytes, config: TEST_CONFIG, env }
}

function fakeIO() {
  const calls: string[] = []
  const io: ShareIO = {
    shareFile: fileName => { calls.push(`shareFile:${fileName}`); return Promise.resolve() },
    shareUrl: url => { calls.push(`shareUrl:${url}`); return Promise.resolve() },
    copyText: text => { calls.push(`copyText:${text}`); return Promise.resolve() },
    download: fileName => { calls.push(`download:${fileName}`) },
  }
  return { io, calls }
}

const link = (length: number) => 'a'.repeat(length)

describe.each(SHARE_TARGETS.map(target => [target.id, target] as const))('share target %s', (_id, target) => {
  const contexts = [null, link(10), link(60), link(61), link(100), link(101)].flatMap(l => ENVIRONMENTS.map(env => context(l, env)))

  it('gives a reason whenever it is unavailable', () => {
    for (const ctx of contexts) {
      const availability = target.available(ctx)
      if (!availability.ok) expect(availability.reason.length).toBeGreaterThan(0)
    }
  })

  it('runs its action through exactly one browser call', async () => {
    for (const ctx of contexts) {
      if (!target.available(ctx).ok || target.action(ctx) === null) continue
      const { io, calls } = fakeIO()
      await expect(target.run(ctx, io)).resolves.toEqual(expect.any(String))
      expect(calls).toHaveLength(1)
    }
  })
})

describe('file target', () => {
  it('is always available and downloads unless the share sheet takes files', async () => {
    expect(fileTarget.available(context(null))).toEqual({ ok: true })
    expect(fileTarget.action(context(null))).toBe('Download file')
    const sheet = context(null, ENVIRONMENTS[3])
    expect(fileTarget.action(sheet)).toBe('Share file')
    const { io, calls } = fakeIO()
    await fileTarget.run(context(null), io)
    expect(calls).toEqual([`download:${context(null).fileName}`])
  })
})

describe('link target', () => {
  it('is available up to maxLinkLength and not one character more', () => {
    expect(linkTarget.available(context(link(99))).ok).toBe(true)
    expect(linkTarget.available(context(link(100))).ok).toBe(true)
    expect(linkTarget.available(context(link(101)))).toEqual({ ok: false, reason: 'This project is too big for a link. Share the file instead.' })
    expect(linkTarget.available(context(null)).ok).toBe(false)
  })

  it('is unavailable when the value would inflate past the recipient cap, however short the link', () => {
    expect(linkTarget.available(context(link(10), NO_SHARING, TEST_CONFIG.maxDecodedBytes)).ok).toBe(true)
    expect(linkTarget.available(context(link(10), NO_SHARING, TEST_CONFIG.maxDecodedBytes + 1))).toEqual({ ok: false, reason: 'This project is too big for a link. Share the file instead.' })
    expect(qrTarget.available(context(link(10), NO_SHARING, TEST_CONFIG.maxDecodedBytes + 1)).ok).toBe(false)
  })

  it('offers share, then copy, then only the selectable text', async () => {
    expect(linkTarget.action(context(link(10), ENVIRONMENTS[2]))).toBe('Share link')
    expect(linkTarget.action(context(link(10), ENVIRONMENTS[1]))).toBe('Copy link')
    expect(linkTarget.action(context(link(10), NO_SHARING))).toBeNull()
    expect(linkTarget.detail(context(link(10)))).toEqual({ kind: 'text', label: 'Share link', value: link(10) })
    const { io, calls } = fakeIO()
    await expect(linkTarget.run(context(link(10), ENVIRONMENTS[1]), io)).resolves.toBe('Link copied.')
    expect(calls).toEqual([`copyText:${link(10)}`])
  })
})

describe('QR target', () => {
  it('is available up to maxQrLinkLength and not one character more', () => {
    expect(qrTarget.available(context(link(59))).ok).toBe(true)
    expect(qrTarget.available(context(link(60))).ok).toBe(true)
    expect(qrTarget.available(context(link(61)))).toEqual({ ok: false, reason: 'This project is too big for a QR code. Use the link or the file instead.' })
  })

  it('draws a square module grid', () => {
    const detail = qrTarget.detail(context(link(40)))
    if (!detail || detail.kind !== 'qr') throw new Error('expected a QR detail')
    expect(detail.modules.length).toBeGreaterThan(20)
    expect(detail.modules.every(row => row.length === detail.modules.length)).toBe(true)
  })
})

describe('qrModules', () => {
  it('fits the real QR limit in one code and refuses more than a code holds', () => {
    expect(qrModules('h'.repeat(SHARE_CONFIG.maxQrLinkLength))?.length).toBe(177)
    expect(qrModules('h'.repeat(3500))).toBeNull()
  })
})
