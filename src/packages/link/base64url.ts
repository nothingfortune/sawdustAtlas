// Spreading a whole payload into String.fromCharCode overflows the call stack past ~100 KB.
const CHUNK = 0x8000

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let start = 0; start < bytes.length; start += CHUNK) binary += String.fromCharCode(...bytes.subarray(start, start + CHUNK))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlToBytes(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  let binary: string
  try {
    binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  } catch {
    return null
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
