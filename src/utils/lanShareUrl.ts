import type { SystemRuntimeStatus } from '../types/systemRuntime.ts'

/** Espelha regras do serviço local — hosts que não devem ser partilhados na LAN. */
export function isInvalidLanShareHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase()
  if (!h || h === 'localhost' || h === '127.0.0.1' || h === '::1') return true
  const cgnat = /^100\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(h)
  if (cgnat) {
    const second = Number(cgnat[1])
    if (second >= 64 && second <= 127) return true
  }
  if (h.endsWith('.ts.net')) return true
  return false
}

/** Portas de dev/preview — nunca são endereço oficial para utilizadores (manifest LAN usa Caddy). */
export function isDevPreviewHttpPort(port: number): boolean {
  return port === 4173 || port === 5173
}

export function isRfc1918Host(hostname: string): boolean {
  const h = hostname.trim()
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true
  const m = /^172\.(\d{1,2})\.\d{1,3}\.\d{1,3}$/.exec(h)
  if (m) {
    const second = Number(m[1])
    return second >= 16 && second <= 31
  }
  return false
}

export function effectivePublishedHttpPort(status: Pick<SystemRuntimeStatus, 'port' | 'runtimeKind'>): number {
  if (status.runtimeKind === 'manifest-lan') {
    const p = status.port
    if (typeof p === 'number' && p > 0 && !isDevPreviewHttpPort(p)) return p
    return 8080
  }
  if (typeof status.port === 'number' && status.port > 0) return status.port
  return 8080
}

export function isUnofficialUserAccessUrl(
  url: string,
  httpPort: number,
  runtimeKind?: SystemRuntimeStatus['runtimeKind'],
): boolean {
  try {
    const parsed = new URL(url.trim())
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true
    if (isInvalidLanShareHost(parsed.hostname)) return true
    const port = parsed.port ? Number.parseInt(parsed.port, 10) : parsed.protocol === 'https:' ? 443 : 80
    if (runtimeKind === 'manifest-lan') {
      if (isDevPreviewHttpPort(port)) return true
      if (port !== httpPort) return true
      if (!isRfc1918Host(parsed.hostname)) return true
    }
    return false
  } catch {
    return true
  }
}
