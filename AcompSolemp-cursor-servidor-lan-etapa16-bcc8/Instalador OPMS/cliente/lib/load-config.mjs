import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { normalizeStartUrl, originFromStartUrl } from './normalize-start-url.mjs'
import {
  buildLanUrlsFromProduct,
  loadBundledServidorOmpsProduct,
  normalizeLanAccessFromProduct,
  productUsesLanDiscovery,
  resolveClientStartUrlFromProduct,
} from './fixed-lan-product.mjs'

import { CONFIG_FILENAME, defaultInstallDir as sharedDefaultInstallDir } from './install-dir.mjs'
import {
  buildOmpsUsuarioProductionConfigBody,
  isLegacyOmpsDesktopStartUrl,
} from './legacy-desktop-config.mjs'
import {
  backupConfigFile,
  isRecognizableOmpsGeneratedConfigRaw,
  readDesktopConfigObject,
  writeDesktopConfigObject,
} from './desktop-config-file.mjs'

export { CONFIG_FILENAME }

function installConfigPath() {
  return join(sharedDefaultInstallDir(), CONFIG_FILENAME)
}

function readJsonConfig(filePath) {
  return readDesktopConfigObject(filePath).data
}

function buildConfigView(product, data, sourceLabel) {
  const lanDiscovery = data.lanDiscovery === true || (product && productUsesLanDiscovery(product))
  const defaults = product?.clientDesktopDefaults ?? {}
  let startUrl = null
  let origin = null
  let contractUrls = null

  if (data.startUrl && typeof data.startUrl === 'string') {
    startUrl = normalizeStartUrl(data.startUrl)
    origin = originFromStartUrl(startUrl)
    try {
      const parsed = new URL(startUrl)
      contractUrls = {
        loginUrl: startUrl,
        origin: parsed.origin,
        host: parsed.hostname,
        port: Number.parseInt(parsed.port || '80', 10),
        baseUrl: parsed.origin,
      }
    } catch {
      // mantém null
    }
  } else if (product) {
    const fromProduct = resolveClientStartUrlFromProduct(product)
    if (fromProduct) {
      startUrl = normalizeStartUrl(fromProduct)
      origin = originFromStartUrl(startUrl)
      contractUrls = buildLanUrlsFromProduct(product, normalizeLanAccessFromProduct(product).expectedLanHost)
    }
  }

  if (data.lastKnownOrigin && typeof data.lastKnownOrigin === 'string' && lanDiscovery) {
    origin = data.lastKnownOrigin.replace(/\/+$/, '')
  }

  return {
    startUrl,
    origin,
    discoverConnection: data.discoverConnection !== false,
    lanDiscovery,
    windowTitle: data.windowTitle ?? defaults.windowTitle ?? 'AcompOPMS',
    source: sourceLabel,
    contractUrls,
    lanAccess: product ? normalizeLanAccessFromProduct(product) : null,
    configPath: data._configPath ?? null,
    lastKnownOrigin: typeof data.lastKnownOrigin === 'string' ? data.lastKnownOrigin : null,
    raw: data,
  }
}

function tryRecoverCorruptOmpsConfigFile(filePath, product) {
  const raw = readFileSync(filePath, 'utf8')
  if (!isRecognizableOmpsGeneratedConfigRaw(raw)) {
    return null
  }
  backupConfigFile(filePath, 'corrupt-backup')
  const body = buildOmpsUsuarioProductionConfigBody(product, null)
  writeDesktopConfigObject(filePath, body)
  return { ...body, _configPath: filePath, _recoveredFromCorrupt: true }
}

function configFromBundledProduct(product) {
  return buildConfigView(product, buildOmpsUsuarioProductionConfigBody(product, null), 'resources:servidor-omps-product.json')
}

export function buildDesktopConfigSearchPaths(opts = {}) {
  const cwd = opts.cwd ?? process.cwd()
  const execDir =
    opts.execDir ?? (typeof process.execPath === 'string' && process.execPath ? dirname(process.execPath) : null)
  const paths = []
  if (opts.explicitPath) paths.push(opts.explicitPath)
  if (execDir) paths.push(join(execDir, CONFIG_FILENAME))
  paths.push(join(cwd, CONFIG_FILENAME))
  paths.push(installConfigPath())
  const seen = new Set()
  return paths.filter((p) => {
    const key = p.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function migrateLegacyOmpsDesktopConfigFile(filePath, product) {
  const previous = readJsonConfig(filePath)
  if (!previous.startUrl || !isLegacyOmpsDesktopStartUrl(previous.startUrl)) {
    return null
  }
  backupConfigFile(filePath, 'legacy-backup')
  const body = buildOmpsUsuarioProductionConfigBody(product, null)
  writeDesktopConfigObject(filePath, body)
  return { ...body, _configPath: filePath, _migratedFrom: previous.startUrl }
}

export function loadDesktopConfig(opts = {}) {
  const cwd = opts.cwd ?? process.cwd()

  if (process.env.ACOMOPMS_START_URL?.trim()) {
    const startUrl = normalizeStartUrl(process.env.ACOMOPMS_START_URL)
    return {
      startUrl,
      origin: originFromStartUrl(startUrl),
      discoverConnection: true,
      lanDiscovery: false,
      source: 'env:ACOMOPMS_START_URL',
    }
  }

  const candidates = buildDesktopConfigSearchPaths({ ...opts, cwd })
  const bundledProduct = opts.productOverride ?? loadBundledServidorOmpsProduct()

  for (const p of candidates) {
    if (!existsSync(p)) continue
    let data
    try {
      data = readJsonConfig(p)
    } catch (parseErr) {
      if (!bundledProduct) throw parseErr
      const recovered = tryRecoverCorruptOmpsConfigFile(p, bundledProduct)
      if (!recovered) {
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr)
        throw new Error(`${p}: JSON inválido (${msg}). Corrija o arquivo ou reinstale o OMPS Usuário.`)
      }
      data = recovered
    }
    data._configPath = p

    if (bundledProduct && data.startUrl && isLegacyOmpsDesktopStartUrl(data.startUrl)) {
      const migrated = migrateLegacyOmpsDesktopConfigFile(p, bundledProduct)
      if (migrated) data = migrated
    }

    if (bundledProduct) {
      return buildConfigView(
        bundledProduct,
        data,
        data._migratedFrom ? `${p} (migrado de URL legada)` : p,
      )
    }

    if (!data.startUrl || typeof data.startUrl !== 'string') {
      throw new Error(`${CONFIG_FILENAME}: campo startUrl obrigatório (${p})`)
    }
    return buildConfigView(null, data, p)
  }

  if (bundledProduct) {
    return configFromBundledProduct(bundledProduct)
  }

  throw new Error(
    `Config não encontrada. Crie ${CONFIG_FILENAME} ou defina ACOMOPMS_START_URL.\n` +
      `Exemplo: Instalador OPMS/cliente/${CONFIG_FILENAME.replace('.json', '.example.json')}`,
  )
}

export { installConfigPath }
