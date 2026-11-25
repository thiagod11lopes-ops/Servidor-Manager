import { checkIpv4AssignedOnLocalMachine } from '../config/networkAccess.ts'

export type ContractLanProbeFailureReason =
  | 'INVALID_URL'
  | 'HOST_NOT_ASSIGNED'
  | 'HOST_PORT_MISMATCH'
  | 'TIMEOUT'
  | 'TRANSPORT_ERROR'

export type ContractLanProbeResult =
  | {
      ok: true
      responded: true
      status: number
      finalUrl: string
      location: string | null
      bodyText?: string
    }
  | { ok: false; responded: false; reason: ContractLanProbeFailureReason; message: string }

export type ContractLanProbe = (
  url: string,
  expected: { host: string; port: number },
  options?: { timeoutMs?: number; readBody?: boolean },
) => Promise<ContractLanProbeResult>

let probeOverride: ContractLanProbe | null = null

/** Hook de teste — restaurar com `setContractLanProbeForTests(null)`. */
export function setContractLanProbeForTests(probe: ContractLanProbe | null): void {
  probeOverride = probe
}

function parseExpected(url: URL, expected: { host: string; port: number }): ContractLanProbeResult | null {
  const host = url.hostname.trim()
  const port = url.port ? Number.parseInt(url.port, 10) : url.protocol === 'https:' ? 443 : 80
  if (host !== expected.host.trim()) {
    return {
      ok: false,
      responded: false,
      reason: 'HOST_PORT_MISMATCH',
      message: `URL ${url.href} não corresponde ao host contratual ${expected.host}.`,
    }
  }
  if (port !== expected.port) {
    return {
      ok: false,
      responded: false,
      reason: 'HOST_PORT_MISMATCH',
      message: `URL ${url.href} não corresponde à porta contratual ${expected.port}.`,
    }
  }
  if (!checkIpv4AssignedOnLocalMachine(expected.host)) {
    return {
      ok: false,
      responded: false,
      reason: 'HOST_NOT_ASSIGNED',
      message: `IPv4 ${expected.host} não está atribuído a uma interface local.`,
    }
  }
  return null
}

async function defaultProbe(
  url: string,
  expected: { host: string; port: number },
  options?: { timeoutMs?: number; readBody?: boolean },
): Promise<ContractLanProbeResult> {
  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    return { ok: false, responded: false, reason: 'INVALID_URL', message: 'URL inválida.' }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      ok: false,
      responded: false,
      reason: 'INVALID_URL',
      message: 'Somente http:// ou https:// são permitidos.',
    }
  }

  const mismatch = parseExpected(parsed, expected)
  if (mismatch) return mismatch

  const timeoutMs = options?.timeoutMs ?? 8_000
  try {
    const response = await fetch(parsed.href, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: options?.readBody ? 'application/json' : '*/*' },
    })
    const location = response.headers.get('location')
    const bodyText = options?.readBody ? await response.text() : undefined
    return {
      ok: true,
      responded: true,
      status: response.status,
      finalUrl: parsed.href,
      location,
      bodyText,
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

export async function probeContractLanHttpUrl(
  url: string,
  expected: { host: string; port: number },
  options?: { timeoutMs?: number; readBody?: boolean },
): Promise<ContractLanProbeResult> {
  if (probeOverride) return probeOverride(url, expected, options)
  return defaultProbe(url, expected, options)
}

export function locationMatchesContract(
  location: string | null,
  expected: { host: string; port: number; pathPrefix?: string },
): boolean {
  if (!location) return true
  try {
    const resolved = new URL(location, `http://${expected.host}:${expected.port}/`)
    if (resolved.hostname !== expected.host) return false
    const port = resolved.port ? Number.parseInt(resolved.port, 10) : 80
    if (port !== expected.port) return false
    return true
  } catch {
    return false
  }
}

export function isAcceptableFixedLanLoginProbe(
  result: ContractLanProbeResult,
  expected: { host: string; port: number },
): boolean {
  if (!result.ok || !result.responded) return false
  if (result.status >= 500) return false
  if (result.status >= 300 && result.status < 400) {
    return locationMatchesContract(result.location, expected)
  }
  return result.status >= 200 && result.status < 500
}
