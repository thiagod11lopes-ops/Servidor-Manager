import { resolveStartUrlWithFixedLanDiscovery } from './fixed-lan-product.mjs'
import { probeFixedLanServerReachability } from './probe-fixed-lan-http.mjs'

/**
 * Opcional: alinha startUrl com server-connection.json do servidor LAN.
 * @param {string} origin ex.: http://192.168.0.42:8080
 * @param {string} currentStartUrl
 * @param {number} [timeoutMs]
 * @param {{ host: string, port: number, loginUrl: string } | null} [contractUrls]
 */
export async function resolveStartUrlFromServer(origin, currentStartUrl, timeoutMs = 8000, contractUrls = null) {
  if (contractUrls) {
    const reach = await probeFixedLanServerReachability(origin, contractUrls, timeoutMs)
    if (!reach.reachable) {
      return {
        startUrl: contractUrls.loginUrl,
        source: 'lan-contract',
        detail: reach.discoveryDetail,
        serverUnreachable: true,
        unreachableReason: reach.discoveryDetail,
      }
    }

    const body = reach.connection
    const recommended =
      body?.client?.recommendedStartUrl || body?.lan?.loginUrl || body?.overlay?.loginUrl
    if (typeof recommended === 'string' && recommended.startsWith('http')) {
      const resolved = resolveStartUrlWithFixedLanDiscovery(contractUrls, recommended, currentStartUrl)
      return {
        startUrl: resolved.startUrl,
        source: resolved.source,
        connection: body,
        detail: reach.discoveryDetail,
      }
    }

    return {
      startUrl: contractUrls.loginUrl,
      source: 'lan-contract',
      connection: body,
      detail: reach.discoveryDetail,
    }
  }

  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const r = await fetch(`${origin.replace(/\/+$/, '')}/server-connection.json`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!r.ok) {
      return { startUrl: currentStartUrl, source: 'config-only', detail: `HTTP ${r.status}` }
    }
    const body = await r.json()
    const recommended =
      body?.client?.recommendedStartUrl || body?.lan?.loginUrl || body?.overlay?.loginUrl
    if (typeof recommended === 'string' && recommended.startsWith('http')) {
      return { startUrl: recommended, source: 'server-connection.json', connection: body }
    }
    return { startUrl: currentStartUrl, source: 'config-only', connection: body }
  } catch (e) {
    return {
      startUrl: currentStartUrl,
      source: 'config-only',
      detail: e instanceof Error ? e.message : String(e),
    }
  } finally {
    clearTimeout(t)
  }
}
