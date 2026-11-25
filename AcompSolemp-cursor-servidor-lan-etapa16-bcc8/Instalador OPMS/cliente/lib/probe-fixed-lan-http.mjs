import { classifyFetchError } from './classify-fetch-error.mjs'

/**
 * @param {string | null} location
 * @param {{ host: string, port: number }} expected
 */
export function locationMatchesFixedLanContract(location, expected) {
  if (!location) return true
  try {
    const resolved = new URL(location, `http://${expected.host}:${expected.port}/`)
    if (resolved.hostname !== expected.host) return false
    const port = resolved.port ? Number.parseInt(resolved.port, 10) : 80
    return port === expected.port
  } catch {
    return false
  }
}

/**
 * @param {{ status: number, location?: string | null }} response
 * @param {{ host: string, port: number }} expected
 */
export function isAcceptableFixedLanLoginResponse(response, expected) {
  const { status } = response
  if (status >= 500) return false
  if (status >= 300 && status < 400) {
    return locationMatchesFixedLanContract(response.location ?? null, expected)
  }
  return status >= 200 && status < 500
}

/**
 * @param {string} url
 * @param {{ host: string, port: number }} expected
 * @param {AbortSignal} signal
 */
export async function fetchFixedLanLoginProbe(url, expected, signal) {
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'manual',
    signal,
    headers: { Accept: '*/*' },
  })
  const location = response.headers.get('location')
  const ok = isAcceptableFixedLanLoginResponse({ status: response.status, location }, expected)
  return {
    ok,
    status: response.status,
    location,
    detail: ok
      ? `HTTP ${response.status}${location ? ` → ${location}` : ''}`
      : `Resposta inesperada em /login (HTTP ${response.status}${location ? ` → ${location}` : ''})`,
  }
}

/**
 * @param {string} url
 * @param {AbortSignal} signal
 */
export async function fetchServerConnectionJson(url, signal) {
  const response = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    return { ok: false, status: response.status, detail: `server-connection.json indisponível (HTTP ${response.status})` }
  }
  const body = await response.json()
  return { ok: true, status: response.status, body }
}

/**
 * @param {string} origin
 * @param {{ host: string, port: number, loginUrl: string }} fixedLanUrls
 * @param {number} timeoutMs
 */
export async function probeFixedLanServerReachability(origin, fixedLanUrls, timeoutMs = 8000) {
  const discoveryUrl = `${origin.replace(/\/+$/, '')}/server-connection.json`
  const expected = { host: fixedLanUrls.host, port: fixedLanUrls.port }
  const controller = new AbortController()
  let timedOut = false
  const t = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    let connectionResult = null
    try {
      connectionResult = await fetchServerConnectionJson(discoveryUrl, controller.signal)
    } catch (error) {
      connectionResult = {
        ok: false,
        transportError: classifyFetchError(error, { timedOut: timedOut || controller.signal.aborted }),
      }
    }

    if (connectionResult.ok) {
      return {
        reachable: true,
        connection: connectionResult.body,
        discoveryDetail: `server-connection.json HTTP ${connectionResult.status}`,
        probe: 'server-connection.json',
      }
    }

    let loginResult = null
    try {
      loginResult = await fetchFixedLanLoginProbe(fixedLanUrls.loginUrl, expected, controller.signal)
    } catch (error) {
      loginResult = {
        ok: false,
        detail: classifyFetchError(error, { timedOut: timedOut || controller.signal.aborted }),
      }
    }

    if (loginResult.ok) {
      const jsonDetail =
        connectionResult.transportError ??
        connectionResult.detail ??
        'server-connection.json indisponível'
      return {
        reachable: true,
        connection: connectionResult.body,
        discoveryDetail: `${jsonDetail}; serviço HTTP responde em /login (${loginResult.detail})`,
        probe: 'login-fallback',
      }
    }

    const parts = []
    if (connectionResult.transportError) parts.push(`Descoberta: ${connectionResult.transportError}`)
    else if (connectionResult.detail) parts.push(`Descoberta: ${connectionResult.detail}`)
    if (loginResult.detail) parts.push(`/login: ${loginResult.detail}`)

    return {
      reachable: false,
      discoveryDetail: parts.join(' '),
      probe: 'none',
    }
  } finally {
    clearTimeout(t)
  }
}
