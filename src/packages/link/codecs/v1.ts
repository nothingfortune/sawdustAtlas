import { TOO_LARGE_ERROR } from '../../share/config'
import { base64UrlToBytes, bytesToBase64Url } from '../base64url'
import type { LinkCodec } from '../codec'
import { LINK_DAMAGED_ERROR } from '../errors'

function streamOf(bytes: Uint8Array<ArrayBuffer>): ReadableStream<Uint8Array<ArrayBuffer>> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

// Reads chunk by chunk and cancels past the cap, so a tiny payload cannot inflate into memory exhaustion.
async function inflate(bytes: Uint8Array<ArrayBuffer>, maxBytes: number): Promise<Uint8Array<ArrayBuffer> | 'too-large' | 'damaged'> {
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    // Built inside the try so a browser without deflate-raw maps to 'damaged' instead of rejecting.
    const reader = streamOf(bytes).pipeThrough(new DecompressionStream('deflate-raw')).getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        return 'too-large'
      }
      chunks.push(value)
    }
  } catch {
    return 'damaged'
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

/** Compact JSON, deflate-raw, base64url. */
export const v1Codec: LinkCodec = {
  version: 'v1',
  async encode(value) {
    const input = new TextEncoder().encode(JSON.stringify(value))
    const compressed = await new Response(streamOf(input).pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()
    return bytesToBase64Url(new Uint8Array(compressed))
  },
  async decode(payload, limits) {
    const bytes = base64UrlToBytes(payload)
    if (!bytes || bytes.length === 0) return { ok: false, error: LINK_DAMAGED_ERROR }
    const inflated = await inflate(bytes, limits.maxDecodedBytes)
    if (inflated === 'too-large') return { ok: false, error: TOO_LARGE_ERROR }
    if (inflated === 'damaged') return { ok: false, error: LINK_DAMAGED_ERROR }
    try {
      return { ok: true, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(inflated)) as unknown }
    } catch {
      return { ok: false, error: LINK_DAMAGED_ERROR }
    }
  },
}
