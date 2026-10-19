import type { LinkCodec } from '../codec'
import { v1Codec } from './v1'

// Every codec ever shipped stays here so old links keep opening; new links use CURRENT_CODEC.
export const LINK_CODECS: readonly LinkCodec[] = [v1Codec]
export const CURRENT_CODEC: LinkCodec = v1Codec

export function findCodec(version: string): LinkCodec | undefined {
  return LINK_CODECS.find(codec => codec.version === version)
}
