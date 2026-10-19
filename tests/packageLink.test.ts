import { afterEach, describe, expect, it } from 'vitest'
import { base64UrlToBytes, bytesToBase64Url } from '../src/packages/link/base64url'
import { v1Codec } from '../src/packages/link/codecs/v1'
import { LINK_DAMAGED_ERROR, LINK_NEWER_CODEC_ERROR } from '../src/packages/link/errors'
import { decodeFragment, encodeLink, parseFragment, payloadBytes } from '../src/packages/link/link'
import { PACKAGE_KINDS, buildProjectPackage, readProjectPackage } from '../src/packages'
import { SHARE_CONFIG, TOO_LARGE_ERROR, packageFileTooLarge } from '../src/packages/share/config'
import { fixedContext, FIXED_NOW } from './fixtures/context'
import { PACKAGE_KIND_FIXTURES } from './fixtures/packageKinds'

const BASE = 'https://atlas.example/'

// Deterministic, poorly compressible bytes (a linear congruential generator).
function noise(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length)
  let seed = 12345
  for (let i = 0; i < length; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0
    bytes[i] = seed >>> 24
  }
  return bytes
}

const fragmentOf = (link: string) => link.slice(BASE.length)

describe('base64url', () => {
  it('round-trips bytes, including payloads too large to spread into one call', () => {
    for (const length of [0, 1, 2, 3, 4, 1000, 300_000]) {
      const bytes = noise(length)
      const text = bytesToBase64Url(bytes)
      expect(text).toMatch(/^[A-Za-z0-9_-]*$/)
      expect(base64UrlToBytes(text)).toEqual(bytes)
    }
  })

  it('rejects text that is not base64url', () => {
    for (const bad of ['ab+c', 'ab/c', 'abc=', 'a', 'abcde', 'ab c']) expect(base64UrlToBytes(bad)).toBeNull()
  })
})

describe('share links', () => {
  it.each(PACKAGE_KINDS.map(kind => kind.type))('round-trips a %s package', async type => {
    const { data, id } = PACKAGE_KIND_FIXTURES[type]!()
    const pkg = buildProjectPackage(data, { type, id }, FIXED_NOW)!
    const link = await encodeLink('share', pkg, BASE)
    expect(link.startsWith(`${BASE}#share=v1.`)).toBe(true)
    const decoded = await decodeFragment(fragmentOf(link), SHARE_CONFIG)
    if (!decoded.ok) throw new Error(decoded.error)
    expect(decoded.intent).toBe('share')
    const read = readProjectPackage(decoded.value, fixedContext())
    expect(read.ok && read.pkg.project).toEqual(pkg.project)
  })

  it('keeps non-ASCII names intact', async () => {
    const { data, id } = PACKAGE_KIND_FIXTURES['board']!()
    const name = 'Noyer & érable, “café” 胡桃 🪵'
    const pkg = buildProjectPackage({ ...data, boards: data.boards.map(b => b.id === id ? { ...b, name } : b) }, { type: 'board', id }, FIXED_NOW)!
    const decoded = await decodeFragment(fragmentOf(await encodeLink('share', pkg, BASE)), SHARE_CONFIG)
    expect(decoded.ok && (decoded.value as { project: { board: { name: string } } }).project.board.name).toBe(name)
  })

  it('encodes a large, poorly compressible value without throwing', async () => {
    const text = Array.from(noise(400_000), byte => String.fromCharCode(97 + (byte % 26))).join('')
    await expect(v1Codec.encode(text)).resolves.toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('measures the bytes a recipient will inflate', () => {
    expect(payloadBytes({ a: 'é' })).toBe(new TextEncoder().encode('{"a":"é"}').length)
  })

  it('parses the intent and payload out of a fragment', () => {
    expect(parseFragment('#share=v1.abc')).toEqual({ intent: 'share', encoded: 'v1.abc' })
    expect(parseFragment('share=v1.a=b')).toEqual({ intent: 'share', encoded: 'v1.a=b' })
    expect(parseFragment('#share')).toBeNull()
    expect(parseFragment('#=v1.abc')).toBeNull()
  })
})

describe('decodeFragment errors', () => {
  it('reports a damaged link', async () => {
    const valid = fragmentOf(await encodeLink('share', { hello: 'world' }, BASE))
    const notJson = `#share=v1.${bytesToBase64Url(new Uint8Array(await new Response(new Blob(['not json']).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()))}`
    for (const hash of ['', '#share', '#share=nodot', '#share=x1.abc', '#share=v1.@@@@', '#share=v1.AAAA', valid.slice(0, valid.length - 6), notJson]) {
      expect(await decodeFragment(hash, SHARE_CONFIG)).toEqual({ ok: false, error: LINK_DAMAGED_ERROR })
    }
  })

  describe('without deflate-raw support', () => {
    const original = globalThis.DecompressionStream
    afterEach(() => {
      globalThis.DecompressionStream = original
    })

    it('reports a damaged link instead of rejecting', async () => {
      const valid = fragmentOf(await encodeLink('share', { hello: 'world' }, BASE))
      globalThis.DecompressionStream = class {
        constructor() {
          throw new TypeError('unsupported format')
        }
      } as unknown as typeof DecompressionStream
      expect(await decodeFragment(valid, SHARE_CONFIG)).toEqual({ ok: false, error: LINK_DAMAGED_ERROR })
    })
  })

  it('asks for a newer app on an unknown codec version', async () => {
    expect(await decodeFragment('#share=v2.abc', SHARE_CONFIG)).toEqual({ ok: false, error: LINK_NEWER_CODEC_ERROR })
  })

  it('refuses a fragment over the incoming length limit before decoding it', async () => {
    const valid = fragmentOf(await encodeLink('share', { hello: 'world' }, BASE))
    expect(await decodeFragment(valid, { ...SHARE_CONFIG, maxIncomingFragmentLength: valid.length - 1 })).toEqual({ ok: false, error: TOO_LARGE_ERROR })
    expect((await decodeFragment(valid, { ...SHARE_CONFIG, maxIncomingFragmentLength: valid.length })).ok).toBe(true)
  })

  it('cancels a small payload that inflates past the decoded-size cap', async () => {
    const bomb = fragmentOf(await encodeLink('share', 'a'.repeat(3_000_000), BASE))
    expect(bomb.length).toBeLessThan(SHARE_CONFIG.maxIncomingFragmentLength)
    expect(await decodeFragment(bomb, SHARE_CONFIG)).toEqual({ ok: false, error: TOO_LARGE_ERROR })
  })
})

describe('packageFileTooLarge', () => {
  it('allows a file at the limit and refuses one byte over', () => {
    expect(packageFileTooLarge(SHARE_CONFIG.maxPackageFileBytes)).toBe(false)
    expect(packageFileTooLarge(SHARE_CONFIG.maxPackageFileBytes + 1)).toBe(true)
  })
})
