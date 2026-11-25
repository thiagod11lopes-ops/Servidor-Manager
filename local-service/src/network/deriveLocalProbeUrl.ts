/**
 * Constrói URL de probe em loopback a partir de uma URL canônica (LAN/login).
 * Nunca retorna o host original — apenas 127.0.0.1 com porta/caminho preservados.
 */
export function deriveLocalProbeUrlFromCanonical(
  canonicalUrl: string,
  portFallback?: number | null,
): string | null {
  const trimmed = canonicalUrl.trim()
  if (!trimmed) return null

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (parsed.username || parsed.password) return null

  const hasPortInUrl = parsed.port !== ''
  if (!hasPortInUrl && (portFallback == null || portFallback <= 0)) {
    return null
  }

  const probe = new URL(parsed.href)
  probe.hostname = '127.0.0.1'
  probe.username = ''
  probe.password = ''
  if (!hasPortInUrl && portFallback != null) {
    probe.port = String(portFallback)
  }

  return probe.href
}
