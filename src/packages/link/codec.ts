export type DecodeResult = { ok: true; value: unknown } | { ok: false; error: string }

export interface LinkCodec {
  /** The prefix before the first "." of a link payload, e.g. "v1". */
  readonly version: string
  encode(value: unknown): Promise<string>
  decode(payload: string, limits: { maxDecodedBytes: number }): Promise<DecodeResult>
}
