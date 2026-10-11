import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const nginx = readFileSync('nginx.conf', 'utf8')
const headersFile = readFileSync('public/_headers', 'utf8')

type HeaderMap = Record<string, string>

/** add_header lines inside the nginx `location / { ... }` block. */
function nginxRootHeaders(): HeaderMap {
  const match = /location \/ \{([^}]*)\}/.exec(nginx)
  if (!match?.[1]) throw new Error('nginx.conf has no `location /` block')
  const out: HeaderMap = {}
  for (const m of match[1].matchAll(/add_header\s+(\S+)\s+"(.*)"(?:\s+always)?;/g)) {
    out[m[1]!.toLowerCase()] = m[2]!
  }
  return out
}

/** Parse Cloudflare Pages `_headers`: unindented path lines, indented `Name: value` lines. */
function parseHeadersFile(text: string): Record<string, HeaderMap> {
  const out: Record<string, HeaderMap> = {}
  let current: HeaderMap | null = null
  for (const raw of text.split('\n')) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue
    if (!/^\s/.test(raw)) {
      current = out[raw.trim()] = {}
      continue
    }
    const idx = raw.indexOf(':')
    if (!current || idx < 0) throw new Error(`Malformed _headers line: ${raw}`)
    current[raw.slice(0, idx).trim().toLowerCase()] = raw.slice(idx + 1).trim()
  }
  return out
}

describe('static host headers vs nginx.conf', () => {
  const nginxHeaders = nginxRootHeaders()
  const sections = parseHeadersFile(headersFile)

  it('catch-all section sets exactly the same security headers as nginx location /', () => {
    const { 'cache-control': _cache, ...nginxSecurity } = nginxHeaders
    expect(sections['/*']).toEqual(nginxSecurity)
  })

  it('keeps Cache-Control out of the catch-all, because Pages merges matching rules', () => {
    expect(sections['/*']).not.toHaveProperty('cache-control')
    expect(nginxHeaders['cache-control']).toBe('no-cache')
    for (const path of ['/', '/index.html', '/manifest.webmanifest']) {
      expect(sections[path]?.['cache-control']).toBe('no-cache')
    }
  })

  it('uses the identical CSP string', () => {
    expect(nginxHeaders['content-security-policy']).toBeTruthy()
    expect(sections['/*']?.['content-security-policy']).toBe(nginxHeaders['content-security-policy'])
  })

  it('allows no third-party origins in the CSP', () => {
    const csp = sections['/*']?.['content-security-policy'] ?? ''
    expect(csp).not.toMatch(/https?:/)
  })

  it('keeps the service worker uncacheable and hashed assets immutable, as nginx does', () => {
    expect(sections['/sw.js']?.['cache-control']).toBe('no-cache, no-store, must-revalidate')
    expect(sections['/assets/*']?.['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(nginx).toContain('add_header Cache-Control "no-cache, no-store, must-revalidate";')
    expect(nginx).toContain('add_header Cache-Control "public, max-age=31536000, immutable";')
  })

  it('detects drift: a changed CSP would not match', () => {
    const drifted = parseHeadersFile(headersFile.replace("font-src 'self'", "font-src 'self' https://x.test"))
    expect(drifted['/*']).not.toEqual(sections['/*'])
  })

  it('serves the SPA fallback with a 200 rewrite', () => {
    const redirects = readFileSync('public/_redirects', 'utf8').trim().split('\n')
    expect(redirects).toEqual(['/* /index.html 200'])
  })
})
