import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const SERVIDOR_OMPS_PRODUCT_SCHEMA_V2 = 'servidor-omps-product/2'
export const SERVIDOR_OMPS_PRODUCT_SCHEMA_V3 = 'servidor-omps-product/3'

function resourcesRoot() {
  if (process.resourcesPath) return process.resourcesPath
  return null
}

export function bundledProductJsonPath() {
  const root = resourcesRoot()
  if (!root) return null
  return join(root, 'servidor-omps-product.json')
}

export function loadBundledServidorOmpsProduct() {
  const p = bundledProductJsonPath()
  if (!p || !existsSync(p)) return null
  const raw = JSON.parse(readFileSync(p, 'utf8'))
  if (raw.schema !== SERVIDOR_OMPS_PRODUCT_SCHEMA_V2 && raw.schema !== SERVIDOR_OMPS_PRODUCT_SCHEMA_V3) {
    throw new Error(`${p}: schema de produto OMPS não suportado (${raw.schema})`)
  }
  if (raw.productLine !== 'servidor-omps') {
    throw new Error(`${p}: productLine inválido para OMPS Usuário`)
  }
  return raw
}

export function normalizeLanAccessFromProduct(product) {
  if (product.lanAccess) {
    const lan = product.lanAccess
    return {
      lanHostMode:
        lan.lanHostMode === 'fixed' ? 'fixed' : lan.lanHostMode === 'local' ? 'local' : 'auto',
      expectedLanHost: lan.expectedLanHost,
      requiredHttpPort: lan.requiredHttpPort,
      httpPortScanMaxOffset: lan.httpPortScanMaxOffset ?? 20,
      allowHttpPortFallback: lan.allowHttpPortFallback === true,
      discoveryUdpPort: lan.discoveryUdpPort ?? 47_808,
      entryPath: lan.entryPath ?? '/login',
    }
  }
  const fixed = product.fixedLanAccess
  if (!fixed) throw new Error('lanAccess/fixedLanAccess ausente no contrato do produto')
  return {
    lanHostMode: 'fixed',
    expectedLanHost: fixed.expectedLanHost,
    requiredHttpPort: fixed.requiredHttpPort,
    discoveryUdpPort: 47_808,
    entryPath: fixed.entryPath ?? '/login',
  }
}

export function buildLanUrlsFromProduct(product, resolvedHost) {
  const lan = normalizeLanAccessFromProduct(product)
  const host =
    lan.lanHostMode === 'local'
      ? '127.0.0.1'
      : lan.lanHostMode === 'fixed'
        ? String(lan.expectedLanHost).trim()
        : resolvedHost?.trim()
  if (!host) return null
  const port = lan.requiredHttpPort
  let entry = String(lan.entryPath ?? '/login').trim()
  if (!entry.startsWith('/')) entry = `/${entry}`
  const baseUrl = `http://${host}:${port}`
  return {
    baseUrl,
    loginUrl: `${baseUrl}${entry}`,
    origin: baseUrl,
    host,
    port,
    discoveryUdpPort: lan.discoveryUdpPort,
    lanHostMode: lan.lanHostMode,
  }
}

/** @deprecated */
export function buildFixedLanUrlsFromProduct(product) {
  const urls = buildLanUrlsFromProduct(product, normalizeLanAccessFromProduct(product).expectedLanHost)
  if (!urls) throw new Error('Não foi possível derivar URL LAN do produto')
  return urls
}

export function productUsesLanDiscovery(product) {
  const defaults = product.clientDesktopDefaults ?? {}
  if (defaults.lanDiscovery === true) return true
  const lan = normalizeLanAccessFromProduct(product)
  if (lan.lanHostMode === 'local') return defaults.lanDiscovery === true
  return lan.lanHostMode === 'auto'
}

export function resolveClientStartUrlFromProduct(product) {
  const defaults = product.clientDesktopDefaults ?? {}
  const lan = normalizeLanAccessFromProduct(product)
  if (lan.lanHostMode === 'local') {
    const urls = buildLanUrlsFromProduct(product, '127.0.0.1')
    if (!urls) throw new Error('startUrl indisponível no contrato (local)')
    return urls.loginUrl
  }
  if (lan.lanHostMode === 'auto' || defaults.startUrlFromLanAccess === true) {
    return null
  }
  if (defaults.startUrlFromFixedLanAccess !== true && lan.lanHostMode === 'fixed') {
    // compat v2
  }
  const urls = buildLanUrlsFromProduct(product, lan.expectedLanHost)
  if (!urls) throw new Error('startUrl indisponível no contrato')
  return urls.loginUrl
}

/**
 * @param {{ host: string, port: number, loginUrl: string }} contractUrls
 * @param {string | undefined} recommendedUrl
 */
export function resolveStartUrlWithFixedLanDiscovery(contractUrls, recommendedUrl, currentStartUrl) {
  if (!recommendedUrl || typeof recommendedUrl !== 'string') {
    return { startUrl: contractUrls.loginUrl ?? currentStartUrl, source: 'lan-discovery' }
  }
  let parsed
  try {
    parsed = new URL(recommendedUrl)
  } catch {
    throw new Error(`server-connection.json retornou URL inválida (${recommendedUrl}).`)
  }
  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80')
  const lan = contractUrls.lanAccess
  if (lan?.allowHttpPortFallback) {
    const base = lan.requiredHttpPort ?? contractUrls.port
    const maxOffset = lan.httpPortScanMaxOffset ?? 20
    const numericPort = Number.parseInt(String(port), 10)
    if (!Number.isInteger(numericPort) || numericPort < base || numericPort >= base + maxOffset) {
      throw new Error(
        `server-connection.json aponta para porta ${port}, fora da faixa OMPS (${base}–${base + maxOffset - 1}).`,
      )
    }
  } else if (String(port) !== String(contractUrls.port)) {
    throw new Error(
      `server-connection.json aponta para porta ${port}, mas o servidor anunciado usa ${contractUrls.port}.`,
    )
  }
  if (contractUrls.host && parsed.hostname !== contractUrls.host) {
    throw new Error(
      `server-connection.json aponta para ${parsed.hostname}, mas o servidor anunciado é ${contractUrls.host}.`,
    )
  }
  return { startUrl: recommendedUrl, source: 'server-connection.json' }
}
