import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ASSET_ATTR_RE = /\b(?:src|href)=["']([^"']+)["']/gi

export function parseReferencedAssets(indexHtml) {
  const assets = []
  for (const match of indexHtml.matchAll(ASSET_ATTR_RE)) {
    const raw = match[1]?.trim()
    if (!raw || raw.startsWith('data:') || raw.startsWith('http://') || raw.startsWith('https://')) {
      continue
    }
    assets.push(raw.replace(/^\//, ''))
  }
  return assets
}

/** Valida pasta dist/ui-dist (index.html + assets referenciados). */
export function validateManagerUiBundle(uiRoot) {
  const root = path.resolve(uiRoot)
  const indexPath = path.join(root, 'index.html')
  if (!fs.existsSync(indexPath)) {
    return { ok: false, reason: 'index.html ausente', indexPath, uiRoot: root }
  }

  let html
  try {
    html = fs.readFileSync(indexPath, 'utf8')
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, reason: 'index.html ilegível', detail, indexPath, uiRoot: root }
  }

  const assets = parseReferencedAssets(html)
  if (assets.length === 0) {
    return { ok: false, reason: 'index.html não referencia assets JS/CSS', indexPath, uiRoot: root }
  }

  const missing = []
  for (const rel of assets) {
    const candidate = path.join(root, rel.split('/').join(path.sep))
    if (!fs.existsSync(candidate)) {
      missing.push(rel)
    }
  }
  if (missing.length > 0) {
    return {
      ok: false,
      reason: 'assets referenciados ausentes',
      missing,
      indexPath,
      uiRoot: root,
    }
  }

  const mainJs = assets.find((item) => item.includes('assets/') && item.endsWith('.js'))
  return {
    ok: true,
    indexPath,
    uiRoot: root,
    mainJsAsset: mainJs ?? null,
  }
}

export function requiresExternalUiDist(resourcesPath) {
  const root = path.resolve(resourcesPath)
  return (
    fs.existsSync(path.join(root, 'servidor-omps-product.json')) ||
    fs.existsSync(path.join(root, 'omps-payload'))
  )
}

/**
 * Política Electron empacotado:
 * - ui-dist válido → oficial
 * - OMPS/servidor com payload → proíbe fallback silencioso para app.asar/dist
 * - Manager genérico → fallback asar apenas se bundle asar válido
 */
export function resolvePackagedUiIndex(input) {
  const resourcesPath = path.resolve(input.resourcesPath)
  const appPath = path.resolve(input.appPath)
  const officialRoot = path.join(resourcesPath, 'ui-dist')
  const official = validateManagerUiBundle(officialRoot)
  if (official.ok) {
    return {
      ok: true,
      indexPath: official.indexPath,
      source: 'ui-dist',
      mainJsAsset: official.mainJsAsset,
    }
  }

  const requiresExternal = requiresExternalUiDist(resourcesPath)
  if (requiresExternal) {
    return {
      ok: false,
      source: 'ui-dist-required',
      reason:
        'A interface oficial em resources/ui-dist está ausente ou incompleta. O aplicativo não carregará uma cópia antiga embutida no app.asar.',
      detail: official.reason,
      missing: official.missing,
      recovery:
        'Feche o Manager, execute backups\\Update-ProgramFiles-OmpsResources-Once.ps1 (como Administrador) ou reinstale pelo instalador Servidor OMPS.',
      uiRoot: officialRoot,
    }
  }

  const asarRoot = path.join(appPath, 'dist')
  const asar = validateManagerUiBundle(asarRoot)
  if (asar.ok) {
    return {
      ok: true,
      indexPath: asar.indexPath,
      source: 'asar-fallback',
      warning: 'resources/ui-dist ausente — usando cópia embutida no app.asar (atualize ui-dist para alinhar com o serviço local).',
      mainJsAsset: asar.mainJsAsset,
    }
  }

  return {
    ok: false,
    source: 'none',
    reason: 'Nenhuma interface válida encontrada (ui-dist nem app.asar/dist).',
    detail: { official: official.reason, asar: asar.reason },
    recovery: 'Reinstale o Servidor Manager ou rode npm run build && npm run update:installed.',
  }
}

const isCliMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isCliMain) {
  const target = process.argv[2]
  if (!target) {
    console.error('Uso: node validate-manager-ui-bundle.mjs <pasta-ui-dist>')
    process.exit(2)
  }
  const result = validateManagerUiBundle(target)
  if (!result.ok) {
    console.error(JSON.stringify(result, null, 2))
    process.exit(1)
  }
  console.log(JSON.stringify(result, null, 2))
}
