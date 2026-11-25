export function localHttpReachableLabel(reachable: boolean | null | undefined): string {
  if (reachable === true) return 'HTTP local respondeu'
  if (reachable === false) return 'HTTP local sem resposta'
  return 'HTTP local não verificado'
}

function normalizeHostname(hostname: string): string {
  const lower = hostname.toLowerCase()
  if (lower.startsWith('[') && lower.endsWith(']')) return lower.slice(1, -1)
  return lower
}

export function isLoopbackHttpOrHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    const host = normalizeHostname(parsed.hostname)
    return host === '127.0.0.1' || host === 'localhost' || host === '::1'
  } catch {
    return false
  }
}

/** Exibe URL de probe somente se for HTTP(S) em loopback. */
export function resolveDisplayLocalProbeUrl(probeUrl: string | undefined | null): string | null {
  if (typeof probeUrl !== 'string') return null
  const trimmed = probeUrl.trim()
  if (!trimmed || !isLoopbackHttpOrHttpsUrl(trimmed)) return null
  return trimmed
}
