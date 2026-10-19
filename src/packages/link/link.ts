import type { ShareConfig } from '../share/config'
import { TOO_LARGE_ERROR } from '../share/config'
import type { DecodeResult, LinkCodec } from './codec'
import { CURRENT_CODEC, findCodec } from './codecs'
import { LINK_DAMAGED_ERROR, LINK_NEWER_CODEC_ERROR } from './errors'

export type LinkLimits = Pick<ShareConfig, 'maxIncomingFragmentLength' | 'maxDecodedBytes'>

export interface ParsedFragment {
  intent: string
  /** `<codec version>.<payload>` */
  encoded: string
}

/** Splits `#<intent>=<encoded>`; null when there is no intent name. */
export function parseFragment(hash: string): ParsedFragment | null {
  const body = hash.startsWith('#') ? hash.slice(1) : hash
  const equals = body.indexOf('=')
  return equals > 0 ? { intent: body.slice(0, equals), encoded: body.slice(equals + 1) } : null
}

/** `<baseUrl>#<intent>=<version>.<payload>`; the fragment never reaches a server. */
export async function encodeLink(intent: string, value: unknown, baseUrl: string, codec: LinkCodec = CURRENT_CODEC): Promise<string> {
  return `${baseUrl}#${intent}=${codec.version}.${await codec.encode(value)}`
}

/** UTF-8 size of the compact JSON a link carries, which is what the recipient inflates and caps. */
export function payloadBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

export async function decodeValue(encoded: string, limits: LinkLimits): Promise<DecodeResult> {
  if (encoded.length > limits.maxIncomingFragmentLength) return { ok: false, error: TOO_LARGE_ERROR }
  const dot = encoded.indexOf('.')
  const version = dot > 0 ? encoded.slice(0, dot) : ''
  if (!/^v\d+$/.test(version)) return { ok: false, error: LINK_DAMAGED_ERROR }
  const codec = findCodec(version)
  if (!codec) return { ok: false, error: LINK_NEWER_CODEC_ERROR }
  return codec.decode(encoded.slice(dot + 1), limits)
}

export async function decodeFragment(hash: string, limits: LinkLimits): Promise<{ ok: true; intent: string; value: unknown } | { ok: false; error: string }> {
  if (hash.length > limits.maxIncomingFragmentLength) return { ok: false, error: TOO_LARGE_ERROR }
  const parsed = parseFragment(hash)
  if (!parsed) return { ok: false, error: LINK_DAMAGED_ERROR }
  const decoded = await decodeValue(parsed.encoded, limits)
  return decoded.ok ? { ok: true, intent: parsed.intent, value: decoded.value } : decoded
}
