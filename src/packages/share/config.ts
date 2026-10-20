export interface ShareConfig {
  /** Longest link offered; messaging apps and mail clients truncate longer ones. */
  maxLinkLength: number
  /** Longest link drawn as a QR code (version 40-L holds 2,953 bytes). */
  maxQrLinkLength: number
  /** Longest incoming fragment read; twice the outbound limit so a later raise does not break older readers. */
  maxIncomingFragmentLength: number
  /** Most bytes a link payload may inflate to. */
  maxDecodedBytes: number
  /** Largest package file read. */
  maxPackageFileBytes: number
}

export const SHARE_CONFIG: ShareConfig = {
  maxLinkLength: 8000,
  maxQrLinkLength: 2900,
  maxIncomingFragmentLength: 16000,
  maxDecodedBytes: 1024 * 1024,
  maxPackageFileBytes: 5 * 1024 * 1024,
}

export const TOO_LARGE_ERROR = 'This share link or file is too large to be a SawdustAtlas project.'

export function packageFileTooLarge(size: number, config: Pick<ShareConfig, 'maxPackageFileBytes'> = SHARE_CONFIG): boolean {
  return size > config.maxPackageFileBytes
}
