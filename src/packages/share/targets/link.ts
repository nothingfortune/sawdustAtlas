import { NO_LINK_REASON, linkTooBig } from '../target'
import type { ShareTarget } from '../target'

export const linkTarget: ShareTarget = {
  id: 'link',
  label: 'Link',
  available(ctx) {
    if (ctx.link === null) return { ok: false, reason: NO_LINK_REASON }
    if (linkTooBig(ctx, ctx.config.maxLinkLength)) return { ok: false, reason: 'This project is too big for a link. Share the file instead.' }
    return { ok: true }
  },
  action(ctx) {
    if (ctx.env.webShare) return 'Share link'
    return ctx.env.clipboard ? 'Copy link' : null
  },
  detail(ctx) {
    return ctx.link === null ? null : { kind: 'text', label: 'Share link', value: ctx.link }
  },
  async run(ctx, io) {
    if (ctx.link === null) return ''
    if (ctx.env.webShare) {
      await io.shareUrl(ctx.link, ctx.name)
      return 'Opened the share sheet.'
    }
    await io.copyText(ctx.link)
    return 'Link copied.'
  },
}
