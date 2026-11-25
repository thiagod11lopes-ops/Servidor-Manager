/**
 * Leitura do contrato LAN a partir de resources-packaging/servidor-omps-product.json.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
export const SERVIDOR_OMPS_PRODUCT_SOURCE = path.join(root, 'resources-packaging', 'servidor-omps-product.json')

export function loadServidorOmpsProductSource() {
  return JSON.parse(fs.readFileSync(SERVIDOR_OMPS_PRODUCT_SOURCE, 'utf8'))
}

export function normalizeLanAccessFromProduct(product) {
  if (product.lanAccess) return product.lanAccess
  if (product.fixedLanAccess) {
    return {
      lanHostMode: 'fixed',
      expectedLanHost: product.fixedLanAccess.expectedLanHost,
      requiredHttpPort: product.fixedLanAccess.requiredHttpPort,
      discoveryUdpPort: 47808,
      entryPath: product.fixedLanAccess.entryPath,
    }
  }
  throw new Error('lanAccess ausente')
}

export function buildLanUrlsFromProduct(product, resolvedHost) {
  const lan = normalizeLanAccessFromProduct(product)
  const host =
    lan.lanHostMode === 'local'
      ? '127.0.0.1'
      : lan.lanHostMode === 'fixed'
        ? lan.expectedLanHost
        : resolvedHost
  if (!host) return null
  const port = lan.requiredHttpPort
  let entry = String(lan.entryPath ?? '/login').trim()
  if (!entry.startsWith('/')) entry = `/${entry}`
  const baseUrl = `http://${host}:${port}`
  return { baseUrl, loginUrl: `${baseUrl}${entry}`, origin: baseUrl }
}

/** @deprecated */
export function buildFixedLanUrlsFromProduct(product) {
  const lan = normalizeLanAccessFromProduct(product)
  const urls = buildLanUrlsFromProduct(product, lan.expectedLanHost)
  if (!urls) throw new Error('URL LAN indisponível')
  return urls
}

export function resolveClientDefaultStartUrl(product) {
  const lan = normalizeLanAccessFromProduct(product)
  if (lan.lanHostMode === 'auto') return null
  const host = lan.lanHostMode === 'local' ? '127.0.0.1' : lan.expectedLanHost
  return buildLanUrlsFromProduct(product, host)?.loginUrl ?? null
}
