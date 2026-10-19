import type { ShareTarget } from '../target'

export const fileTarget: ShareTarget = {
  id: 'file',
  label: 'File',
  available() {
    return { ok: true }
  },
  action(ctx) {
    return ctx.env.webShareFiles ? 'Share file' : 'Download file'
  },
  detail() {
    return null
  },
  async run(ctx, io) {
    if (ctx.env.webShareFiles) {
      await io.shareFile(ctx.fileName, ctx.json, ctx.name)
      return 'Opened the share sheet.'
    }
    io.download(ctx.fileName, ctx.json)
    return `Downloaded ${ctx.fileName}.`
  },
}
