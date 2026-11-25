import {
  buildLanAccessUrl,
  getPhysicalLanIPv4,
  isRfc1918IPv4,
  isCarrierGradeNatIPv4,
  listPhysicalLanIPv4Candidates,
} from './networkAccess.ts'

/** Host que não deve ser anunciado como endereço LAN partilhável. */
export function isInvalidLanAdvertiseHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase()
  if (!h) return true
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true
  if (isCarrierGradeNatIPv4(h)) return true
  if (h.endsWith('.ts.net')) return true
  return false
}

/** IPv4 RFC1918 preferido para partilha na LAN (Wi‑Fi/Ethernet). */
export function getShareableLanIPv4(): string | null {
  const candidates = listPhysicalLanIPv4Candidates()
  const rfc1918 = candidates.find((c) => isRfc1918IPv4(c.address))
  if (rfc1918) return rfc1918.address
  const physical = getPhysicalLanIPv4()
  if (physical && isRfc1918IPv4(physical)) return physical
  return null
}

export function buildShareableLanLoginUrl(httpPort: number): string | null {
  return buildLanAccessUrl(httpPort, '/login')
}

function normalizeLoginPath(pathname: string): string {
  const p = pathname.trim() || '/'
  if (p === '/' || p.endsWith('/login')) return '/login'
  return p.endsWith('/') ? `${p}login` : `${p}/login`
}

/**
 * Corrige URLs persistidas (CGNAT/VPN legado, preview :4173) para IPv4 LAN físico e porta HTTP publicada (Caddy).
 */
export function sanitizePublicLoginUrl(loginUrl: string, httpPort: number): string | null {
  const trimmed = loginUrl.trim()
  if (!trimmed) return buildShareableLanLoginUrl(httpPort)

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return buildShareableLanLoginUrl(httpPort)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return buildShareableLanLoginUrl(httpPort)
  }

  const portFromUrl = parsed.port ? Number.parseInt(parsed.port, 10) : parsed.protocol === 'https:' ? 443 : 80
  const hostInvalid = isInvalidLanAdvertiseHost(parsed.hostname)
  const portMismatch = Number.isFinite(portFromUrl) && portFromUrl !== httpPort

  const shareHost = getShareableLanIPv4()
  if (!shareHost) {
    if (hostInvalid || portMismatch) return null
    return trimmed
  }

  if (hostInvalid || portMismatch || !isRfc1918IPv4(parsed.hostname)) {
    parsed.protocol = 'http:'
    parsed.hostname = shareHost
    parsed.port = String(httpPort)
    parsed.pathname = normalizeLoginPath(parsed.pathname)
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString()
  }

  return trimmed
}
