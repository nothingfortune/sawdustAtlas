import { describe, expect, it } from 'vitest'
import { buildProjectPackage } from '../src/packages'
import { LINK_DAMAGED_ERROR, LINK_NEWER_CODEC_ERROR } from '../src/packages/link/errors'
import { LINK_INTENTS } from '../src/packages/link/intents'
import { encodeLink } from '../src/packages/link/link'
import { routeFragment } from '../src/packages/link/router'
import { SHARE_CONFIG, TOO_LARGE_ERROR } from '../src/packages/share/config'
import { FIXED_NOW } from './fixtures/context'
import { PACKAGE_KIND_FIXTURES } from './fixtures/packageKinds'

const BASE = 'https://atlas.example/'
const route = (hash: string) => routeFragment(hash, LINK_INTENTS, SHARE_CONFIG)

describe('routeFragment', () => {
  it('does nothing without a fragment', async () => {
    expect(await route('')).toEqual({ kind: 'none' })
    expect(await route('#')).toEqual({ kind: 'none' })
  })

  it('ignores fragments that are not a registered intent, without decoding them', async () => {
    expect(await route('#section-2')).toEqual({ kind: 'ignored' })
    expect(await route('#other=v1.AAAA')).toEqual({ kind: 'ignored' })
    expect(await route(`#other=${'a'.repeat(20_000)}`)).toEqual({ kind: 'ignored' })
  })

  it('opens a shared package', async () => {
    const { data, id } = PACKAGE_KIND_FIXTURES['board']!()
    const pkg = buildProjectPackage(data, { type: 'board', id }, FIXED_NOW)!
    const result = await route((await encodeLink('share', pkg, BASE)).slice(BASE.length))
    if (result.kind !== 'open') throw new Error(`expected open, got ${result.kind}`)
    expect(result.outcome.intent).toBe('share')
    expect(result.outcome.read.ok && result.outcome.read.pkg.project).toEqual(pkg.project)
  })

  it('opens a link whose value is not a package, leaving the read error to the caller', async () => {
    const result = await route((await encodeLink('share', { hello: 1 }, BASE)).slice(BASE.length))
    if (result.kind !== 'open') throw new Error(`expected open, got ${result.kind}`)
    expect(result.outcome.read).toEqual({ ok: false, error: 'This file is not a SawdustAtlas project package.' })
  })

  it('reports damaged, newer, and oversized share links', async () => {
    expect(await route('#share=v1.@@@@')).toEqual({ kind: 'error', error: LINK_DAMAGED_ERROR })
    expect(await route('#share=v1.AAAA')).toEqual({ kind: 'error', error: LINK_DAMAGED_ERROR })
    expect(await route('#share=v2.AAAA')).toEqual({ kind: 'error', error: LINK_NEWER_CODEC_ERROR })
    expect(await route(`#share=v1.${'a'.repeat(SHARE_CONFIG.maxIncomingFragmentLength)}`)).toEqual({ kind: 'error', error: TOO_LARGE_ERROR })
  })
})
