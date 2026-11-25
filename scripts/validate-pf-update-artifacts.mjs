import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateManagerUiBundle } from './validate-manager-ui-bundle.mjs'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const LOCAL_SERVICE_MARKERS = [
  'reconcileInstallationProgressOnStartup',
  'validateInstallationActionForSourceKeys',
  'classifyInstallationOriginMatch',
]

const MAIN_CJS_MARKERS = [
  'resolvePackagedUiIndex',
  'resolveUiForWindow',
  'packagedUiResolverModulePath',
  'validate-manager-ui-bundle.mjs',
]

export function validatePfUpdateRepoArtifacts(root = repoRoot) {
  const errors = []
  const distDir = path.join(root, 'dist')
  const serviceDir = path.join(root, 'dist-local-service')
  const serviceEntry = path.join(serviceDir, 'local-service.cjs')
  const hostEntry = path.join(serviceDir, 'service-host.cjs')
  const mainCjs = path.join(root, 'desktop', 'main.cjs')
  const updatesPath = path.join(root, 'public', 'cursor-updates.json')

  for (const file of [serviceEntry, hostEntry, mainCjs, path.join(distDir, 'index.html')]) {
    if (!fs.existsSync(file)) {
      errors.push(`Artefato obrigatório ausente: ${file}`)
    }
  }

  const uiCheck = validateManagerUiBundle(distDir)
  if (!uiCheck.ok) {
    errors.push(`dist/ inválido: ${uiCheck.reason}`)
    if (uiCheck.missing?.length) errors.push(`assets ausentes: ${uiCheck.missing.join(', ')}`)
  }

  if (fs.existsSync(serviceEntry)) {
    const serviceText = fs.readFileSync(serviceEntry, 'utf8')
    for (const marker of LOCAL_SERVICE_MARKERS) {
      if (!serviceText.includes(marker)) {
        errors.push(`dist-local-service/local-service.cjs sem marcador esperado: ${marker}`)
      }
    }
  }

  if (fs.existsSync(mainCjs)) {
    const mainText = fs.readFileSync(mainCjs, 'utf8')
    for (const marker of MAIN_CJS_MARKERS) {
      if (!mainText.includes(marker)) {
        errors.push(`desktop/main.cjs sem marcador esperado: ${marker}`)
      }
    }
  }

  if (!fs.existsSync(updatesPath)) {
    errors.push('public/cursor-updates.json ausente — execute npm run build antes do update.')
  } else {
    const updates = JSON.parse(fs.readFileSync(updatesPath, 'utf8'))
    const builtAtRaw = updates.lastBuiltAt
    const builtAt = typeof builtAtRaw === 'string' ? Date.parse(builtAtRaw) : NaN
    if (!Number.isFinite(builtAt)) {
      errors.push('cursor-updates.json sem lastBuiltAt válido — execute npm run build.')
    } else {
      const skewMs = 120_000
      for (const [label, filePath] of [
        ['dist/index.html', path.join(distDir, 'index.html')],
        ['local-service.cjs', serviceEntry],
      ]) {
        if (!fs.existsSync(filePath)) continue
        const mtime = fs.statSync(filePath).mtimeMs
        if (mtime < builtAt - skewMs) {
          errors.push(
            `${label} mais antigo que lastBuiltAt (${builtAtRaw}) — rode npm run build e npm run build:service.`,
          )
        }
      }
    }
  }

  const launcherSources = [
    'Start-ServidorManager-NoElectron.ps1',
    'Launch-ServidorManager.cmd',
    'Resolve-ManagerInstallRoot.ps1',
    'serve-manager-ui.mjs',
    'validate-manager-ui-bundle.mjs',
    'manager-localhost-only-guard.mjs',
  ]
  for (const name of launcherSources) {
    const src = path.join(root, 'scripts', name)
    if (!fs.existsSync(src)) {
      errors.push(`Script de launcher ausente no repo: scripts/${name}`)
    }
  }

  return { ok: errors.length === 0, errors, uiCheck: uiCheck.ok ? uiCheck : null }
}

export function validatePackagedMainCjsContent(mainText) {
  const errors = []
  for (const marker of MAIN_CJS_MARKERS) {
    if (!mainText.includes(marker)) {
      errors.push(`main.cjs empacotado sem marcador: ${marker}`)
    }
  }
  return { ok: errors.length === 0, errors }
}

const isCliMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))

if (isCliMain) {
  const mainFileArg = process.argv.indexOf('--validate-main')
  if (mainFileArg >= 0) {
    const mainPath = process.argv[mainFileArg + 1]
    if (!mainPath) {
      console.error('Uso: --validate-main <caminho-main.cjs>')
      process.exit(2)
    }
    const mainText = fs.readFileSync(path.resolve(mainPath), 'utf8')
    const mainResult = validatePackagedMainCjsContent(mainText)
    if (!mainResult.ok) {
      console.error(JSON.stringify(mainResult, null, 2))
      process.exit(1)
    }
    console.log(JSON.stringify({ ok: true, validated: mainPath }, null, 2))
    process.exit(0)
  }

  const result = validatePfUpdateRepoArtifacts()
  if (!result.ok) {
    console.error(JSON.stringify(result, null, 2))
    process.exit(1)
  }
  console.log(JSON.stringify({ ok: true, uiMainAsset: result.uiCheck?.mainJsAsset ?? null }, null, 2))
}
