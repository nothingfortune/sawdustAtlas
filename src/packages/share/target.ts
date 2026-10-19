import type { ProjectPackage } from '../envelope'
import type { ShareConfig } from './config'

/** What this browser offers, detected by the caller; this module never touches navigator. */
export interface ShareEnvironment {
  /** HTTPS or localhost; Web Share and the clipboard need it. */
  secureContext: boolean
  webShare: boolean
  /** The share sheet accepts this package's file. */
  webShareFiles: boolean
  clipboard: boolean
}

export interface ShareContext {
  pkg: ProjectPackage
  name: string
  fileName: string
  /** The package file's contents. */
  json: string
  /** The share link, or null when it could not be made. */
  link: string | null
  /** UTF-8 size of the value the link carries (`payloadBytes`). */
  payloadBytes: number
  config: ShareConfig
  env: ShareEnvironment
}

/** The browser side of sharing, injected so targets stay pure and testable. */
export interface ShareIO {
  shareFile(fileName: string, json: string, title: string): Promise<void>
  shareUrl(url: string, title: string): Promise<void>
  copyText(text: string): Promise<void>
  download(fileName: string, json: string): void
}

export type ShareDetail =
  | { kind: 'text'; label: string; value: string }
  | { kind: 'qr'; label: string; modules: readonly (readonly boolean[])[] }

export type ShareAvailability = { ok: true } | { ok: false; reason: string }

export interface ShareTarget {
  readonly id: string
  readonly label: string
  available(ctx: ShareContext): ShareAvailability
  /** The button label, or null when the detail alone is the way to share. */
  action(ctx: ShareContext): string | null
  detail(ctx: ShareContext): ShareDetail | null
  /** Runs the action; resolves to a short status for screen readers. */
  run(ctx: ShareContext, io: ShareIO): Promise<string>
}

export const NO_LINK_REASON = 'A link could not be made for this project. Share the file instead.'

// A short link can still inflate past the recipient's cap, so both sizes are checked.
export function linkTooBig(ctx: ShareContext, maxLength: number): boolean {
  return ctx.link !== null && (ctx.link.length > maxLength || ctx.payloadBytes > ctx.config.maxDecodedBytes)
}
