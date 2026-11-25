export type ProbeLocalHttpFailureReason =
  | 'INVALID_URL'
  | 'UNSUPPORTED_PROTOCOL'
  | 'NON_LOCAL_HOST'
  | 'TIMEOUT'
  | 'TRANSPORT_ERROR'

export type ProbeLocalHttpUrlResult =
  | { ok: true; responded: true; status: number; finalUrl: string }
  | { ok: false; responded: false; reason: ProbeLocalHttpFailureReason; message: string }

const DEFAULT_TIMEOUT_MS = 4_500

function isValidIpv4Octets(octets: number[]): boolean {
  return octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
}

function isLoopbackHost(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  if (lower === 'localhost') return true
  if (lower === '::1') return true

  const m = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(lower)
  if (m) {
    const octets = [127, Number(m[1]), Number(m[2]), Number(m[3])]
    return isValidIpv4Octets(octets)
  }

  return false
}

function parseLocalHttpUrl(raw: string): URL | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    return new URL(trimmed)
  } catch {
    return null
  }
}

function validateProbeTarget(url: URL): ProbeLocalHttpUrlResult | null {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      ok: false,
      responded: false,
      reason: 'UNSUPPORTED_PROTOCOL',
      message: 'Somente URLs http:// ou https:// são permitidas.',
    }
  }

  if (url.username || url.password) {
    return {
      ok: false,
      responded: false,
      reason: 'INVALID_URL',
      message: 'URLs com credenciais embutidas não são permitidas.',
    }
  }

  if (!isLoopbackHost(url.hostname)) {
    return {
      ok: false,
      responded: false,
      reason: 'NON_LOCAL_HOST',
      message: 'Probe permitido apenas para localhost ou loopback (127.x.x.x, ::1).',
    }
  }

  return null
}

/**
 * Verifica se uma URL responde via HTTP local (loopback). Não segue redirects (evita SSRF).
 */
export async function probeLocalHttpUrl(
  url: string,
  options?: { timeoutMs?: number },
): Promise<ProbeLocalHttpUrlResult> {
  const parsed = parseLocalHttpUrl(url)
  if (!parsed) {
    return {
      ok: false,
      responded: false,
      reason: 'INVALID_URL',
      message: 'URL inválida.',
    }
  }

  const validationError = validateProbeTarget(parsed)
  if (validationError) return validationError

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS

  try {
    const response = await fetch(parsed.href, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: '*/*' },
    })

    const status = response.status
    if (status > 0 && status < 600) {
      return { ok: true, responded: true, status, finalUrl: parsed.href }
    }

    return {
      ok: false,
      responded: false,
      reason: 'TRANSPORT_ERROR',
      message: `Resposta HTTP fora do intervalo esperado: ${status}`,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const isTimeout =
      (error instanceof Error && error.name === 'TimeoutError') ||
      message.toLowerCase().includes('timeout') ||
      message.includes('AbortError')
    return {
      ok: false,
      responded: false,
      reason: isTimeout ? 'TIMEOUT' : 'TRANSPORT_ERROR',
      message,
    }
  }
}
