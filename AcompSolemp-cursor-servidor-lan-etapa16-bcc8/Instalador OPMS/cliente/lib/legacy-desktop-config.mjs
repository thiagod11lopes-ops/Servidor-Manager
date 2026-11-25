import { normalizeStartUrl } from './normalize-start-url.mjs'
import { productUsesLanDiscovery } from './fixed-lan-product.mjs'

/** URLs de demo/GitHub Pages anteriores ao contrato LAN OMPS Usuário. */
const LEGACY_GITHUB_PAGES_HOST = /(^|\.)github\.io$/i

export function isLegacyOmpsDesktopStartUrl(startUrl) {
  if (!startUrl || typeof startUrl !== 'string') return false
  let normalized
  try {
    normalized = normalizeStartUrl(startUrl)
  } catch {
    return false
  }
  try {
    const u = new URL(normalized)
    if (!LEGACY_GITHUB_PAGES_HOST.test(u.hostname)) return false
    return /acompopms|acompsolemp/i.test(u.pathname)
  } catch {
    return false
  }
}

export function buildOmpsUsuarioProductionConfigBody(product, fixedLanLoginUrl) {
  const lanDiscovery = productUsesLanDiscovery(product)
  const body = {
    discoverConnection: true,
    lanDiscovery,
    windowTitle: product.clientDesktopDefaults?.windowTitle ?? 'AcompOPMS',
  }
  if (!lanDiscovery && fixedLanLoginUrl) {
    body.startUrl = fixedLanLoginUrl
  }
  return body
}
