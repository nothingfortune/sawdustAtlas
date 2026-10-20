import qrcode from 'qrcode-generator'

// The dialog asks twice per render (available, then detail); one cached result keeps that cheap.
let last: { text: string; modules: boolean[][] | null } | undefined

/** The QR module grid (true = dark) at the lowest error correction, or null when the text does not fit one code. */
export function qrModules(text: string): boolean[][] | null {
  if (last?.text === text) return last.modules
  let modules: boolean[][] | null
  try {
    const qr = qrcode(0, 'L')
    qr.addData(text, 'Byte')
    qr.make()
    const size = qr.getModuleCount()
    modules = Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => qr.isDark(row, col)))
  } catch {
    modules = null
  }
  last = { text, modules }
  return modules
}
