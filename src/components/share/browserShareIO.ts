import type { ShareEnvironment, ShareIO } from '../../packages/share/target'

const JSON_TYPE = 'application/json'

function packageFile(fileName: string, json: string): File {
  return new File([json], fileName, { type: JSON_TYPE })
}

export const browserShareIO: ShareIO = {
  async shareFile(fileName, json, title) {
    await navigator.share({ files: [packageFile(fileName, json)], title })
  },
  async shareUrl(url, title) {
    await navigator.share({ url, title })
  },
  async copyText(text) {
    await navigator.clipboard.writeText(text)
  },
  download(fileName, json) {
    const url = URL.createObjectURL(new Blob([json], { type: JSON_TYPE }))
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  },
}

export function detectShareEnvironment(fileName: string, json: string): ShareEnvironment {
  const webShare = 'share' in navigator
  let webShareFiles: boolean
  try {
    webShareFiles = webShare && 'canShare' in navigator && navigator.canShare({ files: [packageFile(fileName, json)] })
  } catch {
    webShareFiles = false
  }
  return { secureContext: window.isSecureContext, webShare, webShareFiles, clipboard: 'clipboard' in navigator }
}

/** This app's address and base path, so a link opens the same app it came from. */
export function appBaseUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href
}
