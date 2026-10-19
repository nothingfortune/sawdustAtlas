import { qrModules } from '../qr'
import { NO_LINK_REASON, linkTooBig } from '../target'
import type { ShareTarget } from '../target'

export const qrTarget: ShareTarget = {
  id: 'qr',
  label: 'QR code',
  available(ctx) {
    if (ctx.link === null) return { ok: false, reason: NO_LINK_REASON }
    if (linkTooBig(ctx, ctx.config.maxQrLinkLength) || !qrModules(ctx.link)) return { ok: false, reason: 'This project is too big for a QR code. Use the link or the file instead.' }
    return { ok: true }
  },
  action() {
    return null
  },
  detail(ctx) {
    const modules = ctx.link === null ? null : qrModules(ctx.link)
    return modules ? { kind: 'qr', label: 'Scan to open this project', modules } : null
  },
  run() {
    return Promise.resolve('')
  },
}
